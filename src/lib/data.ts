import { createCollection } from '@tanstack/react-db';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { QueryClient } from '@tanstack/react-query';
import { normalizeRequest } from './requestUtils.ts';
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
  McpOAuthClient,
  OpenAIRequestData,
  HttpRequest,
  HttpResponse,
  OpenAIBodyType,
  OpenAIChatInput,
  OpenAIEmbeddingsInput,
  OpenAIImageFile,
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
  return crypto.randomUUID();
}

interface SavedFile { data: string; type: string; name: string; lastModified: number }
type SavedBody = Exclude<RequestBody, { type: 'binary' | 'form-data' }>
  | (Extract<RequestBody, { type: 'binary' }> & { attachment?: SavedFile })
  | { type: 'form-data'; data: Array<import('../types/types').FormDataField & { attachment?: SavedFile }> };

// ============================================================================
// Serialization Types (internal)
// ============================================================================

// HTTP-specific settings
interface HttpSettings {
  method: HttpMethod;
  url: string;
  query: KeyValuePair[];
  headers: KeyValuePair[];
  body: SavedBody;
  bodyDrafts?: Partial<Record<RequestBody['type'], SavedBody>>;
  queryInUrl?: boolean;
  options: HttpRequest['options'];
  response?: {
    status: string;
    statusCode: number;
    headers: Record<string, string>;
    body: string;        // base64 encoded ('' when omitted for size)
    bodyType: string;
    bodyOmitted?: boolean;
    duration: number;
    error?: string;
    interrupted?: string;
  };
}

// gRPC-specific settings
interface GrpcSettings {
  url: string;         // full grpc:// or grpcs:// URL
  schema?: Record<string, unknown>;
  body: string;        // JSON request body
  metadata: KeyValuePair[];
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
  headers: KeyValuePair[]; // MCP request headers
  oauth?: McpOAuthClient;
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
  apiKey?: string;
  bodyType?: OpenAIBodyType;
  chat?: {
    input: OpenAIChatInput[];
  };
  image?: {
    prompt: string;    // Image generation or edit prompt
    images?: OpenAIImageFile[]; // Images for edit mode
  };
  audio?: {
    text: string;      // Text to convert to speech
    voice?: string;
  };
  transcription?: {
    file: string;      // Data URL (data:audio/...;base64,...)
  };
  embeddings?: {
    input: OpenAIEmbeddingsInput[];
  };
  response?: {
    result?: OpenAITextOutput | OpenAIImageOutput | OpenAIAudioOutput | OpenAITranscriptionOutput | OpenAIEmbeddingsOutput;
    duration: number;
    error?: string;
  };
}

interface SerializedRequest {
  id: string;
  requestId?: string;
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

// Response bodies above this size are kept in memory but not persisted.
const MAX_PERSISTED_BODY_SIZE = 2 * 1024 * 1024;

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 32768) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return btoa(chunks.join(''));
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

const fileCache = new WeakMap<File, Promise<SavedFile | undefined>>();
function saveFile(file: File | null): Promise<SavedFile | undefined> {
  if (!file || file.size > 8 * 1024 * 1024) return Promise.resolve(undefined);
  let saved = fileCache.get(file);
  if (!saved) {
    saved = blobToBase64(file).then(data => ({ data, type: file.type, name: file.name, lastModified: file.lastModified }));
    fileCache.set(file, saved);
  }
  return saved;
}

async function saveBody(body: RequestBody): Promise<SavedBody> {
  if (body.type === 'binary') return { ...body, file: null, attachment: await saveFile(body.file) };
  if (body.type === 'form-data') return { ...body, data: await Promise.all(body.data.map(async f => ({ ...f, file: null, attachment: await saveFile(f.file) }))) };
  return body;
}

function restoreFile(file?: SavedFile): File | null {
  return file ? new File([base64ToBlob(file.data, file.type)], file.name, { type: file.type, lastModified: file.lastModified }) : null;
}

function restoreBody(body: SavedBody): RequestBody {
  if (body.type === 'binary') return { type: 'binary', file: restoreFile(body.attachment), fileName: body.fileName };
  if (body.type === 'form-data') return { type: 'form-data', data: body.data.map(f => ({ ...f, file: restoreFile((f as typeof f & { attachment?: SavedFile }).attachment) })) };
  return body;
}

export async function serializeRequest(req: Request): Promise<SerializedRequest> {
  const base: SerializedRequest = {
    id: req.id,
    requestId: req.requestId,
    name: req.name,
    variables: req.variables ?? [],
    creationTime: req.creationTime,
    executionTime: req.executionTime,
  };

  switch (req.protocol) {
    case 'grpc': {
      base.grpc = {
        url: req.url,
        schema: req.grpc?.schema,
        body: req.grpc?.body ?? '',
        metadata: req.grpc?.metadata ?? [],
        response: req.grpc?.response,
      };
      break;
    }
    case 'mcp': {
      base.mcp = {
        url: req.url,
        headers: req.mcp?.headers ?? [],
        oauth: req.mcp?.oauth,
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
        apiKey: req.openai?.apiKey,
        bodyType: req.openai?.bodyType,
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
      const body = await saveBody(req.http?.body ?? { type: 'none' });
      const bodyDrafts = Object.fromEntries(await Promise.all(Object.entries(req.http?.bodyDrafts ?? {}).filter(([type]) => type !== body.type).map(async ([type, value]) => [type, await saveBody(value)])));

      // Serialize HTTP response with base64 body; very large bodies are not
      // persisted (they would bloat every save and slow down startup).
      let httpResponse: HttpSettings['response'];
      if (req.http?.response) {
        const bodyBlob = req.http.response.body instanceof Blob ? req.http.response.body : null;
        const bodyOmitted = req.http.response.bodyOmitted || (bodyBlob !== null && bodyBlob.size > MAX_PERSISTED_BODY_SIZE);
        const responseBody = bodyBlob && !bodyOmitted ? await blobToBase64(bodyBlob) : '';
        const bodyType = bodyBlob ? bodyBlob.type : 'application/octet-stream';

        httpResponse = {
          status: req.http.response.status,
          statusCode: req.http.response.statusCode,
          headers: req.http.response.headers,
          body: responseBody,
          bodyType,
          bodyOmitted: bodyOmitted || undefined,
          duration: req.http.response.duration,
          error: req.http.response.error,
          interrupted: req.http.response.interrupted,
        };
      }

      base.http = {
        method: req.http?.method ?? 'GET',
        url: req.url,
        query: req.http?.query ?? [],
        headers: req.http?.headers ?? [],
        body,
        bodyDrafts,
        queryInUrl: req.http?.queryInUrl,
        options: req.http?.options ?? { insecure: false, redirect: true },
        response: httpResponse,
      };
      break;
    }
  }

  return base;
}

export function deserializeRequest(serialized: SerializedRequest): Request {
  // Infer protocol from which settings object is present
  const protocol: Protocol = serialized.grpc ? 'grpc' : serialized.mcp ? 'mcp' : serialized.openai ? 'openai' : 'rest';

  const base: Request = {
    id: serialized.id,
    requestId: serialized.requestId,
    name: serialized.name,
    protocol,
    url: '',
    variables: serialized.variables ?? [],
    creationTime: serialized.creationTime,
    executionTime: serialized.executionTime,
  };

  if (serialized.grpc) {
    const grpc = serialized.grpc;
    base.url = grpc.url;
    base.grpc = {
      schema: grpc.schema,
      body: grpc.body || '',
      metadata: grpc.metadata,
      response: grpc.response,
    };
  } else if (serialized.mcp) {
    const mcp = serialized.mcp;
    base.url = mcp.url;
    base.mcp = {
      headers: mcp.headers,
      oauth: mcp.oauth,
      tool: mcp.tool,
      resource: mcp.resource,
      response: mcp.response,
    };
  } else if (serialized.openai) {
    const openai = serialized.openai;
    base.url = openai.url;
    
    base.openai = {
      model: openai.model,
      apiKey: openai.apiKey,
      bodyType: openai.bodyType,
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
      body: restoreBody(http.body),
      bodyDrafts: Object.fromEntries(Object.entries(http.bodyDrafts ?? {}).map(([key, body]) => [key, restoreBody(body)])),
      queryInUrl: http.queryInUrl,
      options: http.options,
      request: null,
      response: http.response ? {
        status: http.response.status,
        statusCode: http.response.statusCode,
        headers: http.response.headers,
        body: http.response.body
          ? base64ToBlob(http.response.body, http.response.bodyType)
          : new Blob([]),
        bodyOmitted: http.response.bodyOmitted,
        duration: http.response.duration,
        error: http.response.error,
        interrupted: http.response.interrupted,
      } : null,
    };
  }

  return normalizeRequest(base);
}

// ============================================================================
// REST API Helpers
// ============================================================================

const STORE_NAME = 'requests';

async function fetchAllRequests(store = STORE_NAME): Promise<SerializedRequest[]> {
  const response = await fetch(`/data/${store}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to list entries: ${response.statusText}`);
  }
  const entries: { id: string; updated?: string }[] = await response.json();

  const requests = await Promise.all(
    entries.map(async (entry) => {
      const res = await fetch(`/data/${store}/${encodeURIComponent(entry.id)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load saved request: ${res.status}`);
      const data: SerializedRequest = await res.json();
      return data;
    })
  );

  return requests.filter((r): r is SerializedRequest => r !== null);
}

async function saveRequestToServer(serialized: SerializedRequest, store = STORE_NAME): Promise<void> {
  const response = await fetch(`/data/${store}/${encodeURIComponent(serialized.id)}`, {
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

    // Handlers write the result into the synced state themselves instead of
    // refetching everything (auto-refetch is deprecated). Returning before the
    // write would drop the optimistic row.
    onInsert: async ({ transaction, collection }) => {
      const rows = transaction.mutations.map((mutation) => mutation.modified as Request);
      await Promise.all(rows.map(async (request) => saveRequestToServer(await serializeRequest(request))));
      await collection.utils.writeUpsert(rows);
      return { refetch: false };
    },

    onUpdate: async ({ transaction, collection }) => {
      const rows = transaction.mutations.map((mutation) => mutation.modified as Request);
      await Promise.all(rows.map(async (request) => saveRequestToServer(await serializeRequest(request))));
      await collection.utils.writeUpsert(rows);
      return { refetch: false };
    },

    onDelete: async ({ transaction, collection }) => {
      const ids = transaction.mutations.map((mutation) => (mutation.original as Request).id);
      await Promise.all(ids.map((id) => deleteRequestFromServer(id)));
      await collection.utils.writeDelete(ids);
      return { refetch: false };
    },
  })
);

export async function clearAllRequests(): Promise<void> {
  const ids = Array.from(requestsCollection.state.keys()) as string[];
  await Promise.all(ids.map(id => requestsCollection.delete(id).isPersisted.promise));
}

export async function saveHistoryEntry(entry: Request): Promise<void> {
  // Reuse the execution ID when retrying a failed write. Persist explicitly:
  // an unchanged optimistic record can make a collection update a no-op.
  await saveRequestToServer(await serializeRequest(entry));
  await requestsCollection.utils.writeUpsert(entry);
}

export async function loadDrafts(): Promise<Request[]> {
  return (await fetchAllRequests('drafts')).map(deserializeRequest);
}

const draftWrites = new Map<string, Promise<void>>();
export function saveDraft(request: Request): Promise<void> {
  const write = (draftWrites.get(request.id) ?? Promise.resolve()).catch(() => {}).then(async () => {
    // Responses belong to execution history; drafts remain inexpensive to save.
    const draft = { ...request, http: request.http && { ...request.http, response: null }, grpc: request.grpc && { ...request.grpc, response: undefined }, mcp: request.mcp && { ...request.mcp, response: undefined }, openai: request.openai && { ...request.openai, response: undefined } };
    await saveRequestToServer(await serializeRequest(draft), 'drafts');
  });
  draftWrites.set(request.id, write);
  void write.finally(() => { if (draftWrites.get(request.id) === write) draftWrites.delete(request.id); }).catch(() => {});
  return write;
}

export async function deleteDraft(id: string): Promise<void> {
  await draftWrites.get(id)?.catch(() => {});
  const response = await fetch(`/data/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) throw new Error('Failed to delete saved request');
}
