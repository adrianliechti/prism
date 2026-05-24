import { createContext } from 'react';
import type {
  HttpMethod,
  KeyValuePair,
  RequestBody,
  Variable,
  HttpRequest,
  Protocol,
  McpListFeaturesResponse,
  OpenAIChatInput,
  OpenAIEmbeddingsInput,
  OpenAIBodyType,
  OpenAIImageFile,
} from '../types/types';
import type { Request } from '../lib/data';

export interface ClientContextType {
  request: Request;
  isExecuting: boolean;
  history: Request[];
  sidebarCollapsed: boolean;

  setProtocol: (protocol: Protocol) => void;
  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setHeaders: (headers: KeyValuePair[]) => void;
  setQuery: (params: KeyValuePair[]) => void;
  setBody: (body: RequestBody) => void;
  setVariables: (variables: Variable[]) => void;
  setOptions: (options: Partial<HttpRequest['options']>) => void;
  executeRequest: () => Promise<void>;
  clearResponse: () => void;
  newRequest: () => void;

  setGrpcBody: (body: string) => void;
  setGrpcMetadata: (metadata: KeyValuePair[]) => void;
  setGrpcMethodSchema: (schema: Record<string, unknown> | undefined) => void;

  setMcpTool: (tool: { name: string; arguments: string; schema?: Record<string, unknown> } | undefined) => void;
  setMcpResource: (resource: { uri: string } | undefined) => void;
  setMcpHeaders: (headers: KeyValuePair[]) => void;
  discoverMcpFeatures: () => Promise<McpListFeaturesResponse | null>;

  setOpenAIModel: (model: string) => void;
  setOpenAIApiKey: (apiKey: string) => void;
  setOpenAIBodyType: (bodyType: OpenAIBodyType) => void;
  setOpenAIChatInput: (input: OpenAIChatInput[]) => void;
  setOpenAIImagePrompt: (prompt: string) => void;
  setOpenAIImageFiles: (images: OpenAIImageFile[]) => void;
  setOpenAIAudioText: (text: string) => void;
  setOpenAIAudioVoice: (voice: string) => void;
  setOpenAITranscriptionFile: (file: string) => void;
  setOpenAIEmbeddingsInput: (input: OpenAIEmbeddingsInput[]) => void;

  loadFromHistory: (entry: Request) => void;
  clearHistory: () => void;
  deleteHistoryEntry: (id: string) => void;

  toggleSidebar: () => void;

  aiPanelOpen: boolean;
  toggleAiPanel: () => void;
}

export const ClientContext = createContext<ClientContextType | null>(null);
