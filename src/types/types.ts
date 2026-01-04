import type { ClientRequest, ClientResponse } from './client';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export type Protocol = 'rest' | 'grpc' | 'mcp';

// MCP types
export type McpOperationType = 'discover' | 'tool' | 'resource';

export interface McpFeature {
  name: string;
  description?: string;
  schema?: Record<string, unknown>;
}

export interface McpListFeaturesResponse {
  tools: McpFeature[];
  resources: McpFeature[];
  error?: string;
}

export interface McpCallToolRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpContent {
  type: 'text' | 'image' | 'audio';
  text?: string;
  data?: string; // base64 encoded for image/audio
  mimeType?: string;
}

export interface McpCallToolResponse {
  content: McpContent[];
  isError?: boolean;
}

export interface McpReadResourceRequest {
  uri: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64 encoded
}

export interface McpReadResourceResponse {
  contents: McpResourceContent[];
}

// Variable types for dynamic content in JSON bodies
export type VariableType = 'file_base64' | 'file_dataurl' | 'base64' | 'timestamp' | 'uuid' | 'random_string';

export interface Variable {
  id: string;
  type: VariableType;
  // Display name (e.g., filename for files, or label for other types)
  name: string;
  // For file_base64/file_dataurl/base64: base64-encoded content
  data?: string;
  // MIME type for file variables
  mimeType?: string;
}

export type RequestBody =
  | { type: 'none' }
  | { type: 'json'; content: string }
  | { type: 'xml'; content: string }
  | { type: 'form-urlencoded'; data: KeyValuePair[] }
  | { type: 'form-data'; data: FormDataField[] }
  | { type: 'raw'; content: string }
  | { type: 'binary'; file: File | null; fileName: string };

export interface KeyValuePair {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
}

export interface FormDataField {
  id: string;
  enabled: boolean;
  key: string;
  type: 'text' | 'file';
  value: string; // for text fields
  file: File | null; // for file fields
  fileName: string; // display name for file
}

// Request data (editable) with execution state
export interface Request {
  id: string;
  name: string;
  protocol: Protocol;
  method: HttpMethod;
  url: string;
  query: KeyValuePair[];
  headers: KeyValuePair[];
  body: RequestBody;
  variables: Variable[];
  creationTime: number;
  executionTime: number | null;
  httpRequest: ClientRequest | null;
  httpResponse: ClientResponse | null;
  executing: boolean;
  // gRPC-specific fields
  grpcMethodSchema?: Record<string, unknown>;
  // MCP-specific fields
  mcpOperation?: McpOperationType;
  mcpSelectedTool?: string;
  mcpSelectedResource?: string;
  mcpFeatures?: McpListFeaturesResponse;
  mcpToolResponse?: McpCallToolResponse;
  mcpResourceResponse?: McpReadResourceResponse;
}
