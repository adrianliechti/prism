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

type McpCallToolRequest struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments,omitempty"`
}

type McpCallToolResponse struct {
	Content []McpContent `json:"content"`
	IsError bool         `json:"isError,omitempty"`
}

type McpContent struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	Data     string `json:"data,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
}

type McpReadResourceRequest struct {
	URI string `json:"uri"`
}

type McpReadResourceResponse struct {
	Contents []McpResourceContent `json:"contents"`
}

type McpResourceContent struct {
	URI      string `json:"uri"`
	MimeType string `json:"mimeType,omitempty"`
	Text     string `json:"text,omitempty"`
	Blob     string `json:"blob,omitempty"`
}
