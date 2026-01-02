// Chat panel types for TanStack AI integration
import type { Request, HttpMethod, KeyValuePair, RequestBody } from './types';

// Request setters interface - matches useClient hook functions
export interface RequestSetters {
  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setHeaders: (headers: KeyValuePair[]) => void;
  setQuery: (query: KeyValuePair[]) => void;
  setBody: (body: RequestBody) => void;
}

// Environment for the HTTP request chat
export interface RequestChatEnvironment {
  request: Request;
  setters: RequestSetters;
  responseBodyText?: string;
}

// Generic chat environment (can be extended for other use cases)
export type ChatEnvironment = RequestChatEnvironment;

// Configuration for the chat adapter
export interface ChatAdapterConfig {
  id: string;
  name: string;
  placeholder: string;
}
