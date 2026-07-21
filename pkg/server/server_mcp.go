package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"

	"github.com/modelcontextprotocol/go-sdk/jsonrpc"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// headerTransport wraps an http.RoundTripper to add custom headers
type headerTransport struct {
	base    http.RoundTripper
	headers map[string]string
}

func (t *headerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	for k, v := range t.headers {
		req.Header.Set(k, v)
	}
	return t.base.RoundTrip(req)
}

// statusTransport remembers the status code of the most recent HTTP response
// so a failed connect can be classified (the SDK only reports error strings).
type statusTransport struct {
	base   http.RoundTripper
	status atomic.Int64
}

func (t *statusTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := t.base.RoundTrip(req)
	if err == nil {
		t.status.Store(int64(resp.StatusCode))
	}
	return resp, err
}

// normalizeMcpURL maps the informal sse:// scheme (Go's HTTP client cannot
// dial it) to http://, additionally signaling that the legacy SSE transport
// should be tried first.
func normalizeMcpURL(serverURL string) (string, bool) {
	if rest, ok := strings.CutPrefix(serverURL, "sse://"); ok {
		return "http://" + rest, true
	}
	return serverURL, false
}

// mcpErrorText formats an MCP failure, surfacing the JSON-RPC error code the
// server responded with when there is one (the SDK's Error() drops it).
func mcpErrorText(prefix string, err error) string {
	var rpcErr *jsonrpc.Error
	if errors.As(err, &rpcErr) {
		return fmt.Sprintf("%s: %s (JSON-RPC error %d)", prefix, rpcErr.Message, rpcErr.Code)
	}
	return prefix + ": " + err.Error()
}

// connectMcp creates a new MCP client and connects to the server, preferring
// the transport that worked last time for this URL (Streamable HTTP first by
// default, legacy SSE as fallback). The caller must close the session.
func (s *Server) connectMcp(ctx context.Context, serverURL string, headers map[string]string) (*mcp.ClientSession, error) {
	serverURL, preferSSE := normalizeMcpURL(serverURL)

	client := mcp.NewClient(&mcp.Implementation{
		Name:    "prism",
		Version: "1.0.0",
	}, nil)

	transport := &statusTransport{base: http.DefaultTransport}
	if len(headers) > 0 {
		transport.base = &headerTransport{base: http.DefaultTransport, headers: headers}
	}
	httpClient := &http.Client{Transport: transport}

	attempts := [2]struct {
		kind      string
		transport mcp.Transport
	}{
		{"streamable", &mcp.StreamableClientTransport{Endpoint: serverURL, HTTPClient: httpClient}},
		{"sse", &mcp.SSEClientTransport{Endpoint: serverURL, HTTPClient: httpClient}},
	}
	if kind, ok := s.mcpTransports.Load(serverURL); preferSSE || (ok && kind == "sse") {
		attempts[0], attempts[1] = attempts[1], attempts[0]
	}

	session, err := client.Connect(ctx, attempts[0].transport, nil)
	if err == nil {
		s.mcpTransports.Store(serverURL, attempts[0].kind)
		return session, nil
	}
	if ctx.Err() != nil {
		return nil, err
	}

	// Per the spec's backwards-compatibility guidance, probe the other
	// transport only when the endpoint itself rejected the request (4xx).
	// Auth failures and network errors would fail identically on both, so
	// retrying only obscures the actual error.
	status := int(transport.status.Load())
	if status < 400 || status >= 500 || status == http.StatusUnauthorized || status == http.StatusForbidden {
		return nil, fmt.Errorf("%s: %w", attempts[0].kind, err)
	}

	session, secondErr := client.Connect(ctx, attempts[1].transport, nil)
	if secondErr != nil {
		return nil, errors.Join(
			fmt.Errorf("%s: %w", attempts[0].kind, err),
			fmt.Errorf("%s: %w", attempts[1].kind, secondErr),
		)
	}

	s.mcpTransports.Store(serverURL, attempts[1].kind)
	return session, nil
}

// mcpTargetURL returns the target server URL from the ?server= query
// parameter (the full URL including any path and query).
func mcpTargetURL(r *http.Request) (string, error) {
	if server := r.URL.Query().Get("server"); server != "" {
		return server, nil
	}
	return "", fmt.Errorf("missing server parameter")
}

// handleMcpListFeatures handles POST /proxy/mcp/{scheme}/{host}/features?server=...
// It connects to the MCP server, fetches tools and resources (best effort),
// and returns them combined; listing failures are reported per section.
// Request body: McpListFeaturesRequest (optional, for headers)
func (s *Server) handleMcpListFeatures(w http.ResponseWriter, r *http.Request) {
	serverURL, err := mcpTargetURL(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req McpListFeaturesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	session, err := s.connectMcp(ctx, serverURL, req.Headers)
	if err != nil {
		http.Error(w, "failed to connect to MCP server: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer session.Close()

	// Listing is attempted regardless of advertised capabilities (lax servers
	// omit them); errors are only surfaced for sections the server advertised.
	capabilities := session.InitializeResult().Capabilities

	response := McpListFeaturesResponse{
		Tools:     []McpFeature{},
		Resources: []McpFeature{},
	}

	for tool, err := range session.Tools(ctx, nil) {
		if err != nil {
			if capabilities.Tools != nil {
				response.Errors = append(response.Errors, mcpErrorText("failed to list tools", err))
			}
			break
		}
		feature := McpFeature{
			Name:        tool.Name,
			Title:       tool.Title,
			Description: tool.Description,
		}
		if tool.InputSchema != nil {
			schemaBytes, _ := json.Marshal(tool.InputSchema)
			feature.Schema = schemaBytes
		}
		if tool.OutputSchema != nil {
			schemaBytes, _ := json.Marshal(tool.OutputSchema)
			feature.OutputSchema = schemaBytes
		}
		if tool.Annotations != nil {
			annotationBytes, _ := json.Marshal(tool.Annotations)
			feature.Annotations = annotationBytes
		}
		response.Tools = append(response.Tools, feature)
	}

	for resource, err := range session.Resources(ctx, nil) {
		if err != nil {
			if capabilities.Resources != nil {
				response.Errors = append(response.Errors, mcpErrorText("failed to list resources", err))
			}
			break
		}
		response.Resources = append(response.Resources, McpFeature{
			Name:        resource.Name,
			Title:       resource.Title,
			Description: resource.Description,
			URI:         resource.URI,
			MimeType:    resource.MIMEType,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleMcpCallTool handles POST /proxy/mcp/{scheme}/{host}/tool/call?server=...
// Request body: McpCallToolRequest
func (s *Server) handleMcpCallTool(w http.ResponseWriter, r *http.Request) {
	serverURL, err := mcpTargetURL(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req McpCallToolRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	session, err := s.connectMcp(ctx, serverURL, req.Headers)
	if err != nil {
		http.Error(w, "failed to connect to MCP server: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer session.Close()

	// Call the tool and return as-is; encoder will base64 any binary content
	result, err := session.CallTool(ctx, &mcp.CallToolParams{
		Name:      req.Name,
		Arguments: req.Arguments,
	})
	if err != nil {
		http.Error(w, mcpErrorText("tool call failed", err), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// handleMcpReadResource handles POST /proxy/mcp/{scheme}/{host}/resource/call?server=...
// Request body: McpReadResourceRequest
func (s *Server) handleMcpReadResource(w http.ResponseWriter, r *http.Request) {
	serverURL, err := mcpTargetURL(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req McpReadResourceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	session, err := s.connectMcp(ctx, serverURL, req.Headers)
	if err != nil {
		http.Error(w, "failed to connect to MCP server: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer session.Close()

	// Read the resource and return as-is; encoder will base64 blobs
	result, err := session.ReadResource(ctx, &mcp.ReadResourceParams{
		URI: req.URI,
	})
	if err != nil {
		http.Error(w, mcpErrorText("resource read failed", err), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
