import { createCollection } from '@tanstack/react-db';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { QueryClient } from '@tanstack/react-query';
import type {
  Request,
  RequestBody,
  KeyValuePair,
  HttpMethod,
  Protocol,
  Variable,
  McpCallToolResponse,
  McpReadResourceResponse,
  HttpRequestData,
  GrpcRequestData,
  McpRequestData,
  OpenAIRequestData,
  HttpRequest,
  HttpResponse,
  OpenAIChatInput,
  OpenAITextOutput,
  OpenAIImageOutput,
  OpenAIAudioOutput,
  OpenAITranscriptionOutput,
  OpenAIEmbeddingsOutput
} from '../types/types';

// Re-export types for consumers
export type {
  Request,
  RequestBody,
  KeyValuePair,
  HttpMethod,
  Protocol,
  Variable,
  HttpRequest,
  HttpResponse,
  McpCallToolResponse,
  McpReadResourceResponse,
  HttpRequestData,
  GrpcRequestData,
  McpRequestData,
  OpenAIRequestData,
};

// Shared utility for generating unique IDs
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// ============================================================================
// Serialization Types (internal)
// ============================================================================

// HTTP-specific settings
interface HttpSettings {
  method: HttpMethod;
  url: string;
  query: KeyValuePair[];
  headers: KeyValuePair[];
  body: RequestBody;
  response?: {
    status: string;
    statusCode: number;
    headers: Record<string, string>;
    body: string;        // base64 encoded
    bodyType: string;
    duration: number;
    error?: string;
  };
}

// gRPC-specific settings
interface GrpcSettings {
  server: string;      // host:port
  service: string;     // service name
  method: string;      // method name
  schema?: Record<string, unknown>;
  body: string;        // JSON request body
  response?: {
    body: string;      // JSON response (plain text, not base64)
    metadata?: Record<string, string>;
    duration: number;
    error?: string;
  };
}

// MCP-specific settings
interface McpSettings {
  url: string;         // MCP server URL
  headers?: KeyValuePair[]; // MCP request headers
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

// OpenAI-specific settings
interface OpenAISettings {
  url: string;         // OpenAI API URL
  model: string;       // Selected model
  chat?: {
    input: OpenAIChatInput[];
  };
  image?: {
    prompt: string;    // Image generation prompt
  };
  audio?: {
    text: string;      // Text to convert to speech
    voice?: string;
  };
  transcription?: {
    file: string;      // Data URL (data:audio/...;base64,...)
  };
  embeddings?: {
    text: string;      // Text to convert to embeddings
  };
  response?: {
    result?: OpenAITextOutput | OpenAIImageOutput | OpenAIAudioOutput | OpenAITranscriptionOutput | OpenAIEmbeddingsOutput;
    duration: number;
    error?: string;
  };
}

interface SerializedRequest {
  id: string;
  name: string;
  variables: Variable[];
  creationTime: number;
  executionTime: number | null;
  // Protocol-specific settings (exactly one will be populated)
  http?: HttpSettings;
  grpc?: GrpcSettings;
  mcp?: McpSettings;
  openai?: OpenAISettings;
}

// ============================================================================
// Blob <-> Base64 Conversion Utilities
// ============================================================================

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:application/json;base64,")
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, type: string): Blob {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type });
}

// ============================================================================
// Serialization / Deserialization
// ============================================================================

// Parse gRPC URL: grpc://host:port/service/method
function parseGrpcUrl(url: string): { server: string; service: string; method: string } {
  const match = url.match(/^grpc:\/\/([^/]+)\/(.+)\/([^/]+)$/);
  if (match) {
    return { server: match[1], service: match[2], method: match[3] };
  }
  return { server: url.replace(/^grpc:\/\//, ''), service: '', method: '' };
}

// Build gRPC URL from components
function buildGrpcUrl(server: string, service: string, method: string): string {
  if (service && method) {
    return `grpc://${server}/${service}/${method}`;
  }
  return `grpc://${server}`;
}

async function serializeRequest(req: Request): Promise<SerializedRequest> {
  const base: SerializedRequest = {
    id: req.id,
    name: req.name,
    variables: req.variables ?? [],
    creationTime: req.creationTime,
    executionTime: req.executionTime,
  };

  switch (req.protocol) {
    case 'grpc': {
      const { server, service, method } = parseGrpcUrl(req.url);
      
      base.grpc = {
        server,
        service,
        method,
        schema: req.grpc?.schema,
        body: req.grpc?.body ?? '',
        response: req.grpc?.response,
      };
      break;
    }
    case 'mcp': {
      base.mcp = {
        url: req.url,
        headers: req.mcp?.headers,
        tool: req.mcp?.tool,
        resource: req.mcp?.resource,
        response: req.mcp?.response,
      };
      break;
    }
    case 'openai': {
      base.openai = {
        url: req.url,
        model: req.openai?.model ?? '',
        chat: req.openai?.chat,
        image: req.openai?.image,
        audio: req.openai?.audio,
        transcription: req.openai?.transcription,
        embeddings: req.openai?.embeddings,
        response: req.openai?.response,
      };
      break;
    }
    case 'rest':
    default: {
      // Handle body serialization - strip File objects
      let body = req.http?.body ?? { type: 'none' as const };
      if (body.type === 'form-data') {
        body = {
          ...body,
          data: body.data.map((f) => ({ ...f, file: null })),
        };
      } else if (body.type === 'binary') {
        body = { ...body, file: null };
      }

      // Serialize HTTP response with base64 body
      let httpResponse: HttpSettings['response'];
      if (req.http?.response) {
        const responseBody = req.http.response.body instanceof Blob 
          ? await blobToBase64(req.http.response.body) 
          : '';
        const bodyType = req.http.response.body instanceof Blob 
          ? req.http.response.body.type 
          : 'application/octet-stream';
        
        httpResponse = {
          status: req.http.response.status,
          statusCode: req.http.response.statusCode,
          headers: req.http.response.headers,
          body: responseBody,
          bodyType,
          duration: req.http.response.duration,
          error: req.http.response.error,
        };
      }

      base.http = {
        method: req.http?.method ?? 'GET',
        url: req.url,
        query: req.http?.query ?? [],
        headers: req.http?.headers ?? [],
        body: body as RequestBody,
        response: httpResponse,
      };
      break;
    }
  }

  return base;
}

function deserializeRequest(serialized: SerializedRequest): Request {
  // Infer protocol from which settings object is present
  const protocol: Protocol = serialized.grpc ? 'grpc' : serialized.mcp ? 'mcp' : serialized.openai ? 'openai' : 'rest';

  const base: Request = {
    id: serialized.id,
    name: serialized.name,
    protocol,
    url: '',
    variables: serialized.variables ?? [],
    creationTime: serialized.creationTime,
    executionTime: serialized.executionTime,
    executing: false,
  };

  if (serialized.grpc) {
    const grpc = serialized.grpc;
    base.url = buildGrpcUrl(grpc.server, grpc.service, grpc.method);
    base.grpc = {
      schema: grpc.schema,
      body: grpc.body || '',
      metadata: [],
      response: grpc.response,
    };
  } else if (serialized.mcp) {
    const mcp = serialized.mcp;
    base.url = mcp.url;
    base.mcp = {
      headers: mcp.headers ?? [],
      tool: mcp.tool,
      resource: mcp.resource,
      response: mcp.response,
    };
  } else if (serialized.openai) {
    const openai = serialized.openai;
    base.url = openai.url;
    
    base.openai = {
      model: openai.model,
      chat: openai.chat,
      image: openai.image,
      audio: openai.audio,
      transcription: openai.transcription,
      embeddings: openai.embeddings,
      response: openai.response,
    };
  } else if (serialized.http) {
    const http = serialized.http;
    base.url = http.url;
    base.http = {
      method: http.method,
      query: http.query,
      headers: http.headers,
      body: http.body,
      request: null,
      response: http.response ? {
        status: http.response.status,
        statusCode: http.response.statusCode,
        headers: http.response.headers,
        body: http.response.body 
          ? base64ToBlob(http.response.body, http.response.bodyType)
          : new Blob([]),
        duration: http.response.duration,
        error: http.response.error,
      } : null,
    };
  }

  return base;
}

// ============================================================================
// REST API Helpers
// ============================================================================

const STORE_NAME = 'requests';

async function fetchAllRequests(): Promise<SerializedRequest[]> {
  const response = await fetch(`/data/${STORE_NAME}`);
  if (!response.ok) {
    throw new Error(`Failed to list entries: ${response.statusText}`);
  }
  const entries: { id: string; updated?: string }[] = await response.json();

  const requests = await Promise.all(
    entries.map(async (entry) => {
      const res = await fetch(`/data/${STORE_NAME}/${encodeURIComponent(entry.id)}`);
      if (!res.ok) return null;
      const data: SerializedRequest = await res.json();
      return data;
    })
  );

  return requests.filter((r): r is SerializedRequest => r !== null);
}

async function saveRequestToServer(serialized: SerializedRequest): Promise<void> {
  const response = await fetch(`/data/${STORE_NAME}/${encodeURIComponent(serialized.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serialized),
  });
  if (!response.ok) {
    throw new Error(`Failed to save request: ${response.statusText}`);
  }
}

async function deleteRequestFromServer(id: string): Promise<void> {
  const response = await fetch(`/data/${STORE_NAME}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete request: ${response.statusText}`);
  }
}

// ============================================================================
// QueryClient and Collection
// ============================================================================

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    },
  },
});

export const requestsCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['requests'],
    queryFn: async (): Promise<Request[]> => {
      const serialized = await fetchAllRequests();
      return serialized.map(deserializeRequest);
    },
    getKey: (item: Request) => item.id,
    queryClient,

    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const request = mutation.modified as Request;
          const serialized = await serializeRequest(request);
          await saveRequestToServer(serialized);
        })
      );
    },

    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const request = mutation.modified as Request;
          const serialized = await serializeRequest(request);
          await saveRequestToServer(serialized);
        })
      );
    },

    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const original = mutation.original as Request;
          await deleteRequestFromServer(original.id);
        })
      );
    },
  })
);

export async function clearAllRequests(): Promise<void> {
  const ids = Array.from(requestsCollection.state.keys()) as string[];
  ids.forEach((id) => requestsCollection.delete(id));
}