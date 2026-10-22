package server

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/oauthex"
	"golang.org/x/oauth2"
)

// OAuth for MCP servers per the 2026-07-28 authorization spec. The SDK's
// AuthorizationCodeHandler performs discovery, client registration
// (pre-registered or dynamic), PKCE, the resource parameter, issuer checks and
// the step-up scope union; Prism adds the browser round trip, the callback
// listener and encrypted token storage.
//
// The desktop shell admits only its own window on the main listener, so the
// authorization server redirects the system browser to a separate loopback
// listener that runs while a flow is pending. Its fixed port lets users
// register the redirect URI with servers that need a pre-registered client.
const mcpAuthCallbackAddr = "127.0.0.1:9990"

const mcpAuthRedirectURL = "http://" + mcpAuthCallbackAddr + "/callback"

var errMcpAuthRequired = errors.New("authorization required")

type mcpAuthStore struct {
	mu       sync.Mutex
	servers  map[string]*mcpAuthState // by MCP server URL
	flows    map[string]*mcpAuthFlow  // pending flows by OAuth state
	callback *http.Server             // runs while flows are pending
}

type mcpAuthState struct {
	tokenSource oauth2.TokenSource
	// handler is kept so a step-up authorization requests the union of the
	// previously granted and the newly challenged scopes; client identifies
	// the credentials it was created with.
	handler *auth.AuthorizationCodeHandler
	client  string
	pending *mcpAuthFlow
	err     string
}

type mcpAuthFlow struct {
	state   string
	authURL string
	url     chan string
	result  chan mcpAuthResult
	done    chan struct{}
	err     error // set before done is closed
	cancel  context.CancelFunc
}

type mcpAuthResult struct {
	result *auth.AuthorizationResult
	err    error
}

type mcpStoredAuth struct {
	ServerURL string        `json:"serverUrl"`
	Config    oauth2.Config `json:"config"`
	Token     *oauth2.Token `json:"token"`
}

// handleMcpAuth handles /proxy/mcp/{scheme}/{host}/auth?server=...
// GET reports the authorization status, POST starts an authorization and
// returns the URL to open in a browser, DELETE forgets the stored token.
func (s *Server) handleMcpAuth(w http.ResponseWriter, r *http.Request) {
	serverURL, err := mcpTargetURL(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	serverURL, _ = normalizeMcpURL(serverURL)

	var status *McpAuthStatus

	switch r.Method {
	case http.MethodGet:
		status = s.mcpAuthStatus(serverURL)

	case http.MethodPost:
		var req McpAuthRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
			http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
			return
		}
		status, err = s.startMcpAuth(r.Context(), serverURL, req)
		if err != nil {
			http.Error(w, "authorization failed: "+err.Error(), http.StatusBadGateway)
			return
		}

	case http.MethodDelete:
		if err := s.signOutMcp(serverURL); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		status = s.mcpAuthStatus(serverURL)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

func (s *Server) mcpAuthStatus(serverURL string) *McpAuthStatus {
	status := &McpAuthStatus{Status: "none", RedirectURL: mcpAuthRedirectURL}

	s.mcpAuth.mu.Lock()
	state := s.mcpAuth.servers[serverURL]
	if state != nil && state.pending != nil {
		status.Status = "pending"
		status.AuthorizationURL = state.pending.authURL
		s.mcpAuth.mu.Unlock()
		return status
	}
	if state != nil {
		status.Error = state.err
	}
	s.mcpAuth.mu.Unlock()

	if ts := s.mcpTokenSource(serverURL); ts != nil {
		if _, err := ts.Token(); err != nil {
			status.Error = "stored token is no longer valid: " + err.Error()
		} else {
			status.Status = "authorized"
		}
	}
	return status
}

// startMcpAuth probes the server for its authorization challenge and starts
// the flow in the background; it returns once the authorization URL is known.
func (s *Server) startMcpAuth(ctx context.Context, serverURL string, req McpAuthRequest) (*McpAuthStatus, error) {
	probeReq, probeResp, err := s.probeMcpAuth(ctx, serverURL, req.Headers)
	if err != nil {
		return nil, err
	}
	if probeResp == nil {
		status := s.mcpAuthStatus(serverURL)
		if status.Status != "authorized" {
			status.Status = "not_required"
		}
		return status, nil
	}

	flowCtx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	flow := &mcpAuthFlow{
		url:    make(chan string, 1),
		result: make(chan mcpAuthResult, 1),
		done:   make(chan struct{}),
		cancel: cancel,
	}

	config := &auth.AuthorizationCodeHandlerConfig{
		RedirectURL:           mcpAuthRedirectURL,
		RequestRefreshToken:   true,
		AcceptUnadvertisedIss: true, // a matching iss is valid whether advertised or not
		AuthorizationCodeFetcher: func(ctx context.Context, args *auth.AuthorizationArgs) (*auth.AuthorizationResult, error) {
			u, err := url.Parse(args.URL)
			if err != nil {
				return nil, err
			}
			if err := s.registerMcpAuthFlow(u.Query().Get("state"), args.URL, flow); err != nil {
				return nil, err
			}
			flow.url <- args.URL
			select {
			case res := <-flow.result:
				return res.result, res.err
			case <-ctx.Done():
				return nil, fmt.Errorf("authorization was not completed: %w", ctx.Err())
			}
		},
		NewTokenSource: func(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (oauth2.TokenSource, error) {
			return s.newMcpTokenSource(ctx, serverURL, cfg, token, true), nil
		},
	}
	if req.ClientID != "" {
		client := &oauthex.ClientCredentials{ClientID: req.ClientID}
		if req.ClientSecret != "" {
			client.ClientSecretAuth = &oauthex.ClientSecretAuth{ClientSecret: req.ClientSecret}
		}
		config.PreregisteredClient = client
	} else {
		config.DynamicClientRegistrationConfig = &auth.DynamicClientRegistrationConfig{
			Metadata: &oauthex.ClientRegistrationMetadata{
				RedirectURIs:            []string{mcpAuthRedirectURL},
				ClientName:              "Prism",
				GrantTypes:              []string{"authorization_code", "refresh_token"},
				ResponseTypes:           []string{"code"},
				TokenEndpointAuthMethod: "none",
			},
		}
	}

	s.mcpAuth.mu.Lock()
	state := s.mcpAuthServer(serverURL)
	if state.pending != nil {
		state.pending.cancel()
	}
	if client := req.ClientID + "\x00" + req.ClientSecret; state.handler == nil || state.client != client {
		state.handler, err = auth.NewAuthorizationCodeHandler(config)
		state.client = client
	}
	handler := state.handler
	if err == nil {
		state.pending = flow
		state.err = ""
	}
	s.mcpAuth.mu.Unlock()
	if err != nil {
		cancel()
		return nil, err
	}

	go func() {
		err := handler.Authorize(flowCtx, probeReq, probeResp)
		cancel()
		s.finishMcpAuthFlow(serverURL, flow, handler, err)
	}()

	select {
	case authURL := <-flow.url:
		return &McpAuthStatus{Status: "pending", AuthorizationURL: authURL, RedirectURL: mcpAuthRedirectURL}, nil
	case <-flow.done:
		if flow.err != nil {
			return nil, flow.err
		}
		return s.mcpAuthStatus(serverURL), nil
	case <-ctx.Done():
		cancel()
		return nil, ctx.Err()
	}
}

// probeMcpAuth sends an initialize request and returns the request and
// response when the server challenges it (401, or 403 insufficient_scope for
// a step-up); the response is nil when the server accepted the request.
func (s *Server) probeMcpAuth(ctx context.Context, serverURL string, headers map[string]string) (*http.Request, *http.Response, error) {
	var base http.RoundTripper = http.DefaultTransport
	if ts := s.mcpTokenSource(serverURL); ts != nil {
		base = &tokenTransport{base: base, source: ts}
	}
	if len(headers) > 0 {
		base = &headerTransport{base: base, headers: headers}
	}
	client := &http.Client{Transport: base}

	body := `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"prism","version":"1.0.0"}}}`

	for _, method := range []string{http.MethodPost, http.MethodGet} {
		req, err := http.NewRequestWithContext(ctx, method, serverURL, nil)
		if err != nil {
			return nil, nil, err
		}
		if method == http.MethodPost {
			req.Body = io.NopCloser(strings.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Accept", "application/json, text/event-stream")
		} else {
			// Legacy SSE servers only accept GET on their endpoint
			req.Header.Set("Accept", "text/event-stream")
		}

		resp, err := client.Do(req)
		if err != nil {
			return nil, nil, err
		}

		challenged := resp.StatusCode == http.StatusUnauthorized ||
			(resp.StatusCode == http.StatusForbidden && strings.Contains(resp.Header.Get("WWW-Authenticate"), "insufficient_scope"))
		if challenged {
			// Authorize consumes the body; buffer it so the probe connection closes now.
			data, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
			resp.Body.Close()
			resp.Body = io.NopCloser(bytes.NewReader(data))
			return req, resp, nil
		}
		resp.Body.Close()

		if resp.StatusCode != http.StatusMethodNotAllowed {
			break
		}
	}
	return nil, nil, nil
}

func (s *Server) finishMcpAuthFlow(serverURL string, flow *mcpAuthFlow, handler *auth.AuthorizationCodeHandler, err error) {
	var ts oauth2.TokenSource
	if err == nil {
		ts, _ = handler.TokenSource(context.Background())
	}

	s.mcpAuth.mu.Lock()
	delete(s.mcpAuth.flows, flow.state)
	if state := s.mcpAuth.servers[serverURL]; state != nil && state.pending == flow {
		state.pending = nil
		if err != nil {
			state.err = err.Error()
		} else if ts != nil {
			state.tokenSource = ts
		}
	}
	if len(s.mcpAuth.flows) == 0 && s.mcpAuth.callback != nil {
		// Graceful, so a waiting callback page still receives the outcome.
		go s.mcpAuth.callback.Shutdown(context.Background())
		s.mcpAuth.callback = nil
	}
	s.mcpAuth.mu.Unlock()

	flow.err = err
	close(flow.done)
}

// registerMcpAuthFlow routes the callback for an OAuth state to its flow and
// starts the callback listener if it is not running yet.
func (s *Server) registerMcpAuthFlow(state, authURL string, flow *mcpAuthFlow) error {
	s.mcpAuth.mu.Lock()
	defer s.mcpAuth.mu.Unlock()

	if s.mcpAuth.callback == nil {
		ln, err := net.Listen("tcp", mcpAuthCallbackAddr)
		if err != nil {
			return fmt.Errorf("cannot listen for the authorization callback on %s: %w", mcpAuthCallbackAddr, err)
		}
		srv := &http.Server{Handler: http.HandlerFunc(s.handleMcpAuthCallback), ReadHeaderTimeout: 10 * time.Second}
		go srv.Serve(ln)
		s.mcpAuth.callback = srv
	}
	if s.mcpAuth.flows == nil {
		s.mcpAuth.flows = make(map[string]*mcpAuthFlow)
	}
	flow.state = state
	flow.authURL = authURL
	s.mcpAuth.flows[state] = flow
	return nil
}

// handleMcpAuthCallback receives the authorization server's redirect in the
// user's browser and shows the outcome once the token exchange is done.
func (s *Server) handleMcpAuthCallback(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/callback" {
		http.NotFound(w, r)
		return
	}

	query := r.URL.Query()

	s.mcpAuth.mu.Lock()
	flow := s.mcpAuth.flows[query.Get("state")]
	s.mcpAuth.mu.Unlock()

	if flow == nil {
		writeMcpAuthPage(w, http.StatusBadRequest, "Authorization expired", "This authorization request is unknown or has expired. Start it again in Prism.")
		return
	}

	var res mcpAuthResult
	if code := query.Get("error"); code != "" {
		res.err = fmt.Errorf("authorization server returned %s", code)
		if description := query.Get("error_description"); description != "" {
			res.err = fmt.Errorf("%w: %s", res.err, description)
		}
	} else {
		res.result = &auth.AuthorizationResult{Code: query.Get("code"), State: query.Get("state"), Iss: query.Get("iss")}
	}

	// Only the first redirect for a flow counts
	select {
	case flow.result <- res:
	default:
	}

	select {
	case <-flow.done:
	case <-r.Context().Done():
		return
	}

	if flow.err != nil {
		writeMcpAuthPage(w, http.StatusBadRequest, "Authorization failed", flow.err.Error())
		return
	}
	writeMcpAuthPage(w, http.StatusOK, "Authorized", "Prism is now authorized for this MCP server. You can close this tab.")
}

func writeMcpAuthPage(w http.ResponseWriter, status int, title, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	fmt.Fprintf(w, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Prism – %[1]s</title>
<body style="font:15px system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#262626">
<h1 style="font-size:1.25rem">%[1]s</h1><p>%[2]s</p></body>`, html.EscapeString(title), html.EscapeString(message))
}

func (s *Server) signOutMcp(serverURL string) error {
	s.mcpAuth.mu.Lock()
	if state := s.mcpAuth.servers[serverURL]; state != nil {
		if state.pending != nil {
			state.pending.cancel()
		}
		delete(s.mcpAuth.servers, serverURL)
	}
	s.mcpAuth.mu.Unlock()

	if err := os.Remove(s.mcpAuthPath(serverURL)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// mcpAuthServer returns the state for a server; the caller holds the lock.
func (s *Server) mcpAuthServer(serverURL string) *mcpAuthState {
	if s.mcpAuth.servers == nil {
		s.mcpAuth.servers = make(map[string]*mcpAuthState)
	}
	state := s.mcpAuth.servers[serverURL]
	if state == nil {
		state = &mcpAuthState{}
		s.mcpAuth.servers[serverURL] = state
	}
	return state
}

// mcpTokenSource returns the token source for a server, loading a stored
// token on first use, or nil when Prism is not authorized for it.
func (s *Server) mcpTokenSource(serverURL string) oauth2.TokenSource {
	s.mcpAuth.mu.Lock()
	if state := s.mcpAuth.servers[serverURL]; state != nil && state.tokenSource != nil {
		s.mcpAuth.mu.Unlock()
		return state.tokenSource
	}
	s.mcpAuth.mu.Unlock()

	data, err := s.readDataFile(s.mcpAuthPath(serverURL))
	if err != nil {
		return nil
	}
	var stored mcpStoredAuth
	if err := json.Unmarshal(data, &stored); err != nil || stored.Token == nil || stored.ServerURL != serverURL {
		return nil
	}
	ts := s.newMcpTokenSource(context.Background(), serverURL, &stored.Config, stored.Token, false)

	s.mcpAuth.mu.Lock()
	defer s.mcpAuth.mu.Unlock()
	state := s.mcpAuthServer(serverURL)
	if state.tokenSource == nil {
		state.tokenSource = ts
	}
	return state.tokenSource
}

// Tokens live outside the /data stores (".mcp-auth" is not a valid store
// name), so the UI API cannot read them back.
func (s *Server) mcpAuthPath(serverURL string) string {
	sum := sha256.Sum256([]byte(serverURL))
	return filepath.Join(s.dataDir, ".mcp-auth", hex.EncodeToString(sum[:])+".json")
}

func (s *Server) newMcpTokenSource(ctx context.Context, serverURL string, cfg *oauth2.Config, token *oauth2.Token, isNew bool) oauth2.TokenSource {
	stored := mcpStoredAuth{ServerURL: serverURL, Config: *cfg}
	save := func(token *oauth2.Token) {
		stored.Token = token
		data, err := json.Marshal(stored)
		if err == nil {
			err = s.writeDataFile(s.mcpAuthPath(serverURL), data)
		}
		if err != nil {
			log.Printf("could not save MCP token for %s: %v", serverURL, err)
		}
	}
	if isNew {
		save(token)
	}
	return &savingTokenSource{base: cfg.TokenSource(ctx, token), last: token.AccessToken, save: save}
}

// savingTokenSource persists refreshed tokens so the session survives restarts.
type savingTokenSource struct {
	base oauth2.TokenSource
	mu   sync.Mutex
	last string
	save func(*oauth2.Token)
}

func (t *savingTokenSource) Token() (*oauth2.Token, error) {
	token, err := t.base.Token()
	if err != nil {
		return nil, err
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if token.AccessToken != t.last {
		t.last = token.AccessToken
		t.save(token)
	}
	return token, nil
}

// tokenTransport adds the stored OAuth token unless the request already
// carries an explicit Authorization header. Without a usable token the
// request goes out unauthenticated and the server's challenge reaches the UI.
type tokenTransport struct {
	base   http.RoundTripper
	source oauth2.TokenSource
}

func (t *tokenTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.Header.Get("Authorization") == "" {
		if token, err := t.source.Token(); err == nil {
			req = req.Clone(req.Context())
			token.SetAuthHeader(req)
		}
	}
	return t.base.RoundTrip(req)
}
