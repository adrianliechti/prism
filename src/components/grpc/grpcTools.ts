// gRPC protocol tools for AI chat integration
import { toolDefinition } from '@tanstack/ai';
import { clientTools } from '@tanstack/ai-client';
import { z } from 'zod';
import type { Request, KeyValuePair } from '../../types/types';
import { generateId } from '../../lib/data';
import { formatJson, truncateBody, emptySchema, setUrlSchema, keyValueArraySchema, type AdapterConfig } from '../../api/toolsCommon';

// gRPC-specific setters interface
export interface GrpcSetters {
  setUrl: (url: string) => void;
  setGrpcBody: (body: string) => void;
  setGrpcMetadata: (metadata: KeyValuePair[]) => void;
}

// Environment for gRPC tools
export interface GrpcToolsEnvironment {
  request: Request;
  setters: GrpcSetters;
}

// Format request for AI context
function formatRequestForAI(request: Request): Record<string, unknown> {
  return {
    url: request.url,
    body: request.grpc?.body || '',
    metadata: (request.grpc?.metadata ?? []).filter((m: KeyValuePair) => m.enabled !== false && m.key),
    schema: request.grpc?.schema,
  };
}

// Format response for AI context
function formatResponseForAI(request: Request): Record<string, unknown> | null {
  const response = request.grpc?.response;
  if (!response) return null;

  return {
    body: truncateBody(response.body),
    metadata: response.metadata,
    duration: response.duration,
    error: response.error,
  };
}

// Zod schemas for gRPC-specific tools
const setBodySchema = z.object({
  body: z.string().describe('The JSON message body for the gRPC request'),
});

// Tool definitions
const getRequestDef = toolDefinition({
  name: 'get_request',
  description: 'Get the current gRPC request configuration including URL, message body, and metadata',
  inputSchema: emptySchema,
});

const getResponseDef = toolDefinition({
  name: 'get_response',
  description: 'Get the response from the last executed gRPC request, including response body and metadata',
  inputSchema: emptySchema,
});

const setUrlDef = toolDefinition({
  name: 'set_url',
  description: 'Set the gRPC URL (format: grpc://host:port/service/method or grpcs:// for TLS)',
  inputSchema: setUrlSchema,
});

const setBodyDef = toolDefinition({
  name: 'set_body',
  description: 'Set the JSON message body for the gRPC request',
  inputSchema: setBodySchema,
});

const setMetadataDef = toolDefinition({
  name: 'set_metadata',
  description: 'Set the gRPC metadata (headers). This replaces all existing metadata.',
  inputSchema: keyValueArraySchema,
});

// Type aliases for tool inputs
type SetUrlInput = z.infer<typeof setUrlSchema>;
type SetBodyInput = z.infer<typeof setBodySchema>;
type KeyValueInput = z.infer<typeof keyValueArraySchema>;

// Create gRPC tools
export function createTools(environment: GrpcToolsEnvironment) {
  const { request, setters } = environment;

  const getRequest = getRequestDef.client(async () => {
    return formatRequestForAI(request);
  });

  const getResponse = getResponseDef.client(async () => {
    const response = formatResponseForAI(request);
    return response || { error: 'No response available. Execute the request first.' };
  });

  const setUrl = setUrlDef.client(async (args: unknown) => {
    const input = args as SetUrlInput;
    setters.setUrl(input.url);
    return { success: true, url: input.url };
  });

  const setBody = setBodyDef.client(async (args: unknown) => {
    const input = args as SetBodyInput;
    setters.setGrpcBody(formatJson(input.body));
    return { success: true };
  });

  const setMetadata = setMetadataDef.client(async (args: unknown) => {
    const input = args as KeyValueInput;
    try {
      const metadata: KeyValuePair[] = JSON.parse(input.items).map((m: { key: string; value: string; enabled?: boolean }) => ({
        id: generateId(),
        key: m.key,
        value: m.value,
        enabled: m.enabled !== false,
      }));
      setters.setGrpcMetadata(metadata);
      return { success: true, metadataCount: metadata.length };
    } catch (e) {
      return { success: false, error: `Invalid JSON for metadata: ${e instanceof Error ? e.message : 'parse error'}` };
    }
  });

  return clientTools(
    getRequest,
    getResponse,
    setUrl,
    setBody,
    setMetadata
  );
}

// gRPC-specific system instructions
export function getInstructions(): string {
  return `You are an AI assistant embedded in a gRPC client. You have tools that directly modify the gRPC request form visible to the user in real-time.

IMPORTANT: When you use tools like set_url, set_body, set_metadata, the changes appear immediately in the user's request panel. You are actively editing their request—not just describing what to do.

Your capabilities:
- View the current gRPC request configuration (URL, message body, metadata)
- Directly modify the request—changes are applied instantly to the UI
- View and analyze responses after the user executes the request

Guidelines:
- gRPC URLs follow the format: grpc://host:port/service/method or grpcs:// for TLS
- The message body should be valid JSON matching the protobuf message schema
- Metadata is similar to HTTP headers and can include authentication tokens
- After making changes, briefly confirm what you did
- You cannot execute/send requests—the user must click Send
- When analyzing responses, look for errors or unexpected data
- Format your responses using Markdown`;
}

// Adapter metadata
export const adapterConfig: AdapterConfig = {
  id: 'grpc',
  name: 'gRPC Assistant',
  placeholder: 'Ask about your gRPC request...',
};
