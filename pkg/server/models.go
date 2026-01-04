package server

import "encoding/json"

type Config struct {
	AI *AIConfig `json:"ai,omitempty"`
}

type AIConfig struct {
	Model string `json:"model,omitempty"`
}

type Reflection struct {
	Services []ServiceReflection `json:"services"`
}

type ServiceReflection struct {
	Name    string             `json:"name"`
	Methods []MethodReflection `json:"methods"`
}

type MethodReflection struct {
	Name   string                 `json:"name"`
	Schema map[string]interface{} `json:"schema,omitempty"`
}

// MCP types

type McpFeature struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Schema      json.RawMessage `json:"schema,omitempty"`
}

type McpListFeaturesResponse struct {
	Tools     []McpFeature `json:"tools"`
	Resources []McpFeature `json:"resources"`
}

type McpListFeaturesRequest struct {
	Headers map[string]string `json:"headers,omitempty"`
}

type McpCallToolRequest struct {
	Name      string            `json:"name"`
	Arguments map[string]any    `json:"arguments,omitempty"`
	Headers   map[string]string `json:"headers,omitempty"`
}

type McpReadResourceRequest struct {
	URI     string            `json:"uri"`
	Headers map[string]string `json:"headers,omitempty"`
}

type McpResourceContent struct {
	URI      string `json:"uri"`
	MimeType string `json:"mimeType,omitempty"`
	Text     string `json:"text,omitempty"`
	Blob     string `json:"blob,omitempty"`
}

// Wrapper types for responses with timing

type McpResponseWrapper struct {
	Headers  map[string]string `json:"headers,omitempty"`
	Result   interface{}       `json:"result,omitempty"`
	Error    string            `json:"error,omitempty"`
	Duration int64             `json:"duration"`
}

type GrpcResponseWrapper struct {
	Body     string            `json:"body"`
	Metadata map[string]string `json:"metadata,omitempty"`
	Error    string            `json:"error,omitempty"`
	Duration int64             `json:"duration"`
}
