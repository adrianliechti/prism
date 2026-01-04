// Chat panel types for TanStack AI integration
import type { HttpMethod, KeyValuePair, RequestBody, OpenAIChatInput, OpenAIEmbeddingsInput, OpenAIBodyType, OpenAIImageFile } from './types';

// HTTP request setters interface
export interface HttpSetters {
  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setHeaders: (headers: KeyValuePair[]) => void;
  setQuery: (query: KeyValuePair[]) => void;
  setBody: (body: RequestBody) => void;
}

// gRPC request setters interface
export interface GrpcSetters {
  setUrl: (url: string) => void;
  setGrpcBody: (body: string) => void;
  setGrpcMetadata: (metadata: KeyValuePair[]) => void;
}

// MCP request setters interface
export interface McpSetters {
  setUrl: (url: string) => void;
  setMcpHeaders: (headers: KeyValuePair[]) => void;
  setMcpTool: (tool: { name: string; arguments: string; schema?: Record<string, unknown> } | undefined) => void;
  setMcpResource: (resource: { uri: string } | undefined) => void;
}

// OpenAI request setters interface
export interface OpenAISetters {
  setUrl: (url: string) => void;
  setOpenAIModel: (model: string) => void;
  setOpenAIBodyType: (bodyType: OpenAIBodyType) => void;
  setOpenAIChatInput: (input: OpenAIChatInput[]) => void;
  setOpenAIImagePrompt: (prompt: string) => void;
  setOpenAIImageFiles: (images: OpenAIImageFile[]) => void;
  setOpenAIAudioText: (text: string) => void;
  setOpenAIAudioVoice: (voice: string) => void;
  setOpenAIEmbeddingsInput: (input: OpenAIEmbeddingsInput[]) => void;
}

// Combined setters (all protocol setters in one interface)
export interface AllSetters extends HttpSetters, GrpcSetters, Omit<McpSetters, 'setUrl'>, Omit<OpenAISetters, 'setUrl'> {}

// Configuration for the chat adapter
export interface ChatAdapterConfig {
  id: string;
  name: string;
  placeholder: string;
}
