package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

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

// connectMcp creates a new MCP client and connects to the server, preferring
// the transport that worked last time for this URL (Streamable HTTP first by
// default, legacy SSE as fallback). The caller must close the session.
func (s *Server) connectMcp(ctx context.Context, serverURL string, headers map[string]string) (*mcp.ClientSession, error) {
	client := mcp.NewClient(&mcp.Implementation{
		Name:    "prism",
		Version: "1.0.0",
	}, nil)

	// Add custom headers via HTTP client if provided
	var httpClient *http.Client
	if len(headers) > 0 {
		httpClient = &http.Client{
			Transport: &headerTransport{
				base:    http.DefaultTransport,
				headers: headers,
			},
		}
	}

	streamable := &mcp.StreamableClientTransport{Endpoint: serverURL, HTTPClient: httpClient}
	sse := &mcp.SSEClientTransport{Endpoint: serverURL, HTTPClient: httpClient}

	first, second := mcp.Transport(streamable), mcp.Transport(sse)
	if kind, ok := s.mcpTransports.Load(serverURL); ok && kind == "sse" {
		first, second = second, first
	}

	session, err := client.Connect(ctx, first, nil)
	if err == nil {
		s.rememberMcpTransport(serverURL, first, streamable)
		return session, nil
	}
	if ctx.Err() != nil {
		return nil, err
	}

	session, secondErr := client.Connect(ctx, second, nil)
	if secondErr != nil {
		return nil, errors.Join(err, secondErr)
	}

	s.rememberMcpTransport(serverURL, second, streamable)
	return session, nil
}

func (s *Server) rememberMcpTransport(serverURL string, used mcp.Transport, streamable mcp.Transport) {
	if used == streamable {
		s.mcpTransports.Store(serverURL, "streamable")
	} else {
		s.mcpTransports.Store(serverURL, "sse")
	}
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
				response.Errors = append(response.Errors, "failed to list tools: "+err.Error())
			}
			break
		}
		feature := McpFeature{
			Name:        tool.Name,
			Description: tool.Description,
		}
		if tool.InputSchema != nil {
			schemaBytes, _ := json.Marshal(tool.InputSchema)
			feature.Schema = schemaBytes
		}
		response.Tools = append(response.Tools, feature)
	}

	for resource, err := range session.Resources(ctx, nil) {
		if err != nil {
			if capabilities.Resources != nil {
				response.Errors = append(response.Errors, "failed to list resources: "+err.Error())
			}
			break
		}
		response.Resources = append(response.Resources, McpFeature{
			Name:        resource.Name,
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
		http.Error(w, "tool call failed: "+err.Error(), http.StatusBadGateway)
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
		http.Error(w, "resource read failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
