package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/adrianliechti/prism/pkg/config"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// oauthMcpServer is an MCP server behind a minimal authorization server that
// supports dynamic client registration, as discovered via RFC 9728 metadata.
func oauthMcpServer(t *testing.T) (*httptest.Server, *atomic.Int32) {
	t.Helper()

	server := mcp.NewServer(&mcp.Implementation{Name: "protected"}, nil)
	mcp.AddTool(server, &mcp.Tool{Name: "secret"}, func(ctx context.Context, req *mcp.CallToolRequest, args struct{}) (*mcp.CallToolResult, any, error) {
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "ok"}}}, nil, nil
	})
	handler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, nil)

	var registrations atomic.Int32
	mux := http.NewServeMux()
	var base string
	writeJSON := func(w http.ResponseWriter, v any) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(v)
	}
	mux.HandleFunc("/.well-known/oauth-protected-resource/mcp", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"resource": base + "/mcp", "authorization_servers": []string{base}, "scopes_supported": []string{"tools"}})
	})
	mux.HandleFunc("/.well-known/oauth-authorization-server", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"issuer":                           base,
			"authorization_endpoint":           base + "/authorize",
			"token_endpoint":                   base + "/token",
			"registration_endpoint":            base + "/register",
			"response_types_supported":         []string{"code"},
			"code_challenge_methods_supported": []string{"S256"},
		})
	})
	mux.HandleFunc("/register", func(w http.ResponseWriter, r *http.Request) {
		registrations.Add(1)
		var meta map[string]any
		json.NewDecoder(r.Body).Decode(&meta)
		if meta["application_type"] != "native" || meta["token_endpoint_auth_method"] != "none" {
			t.Errorf("unexpected registration metadata: %v", meta)
		}
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, map[string]any{"client_id": "registered", "redirect_uris": meta["redirect_uris"], "token_endpoint_auth_method": "none"})
	})
	mux.HandleFunc("/authorize", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if q.Get("client_id") != "registered" || q.Get("code_challenge_method") != "S256" || q.Get("resource") != base+"/mcp" || q.Get("scope") != "tools" {
			t.Errorf("unexpected authorization request: %v", q)
		}
		http.Redirect(w, r, q.Get("redirect_uri")+"?code=granted&state="+url.QueryEscape(q.Get("state")), http.StatusFound)
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		if r.Form.Get("code") != "granted" || r.Form.Get("code_verifier") == "" || r.Form.Get("resource") != base+"/mcp" {
			t.Errorf("unexpected token request: %v", r.Form)
		}
		writeJSON(w, map[string]any{"access_token": "token", "token_type": "Bearer", "expires_in": 3600})
	})
	mux.HandleFunc("/mcp", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer token" {
			w.Header().Set("WWW-Authenticate", `Bearer resource_metadata="`+base+`/.well-known/oauth-protected-resource/mcp", scope="tools"`)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		handler.ServeHTTP(w, r)
	})

	upstream := httptest.NewServer(mux)
	t.Cleanup(upstream.Close)
	base = upstream.URL
	return upstream, &registrations
}

func mcpRequest(t *testing.T, s *Server, method, serverURL, suffix, body string) *httptest.ResponseRecorder {
	t.Helper()
	u, _ := url.Parse(serverURL)
	r := httptest.NewRequest(method, "http://localhost/proxy/mcp/http/"+u.Host+"/"+suffix+"?server="+url.QueryEscape(serverURL), strings.NewReader(body))
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}

func TestMcpOAuthFlow(t *testing.T) {
	upstream, registrations := oauthMcpServer(t)
	serverURL := upstream.URL + "/mcp"
	dataDir := t.TempDir()
	s, err := New(&config.Config{DataDir: dataDir})
	if err != nil {
		t.Fatal(err)
	}

	if w := mcpRequest(t, s, "POST", serverURL, "features", "{}"); w.Code != http.StatusUnauthorized {
		t.Fatalf("features before authorization: %d %s", w.Code, w.Body)
	}

	w := mcpRequest(t, s, "POST", serverURL, "auth", "{}")
	var status McpAuthStatus
	if err := json.Unmarshal(w.Body.Bytes(), &status); err != nil || status.Status != "pending" || status.AuthorizationURL == "" {
		t.Fatalf("start: %d %s", w.Code, w.Body)
	}

	// Act as the user's browser: the authorization server redirects to the callback listener.
	resp, err := http.Get(status.AuthorizationURL)
	if err != nil {
		t.Fatal(err)
	}
	page, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || !strings.Contains(string(page), "Authorized") {
		t.Fatalf("callback page: %d %s", resp.StatusCode, page)
	}

	json.Unmarshal(mcpRequest(t, s, "GET", serverURL, "auth", "").Body.Bytes(), &status)
	if status.Status != "authorized" {
		t.Fatalf("status after callback: %+v", status)
	}
	if w := mcpRequest(t, s, "POST", serverURL, "features", "{}"); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"secret"`) {
		t.Fatalf("features after authorization: %d %s", w.Code, w.Body)
	}

	// The token is stored encrypted and survives a restart.
	restarted, err := New(&config.Config{DataDir: dataDir})
	if err != nil {
		t.Fatal(err)
	}
	if w := mcpRequest(t, restarted, "POST", serverURL, "tool/call", `{"name":"secret"}`); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"ok"`) {
		t.Fatalf("tool call after restart: %d %s", w.Code, w.Body)
	}

	if w := mcpRequest(t, restarted, "DELETE", serverURL, "auth", ""); w.Code != http.StatusOK {
		t.Fatalf("sign out: %d %s", w.Code, w.Body)
	}
	if w := mcpRequest(t, restarted, "POST", serverURL, "features", "{}"); w.Code != http.StatusUnauthorized {
		t.Fatalf("features after sign out: %d %s", w.Code, w.Body)
	}
	if n := registrations.Load(); n != 1 {
		t.Fatalf("expected one dynamic registration, got %d", n)
	}
}
