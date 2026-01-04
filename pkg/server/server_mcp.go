package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// connectMcp creates a new MCP client, connects to the server via Streamable HTTP,
// and returns the session. The caller is responsible for closing the session.
func connectMcp(ctx context.Context, serverURL string) (*mcp.ClientSession, error) {
	client := mcp.NewClient(&mcp.Implementation{
		Name:    "prism",
		Version: "1.0.0",
	}, nil)

	transport := &mcp.StreamableClientTransport{
		Endpoint: serverURL,
	}

	session, err := client.Connect(ctx, transport, nil)
	if err != nil {
		return nil, err
	}

	return session, nil
}

func mcpTargetURL(r *http.Request) (string, error) {
	if server := r.URL.Query().Get("server"); server != "" {
		return server, nil
	}

	scheme := r.PathValue("scheme")
	host := r.PathValue("host")
	path := r.URL.Query().Get("path")

	if scheme == "" || host == "" {
		return "", fmt.Errorf("missing scheme or host")
	}

	target := scheme + "://" + host
	if path != "" {
		target += "/" + strings.TrimPrefix(path, "/")
	}

	return target, nil
}

// handleMcpListFeatures handles GET /proxy/mcp/{scheme}/{host}/features?path=...
// It connects to the MCP server, fetches tools and resources, and returns them combined.
func (s *Server) handleMcpListFeatures(w http.ResponseWriter, r *http.Request) {
	serverURL, err := mcpTargetURL(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	session, err := connectMcp(ctx, serverURL)
	if err != nil {
		http.Error(w, "failed to connect to MCP server: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer session.Close()

	// Fetch tools
	var tools []McpFeature
	toolsResult, err := session.ListTools(ctx, nil)
	if err == nil && toolsResult != nil {
		for _, tool := range toolsResult.Tools {
			feature := McpFeature{
				Name:        tool.Name,
				Description: tool.Description,
			}
			if tool.InputSchema != nil {
				schemaBytes, _ := json.Marshal(tool.InputSchema)
				feature.Schema = schemaBytes
			}
			tools = append(tools, feature)
		}
	}

	// Fetch resources
	var resources []McpFeature
	resourcesResult, err := session.ListResources(ctx, nil)
	if err == nil && resourcesResult != nil {
		for _, resource := range resourcesResult.Resources {
			feature := McpFeature{
				Name:        resource.Name,
				Description: resource.Description,
			}
			// Resources don't have a schema, but we include URI info
			if resource.URI != "" {
				uriInfo := map[string]string{"uri": resource.URI}
				if resource.MIMEType != "" {
					uriInfo["mimeType"] = resource.MIMEType
				}
				schemaBytes, _ := json.Marshal(uriInfo)
				feature.Schema = schemaBytes
			}
			resources = append(resources, feature)
		}
	}

	response := McpListFeaturesResponse{
		Tools:     tools,
		Resources: resources,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleMcpCallTool handles POST /proxy/mcp/{scheme}/{host}/tool/call?path=...
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

	session, err := connectMcp(ctx, serverURL)
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
		http.Error(w, "tool call failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// handleMcpReadResource handles POST /proxy/mcp/{scheme}/{host}/resource/call?path=...
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

	session, err := connectMcp(ctx, serverURL)
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
		http.Error(w, "resource read failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
