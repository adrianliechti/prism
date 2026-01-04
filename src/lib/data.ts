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
  McpOperationType,
  McpListFeaturesResponse,
  McpCallToolResponse,
  McpReadResourceResponse,
} from '../types/types';
import type { ClientRequest, ClientResponse } from '../types/client';

// Re-export types for consumers
export type {
  Request,
  RequestBody,
  KeyValuePair,
  HttpMethod,
  Protocol,
  Variable,
  ClientRequest,
  ClientResponse,
  McpOperationType,
  McpListFeaturesResponse,
  McpCallToolResponse,
  McpReadResourceResponse,
};

// Shared utility for generating unique IDs
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// ============================================================================
// Serialization Types (internal)
// ============================================================================

interface SerializedResponse {
  status: string;
  statusCode: number;
  headers: Record<string, string>;
  content: string;
  contentType: string;
  duration: number;
  error?: string;
}

interface SerializedRequest {
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
  httpResponse: SerializedResponse | null;
  executing: boolean;
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

async function serializeRequest(req: Request): Promise<SerializedRequest> {
  // Handle body serialization - strip File objects
  let body = req.body;
  if (req.body.type === 'form-data') {
    body = {
      ...req.body,
      data: req.body.data.map((f) => ({ ...f, file: null })),
    };
  } else if (req.body.type === 'binary') {
    body = { ...req.body, file: null };
  }

  // Handle response body serialization (Blob -> base64)
  let httpResponse: SerializedResponse | null = null;
  if (req.httpResponse) {
    const content =
      req.httpResponse.body instanceof Blob ? await blobToBase64(req.httpResponse.body) : '';
    const contentType =
      req.httpResponse.body instanceof Blob
        ? req.httpResponse.body.type
        : 'application/octet-stream';

    httpResponse = {
      status: req.httpResponse.status,
      statusCode: req.httpResponse.statusCode,
      headers: req.httpResponse.headers,
      content,
      contentType,
      duration: req.httpResponse.duration,
      error: req.httpResponse.error,
    };
  }

  return {
    id: req.id,
    name: req.name,
    protocol: req.protocol,
    method: req.method,
    url: req.url,
    query: req.query,
    headers: req.headers,
    body: body as RequestBody,
    variables: req.variables,
    creationTime: req.creationTime,
    executionTime: req.executionTime,
    httpRequest: req.httpRequest,
    httpResponse,
    executing: false,
  };
}

function deserializeRequest(serialized: SerializedRequest): Request {
  // Reconstruct Blob from base64
  let httpResponse: ClientResponse | null = null;
  if (serialized.httpResponse) {
    const body = serialized.httpResponse.content
      ? base64ToBlob(serialized.httpResponse.content, serialized.httpResponse.contentType)
      : new Blob([]);

    httpResponse = {
      status: serialized.httpResponse.status,
      statusCode: serialized.httpResponse.statusCode,
      headers: serialized.httpResponse.headers,
      body,
      duration: serialized.httpResponse.duration,
      error: serialized.httpResponse.error,
    };
  }

  return {
    id: serialized.id,
    name: serialized.name,
    protocol: serialized.protocol ?? 'rest',
    method: serialized.method,
    url: serialized.url,
    query: serialized.query,
    headers: serialized.headers,
    body: serialized.body,
    variables: serialized.variables ?? [],
    creationTime: serialized.creationTime,
    executionTime: serialized.executionTime,
    httpRequest: serialized.httpRequest,
    httpResponse,
    executing: false,
  };
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