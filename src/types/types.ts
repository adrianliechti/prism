export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export type Protocol = 'rest' | 'grpc' | 'mcp' | 'openai';

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
  type: 'text' | 'image' | 'audio' | 'resource' | 'resource_link';
  text?: string;
  data?: string; // base64 encoded for image/audio
  mimeType?: string;
  // For resource type (embedded resources)
  resource?: {
    uri: string;
    text?: string;
    blob?: string;
    mimeType?: string;
  };
  // For resource_link type
  uri?: string;
  name?: string;
  description?: string;
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

// HTTP request/response (stored in history for reference)
export interface HttpRequest {
  method: string;
  url: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
  options: {
    insecure: boolean;
    redirect: boolean;
  };
}

export interface HttpResponse {
  status: string;
  statusCode: number;
  headers: Record<string, string>;
  body: Blob;
  duration: number;
  error?: string;
}

// Protocol-specific request data types
export interface HttpRequestData {
  method: HttpMethod;
  query: KeyValuePair[];
  headers: KeyValuePair[];
  body: RequestBody;
  request: HttpRequest | null;
  response: HttpResponse | null;
}

export interface GrpcRequestData {
  schema?: Record<string, unknown>; // Optional schema for IDE hints/validation
  body: string; // JSON message content
  metadata: KeyValuePair[]; // gRPC metadata (headers)
  response?: {
    body: string;
    metadata?: Record<string, string>;
    duration: number;
    error?: string;
  };
}

export interface McpRequestData {
  headers: KeyValuePair[]; // MCP request headers (for auth, etc.)
  tool?: {
    name: string;
    arguments: string; // JSON parameters
    schema?: Record<string, unknown>; // Tool input schema for fill button
  };
  resource?: {
    uri: string;
  };
  response?: {
    result?: McpCallToolResponse | McpReadResourceResponse;
    duration: number;
    error?: string;
  };
}

// OpenAI types
export type OpenAIBodyType = 'chat' | 'image' | 'audio' | 'transcription' | 'embeddings';

export interface OpenAITextContent {
  type: 'input_text';
  text: string;
}

export interface OpenAIImageContent {
  type: 'input_image';
  image_url: string;
}

export interface OpenAIFileContent {
  type: 'input_file';
  file_data: string; // base64 encoded
  filename: string;
}

export type OpenAIChatContent = OpenAITextContent | OpenAIImageContent | OpenAIFileContent;

export interface OpenAIChatInput {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: OpenAIChatContent[];
}

export interface OpenAITextOutput {
  type: 'text';
  text: string;
}

export interface OpenAIImageOutput {
  type: 'image';
  image: string;
}

export interface OpenAIAudioOutput {
  type: 'audio';
  audio: string; // base64 encoded audio data
}

export interface OpenAITranscriptionOutput {
  type: 'transcription';
  text: string;
}

export interface OpenAIEmbeddingsOutput {
  type: 'embeddings';
  embeddings: number[];
}

export interface OpenAIRequestData {
  model: string;
  chat?: {
    input: OpenAIChatInput[];
  };
  image?: {
    prompt: string;
  };
  audio?: {
    text: string;
    voice?: string;
  };
  transcription?: {
    file: string; // data URL (data:audio/...;base64,...)
  };
  embeddings?: {
    text: string;
  };
  response?: {
    result?: OpenAITextOutput | OpenAIImageOutput | OpenAIAudioOutput | OpenAITranscriptionOutput | OpenAIEmbeddingsOutput;
    duration: number;
    error?: string;
  };
}

// Request data (editable) with execution state
export interface Request {
  id: string;
  name: string;
  protocol: Protocol;
  url: string;
  variables: Variable[];
  creationTime: number;
  executionTime: number | null;
  executing: boolean;
  // Protocol-specific data (one populated based on protocol)
  http?: HttpRequestData;
  grpc?: GrpcRequestData;
  mcp?: McpRequestData;
  openai?: OpenAIRequestData;
}
