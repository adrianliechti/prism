// TanStack AI tools for building HTTP requests
import { toolDefinition } from '@tanstack/ai';
import { clientTools } from '@tanstack/ai-client';
import { z } from 'zod';
import type { Request, HttpMethod, KeyValuePair, RequestBody, FormDataField } from '../types/types';
import type { RequestChatEnvironment } from '../types/chat';
import { generateId } from '../lib/data';

const MAX_BODY_SIZE = 10 * 1024; // 10KB

function formatJson(str: string): string {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}

// Truncate body content if too large
function truncateBody(body: string | undefined | null): string {
  if (!body) return '(empty)';
  if (body.length <= MAX_BODY_SIZE) return body;
  return body.slice(0, MAX_BODY_SIZE) + '\n...[TRUNCATED]';
}

// Format request for AI context
function formatRequestForAI(request: Request): Record<string, unknown> {
  const bodyContent = request.body.type === 'json' 
    ? request.body.content 
    : request.body.type === 'raw' 
      ? request.body.content 
      : request.body.type === 'form-urlencoded'
        ? request.body.data
        : request.body.type === 'form-data'
          ? request.body.data.map((f: FormDataField) => ({ key: f.key, type: f.type, value: f.type === 'file' ? f.file?.name : f.value }))
          : null;

  return {
    method: request.method,
    url: request.url,
    headers: request.headers.filter((h: KeyValuePair) => h.enabled !== false),
    queryParams: request.query.filter((q: KeyValuePair) => q.enabled !== false),
    body: {
      type: request.body.type,
      content: bodyContent,
    },
  };
}

// Format response for AI context
function formatResponseForAI(request: Request, bodyText?: string): Record<string, unknown> | null {
  const response = request.httpResponse;
  if (!response) return null;

  return {
    status: response.status,
    statusCode: response.statusCode,
    headers: response.headers,
    body: truncateBody(bodyText),
    duration: response.duration,
  };
}

// Zod schemas for tool inputs
const emptySchema = z.object({});

const setMethodSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']).describe('The HTTP method'),
});

const setUrlSchema = z.object({
  url: z.string().describe('The full URL for the request'),
});

const setHeadersSchema = z.object({
  headers: z.string().describe('JSON array of header objects with "key", "value", and optional "enabled" (default true) properties. Example: [{"key": "Content-Type", "value": "application/json"}]'),
});

const addHeaderSchema = z.object({
  key: z.string().describe('The header name'),
  value: z.string().describe('The header value'),
});

const setQueryParamsSchema = z.object({
  params: z.string().describe('JSON array of parameter objects with "key", "value", and optional "enabled" (default true) properties. Example: [{"key": "page", "value": "1"}]'),
});

const addQueryParamSchema = z.object({
  key: z.string().describe('The parameter name'),
  value: z.string().describe('The parameter value'),
});

const setBodySchema = z.object({
  type: z.enum(['none', 'json', 'xml', 'form-urlencoded', 'form-data', 'raw']).describe('The body type'),
  content: z.string().optional().describe('The body content. For JSON/XML/raw, provide the content string. For form-urlencoded/form-data, provide JSON array like headers/params. Note: form-data only supports text fields (not file uploads) via this tool.'),
});

const removeHeaderSchema = z.object({
  key: z.string().describe('The header name to remove (case-insensitive)'),
});

const removeQueryParamSchema = z.object({
  key: z.string().describe('The query parameter name to remove'),
});

// Tool definitions
const getCurrentRequestDef = toolDefinition({
  name: 'get_current_request',
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
  inputSchema: setHeadersSchema,
});

const addHeaderDef = toolDefinition({
  name: 'add_header',
  description: 'Add a single header to the request',
  inputSchema: addHeaderSchema,
});

const setQueryParamsDef = toolDefinition({
  name: 'set_query_params',
  description: 'Set the query parameters for the request. This replaces all existing query params.',
  inputSchema: setQueryParamsSchema,
});

const addQueryParamDef = toolDefinition({
  name: 'add_query_param',
  description: 'Add a single query parameter to the request',
  inputSchema: addQueryParamSchema,
});

const setBodyDef = toolDefinition({
  name: 'set_body',
  description: 'Set the request body',
  inputSchema: setBodySchema,
});

const removeHeaderDef = toolDefinition({
  name: 'remove_header',
  description: 'Remove a header from the request by name',
  inputSchema: removeHeaderSchema,
});

const removeQueryParamDef = toolDefinition({
  name: 'remove_query_param',
  description: 'Remove a query parameter from the request by name',
  inputSchema: removeQueryParamSchema,
});

// Type aliases for tool inputs
type SetMethodInput = z.infer<typeof setMethodSchema>;
type SetUrlInput = z.infer<typeof setUrlSchema>;
type SetHeadersInput = z.infer<typeof setHeadersSchema>;
type AddHeaderInput = z.infer<typeof addHeaderSchema>;
type SetQueryParamsInput = z.infer<typeof setQueryParamsSchema>;
type AddQueryParamInput = z.infer<typeof addQueryParamSchema>;
type SetBodyInput = z.infer<typeof setBodySchema>;
type RemoveHeaderInput = z.infer<typeof removeHeaderSchema>;
type RemoveQueryParamInput = z.infer<typeof removeQueryParamSchema>;

// Create client tool implementations
export function createRequestTools(environment: RequestChatEnvironment) {
  const { request, setters, responseBodyText } = environment;

  const getCurrentRequest = getCurrentRequestDef.client(async () => {
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
    const input = args as SetHeadersInput;
    try {
      const headers: KeyValuePair[] = JSON.parse(input.headers).map((h: { key: string; value: string; enabled?: boolean }) => ({
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

  const addHeader = addHeaderDef.client(async (args: unknown) => {
    const input = args as AddHeaderInput;
    const newHeaders = [...request.headers, { id: generateId(), key: input.key, value: input.value, enabled: true }];
    setters.setHeaders(newHeaders);
    return { success: true, added: { key: input.key, value: input.value } };
  });

  const setQueryParams = setQueryParamsDef.client(async (args: unknown) => {
    const input = args as SetQueryParamsInput;
    try {
      const params: KeyValuePair[] = JSON.parse(input.params).map((p: { key: string; value: string; enabled?: boolean }) => ({
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

  const addQueryParam = addQueryParamDef.client(async (args: unknown) => {
    const input = args as AddQueryParamInput;
    const newParams = [...request.query, { id: generateId(), key: input.key, value: input.value, enabled: true }];
    setters.setQuery(newParams);
    return { success: true, added: { key: input.key, value: input.value } };
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

  const removeHeader = removeHeaderDef.client(async (args: unknown) => {
    const input = args as RemoveHeaderInput;
    const keyLower = input.key.toLowerCase();
    const filtered = request.headers.filter((h: KeyValuePair) => h.key.toLowerCase() !== keyLower);
    const removedCount = request.headers.length - filtered.length;
    if (removedCount === 0) {
      return { success: false, error: `Header '${input.key}' not found` };
    }
    setters.setHeaders(filtered);
    return { success: true, removed: input.key, removedCount };
  });

  const removeQueryParam = removeQueryParamDef.client(async (args: unknown) => {
    const input = args as RemoveQueryParamInput;
    const filtered = request.query.filter((q: KeyValuePair) => q.key !== input.key);
    const removedCount = request.query.length - filtered.length;
    if (removedCount === 0) {
      return { success: false, error: `Query parameter '${input.key}' not found` };
    }
    setters.setQuery(filtered);
    return { success: true, removed: input.key, removedCount };
  });

  return clientTools(
    getCurrentRequest,
    getResponse,
    setMethod,
    setUrl,
    setHeaders,
    addHeader,
    removeHeader,
    setQueryParams,
    addQueryParam,
    removeQueryParam,
    setBody
  );
}

// Build instructions for the request chat
export function buildRequestInstructions(): string {
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
- When adding headers or params, preserve existing ones unless the user asks to replace them
- Format your responses using Markdown: use **bold**, \`code\`, code blocks with language tags, lists, and headers when appropriate`;
}

// Adapter metadata
export const requestAdapterConfig = {
  id: 'request',
  name: 'Request Assistant',
  placeholder: 'Ask about your request...',
};
