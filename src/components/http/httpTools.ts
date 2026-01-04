// HTTP protocol tools for AI chat integration
import { toolDefinition } from '@tanstack/ai';
import { clientTools } from '@tanstack/ai-client';
import { z } from 'zod';
import type { Request, HttpMethod, KeyValuePair, RequestBody, FormDataField } from '../../types/types';
import { generateId } from '../../lib/data';
import { formatJson, truncateBody, emptySchema, setUrlSchema, keyValueArraySchema, type AdapterConfig } from '../../api/toolsCommon';

// HTTP-specific setters interface
export interface HttpSetters {
  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setHeaders: (headers: KeyValuePair[]) => void;
  setQuery: (query: KeyValuePair[]) => void;
  setBody: (body: RequestBody) => void;
}

// Environment for HTTP tools
export interface HttpToolsEnvironment {
  request: Request;
  setters: HttpSetters;
  responseBodyText?: string;
}

// Format request for AI context
function formatRequestForAI(request: Request): Record<string, unknown> {
  const httpBody = request.http?.body ?? { type: 'none' as const };
  const bodyContent = httpBody.type === 'json' 
    ? httpBody.content 
    : httpBody.type === 'raw' 
      ? httpBody.content 
      : httpBody.type === 'xml'
        ? httpBody.content
        : httpBody.type === 'form-urlencoded'
          ? httpBody.data
          : httpBody.type === 'form-data'
            ? httpBody.data.map((f: FormDataField) => ({ key: f.key, type: f.type, value: f.type === 'file' ? f.file?.name : f.value }))
            : null;

  return {
    method: request.http?.method ?? 'GET',
    url: request.url,
    headers: (request.http?.headers ?? []).filter((h: KeyValuePair) => h.enabled !== false),
    queryParams: (request.http?.query ?? []).filter((q: KeyValuePair) => q.enabled !== false),
    body: {
      type: httpBody.type,
      content: bodyContent,
    },
  };
}

// Format response for AI context
function formatResponseForAI(request: Request, bodyText?: string): Record<string, unknown> | null {
  const response = request.http?.response;
  if (!response) return null;

  return {
    status: response.status,
    statusCode: response.statusCode,
    headers: response.headers,
    body: truncateBody(bodyText),
    duration: response.duration,
  };
}

// Zod schemas for HTTP-specific tools
const setMethodSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']).describe('The HTTP method'),
});

const setBodySchema = z.object({
  type: z.enum(['none', 'json', 'xml', 'form-urlencoded', 'form-data', 'raw']).describe('The body type'),
  content: z.string().optional().describe('The body content. For JSON/XML/raw, provide the content string. For form-urlencoded/form-data, provide JSON array like headers/params. Note: form-data only supports text fields (not file uploads) via this tool.'),
});

// Tool definitions
const getRequestDef = toolDefinition({
  name: 'get_request',
  description: 'Get the current HTTP request configuration including method, URL, headers, query params, and body',
  inputSchema: emptySchema,
});

const getResponseDef = toolDefinition({
  name: 'get_response',
  description: 'Get the response from the last executed request, including status, headers, and body',
  inputSchema: emptySchema,
});

const setMethodDef = toolDefinition({
  name: 'set_method',
  description: 'Set the HTTP method for the request',
  inputSchema: setMethodSchema,
});

const setUrlDef = toolDefinition({
  name: 'set_url',
  description: 'Set the URL for the request',
  inputSchema: setUrlSchema,
});

const setHeadersDef = toolDefinition({
  name: 'set_headers',
  description: 'Set the headers for the request. This replaces all existing headers.',
  inputSchema: keyValueArraySchema,
});

const setQueryParamsDef = toolDefinition({
  name: 'set_query_params',
  description: 'Set the query parameters for the request. This replaces all existing query params.',
  inputSchema: keyValueArraySchema,
});

const setBodyDef = toolDefinition({
  name: 'set_body',
  description: 'Set the request body',
  inputSchema: setBodySchema,
});

// Type aliases for tool inputs
type SetMethodInput = z.infer<typeof setMethodSchema>;
type SetUrlInput = z.infer<typeof setUrlSchema>;
type KeyValueInput = z.infer<typeof keyValueArraySchema>;
type SetBodyInput = z.infer<typeof setBodySchema>;

// Create HTTP tools
export function createTools(environment: HttpToolsEnvironment) {
  const { request, setters, responseBodyText } = environment;

  const getRequest = getRequestDef.client(async () => {
    return formatRequestForAI(request);
  });

  const getResponse = getResponseDef.client(async () => {
    const response = formatResponseForAI(request, responseBodyText);
    return response || { error: 'No response available. Execute the request first.' };
  });

  const setMethod = setMethodDef.client(async (args: unknown) => {
    const input = args as SetMethodInput;
    setters.setMethod(input.method as HttpMethod);
    return { success: true, method: input.method };
  });

  const setUrl = setUrlDef.client(async (args: unknown) => {
    const input = args as SetUrlInput;
    setters.setUrl(input.url);
    return { success: true, url: input.url };
  });

  const setHeaders = setHeadersDef.client(async (args: unknown) => {
    const input = args as KeyValueInput;
    try {
      const headers: KeyValuePair[] = JSON.parse(input.items).map((h: { key: string; value: string; enabled?: boolean }) => ({
        id: generateId(),
        key: h.key,
        value: h.value,
        enabled: h.enabled !== false,
      }));
      setters.setHeaders(headers);
      return { success: true, headerCount: headers.length };
    } catch (e) {
      return { success: false, error: `Invalid JSON for headers: ${e instanceof Error ? e.message : 'parse error'}` };
    }
  });

  const setQueryParams = setQueryParamsDef.client(async (args: unknown) => {
    const input = args as KeyValueInput;
    try {
      const params: KeyValuePair[] = JSON.parse(input.items).map((p: { key: string; value: string; enabled?: boolean }) => ({
        id: generateId(),
        key: p.key,
        value: p.value,
        enabled: p.enabled !== false,
      }));
      setters.setQuery(params);
      return { success: true, paramCount: params.length };
    } catch (e) {
      return { success: false, error: `Invalid JSON for query params: ${e instanceof Error ? e.message : 'parse error'}` };
    }
  });

  const setBody = setBodyDef.client(async (args: unknown) => {
    const input = args as SetBodyInput;
    try {
      let body: RequestBody;
      switch (input.type) {
        case 'none':
          body = { type: 'none' };
          break;
        case 'json':
          body = { type: 'json', content: formatJson(input.content || '') };
          break;
        case 'xml':
          body = { type: 'xml', content: input.content || '' };
          break;
        case 'raw':
          body = { type: 'raw', content: input.content || '' };
          break;
        case 'form-urlencoded': {
          const data: KeyValuePair[] = input.content 
            ? JSON.parse(input.content).map((p: { key: string; value: string; enabled?: boolean }) => ({
                id: generateId(),
                key: p.key,
                value: p.value,
                enabled: p.enabled !== false,
              }))
            : [];
          body = { type: 'form-urlencoded', data };
          break;
        }
        case 'form-data': {
          const data: FormDataField[] = input.content
            ? JSON.parse(input.content).map((f: { key: string; value?: string; enabled?: boolean }) => ({
                id: generateId(),
                key: f.key,
                type: 'text' as const,
                value: f.value || '',
                enabled: f.enabled !== false,
                file: null,
                fileName: '',
              }))
            : [];
          body = { type: 'form-data', data };
          break;
        }
        default:
          body = { type: 'none' };
      }
      setters.setBody(body);
      return { success: true, bodyType: input.type };
    } catch (e) {
      return { success: false, error: `Invalid body content: ${e instanceof Error ? e.message : 'parse error'}` };
    }
  });

  return clientTools(
    getRequest,
    getResponse,
    setMethod,
    setUrl,
    setHeaders,
    setQueryParams,
    setBody
  );
}

// HTTP-specific system instructions
export function getInstructions(): string {
  return `You are an AI assistant embedded in an HTTP client (similar to Postman or Insomnia). You have tools that directly modify the request form visible to the user in real-time.

IMPORTANT: When you use tools like set_url, set_headers, set_body, etc., the changes appear immediately in the user's request panel. You are actively editing their request—not just describing what to do. The user sees updates live as you make them.

Your capabilities:
- View the current request configuration (method, URL, headers, query params, body)
- Directly modify any part of the request—changes are applied instantly to the UI
- View and analyze responses after the user executes the request

Guidelines:
- When the user asks to create or modify a request, use the appropriate tools to make the changes directly
- After making changes, briefly confirm what you did (e.g., "I've set the URL to ... and added the Authorization header")
- You cannot execute/send requests—the user must click Send. After they do, you can analyze the response using get_response
- When analyzing responses, look for errors, unexpected data, or issues
- Be concise but helpful in your explanations
- If the user's request is ambiguous, ask for clarification
- Format your responses using Markdown: use **bold**, \`code\`, code blocks with language tags, lists, and headers when appropriate`;
}

// Adapter metadata
export const adapterConfig: AdapterConfig = {
  id: 'http',
  name: 'HTTP Assistant',
  placeholder: 'Ask about your HTTP request...',
};
