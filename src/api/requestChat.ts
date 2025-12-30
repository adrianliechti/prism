// Request-building chat tools and execution logic
import type { Tool, ToolCall, ToolResult, Message } from './openai';
import { Role, complete } from './openai';
import type { Request, HttpMethod, KeyValuePair, RequestBody, FormDataField } from '../types/types';
import { getConfig } from '../config';

const MAX_BODY_SIZE = 10 * 1024; // 10KB

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function formatJson(str: string): string {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}

// Tools for building HTTP requests
export const requestTools: Tool[] = [
  {
    name: 'get_current_request',
    description: 'Get the current HTTP request configuration including method, URL, headers, query params, and body',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_response',
    description: 'Get the response from the last executed request, including status, headers, and body',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'set_method',
    description: 'Set the HTTP method for the request',
    parameters: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          description: 'The HTTP method',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
        },
      },
      required: ['method'],
    },
  },
  {
    name: 'set_url',
    description: 'Set the URL for the request',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The full URL for the request',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'set_headers',
    description: 'Set the headers for the request. This replaces all existing headers.',
    parameters: {
      type: 'object',
      properties: {
        headers: {
          type: 'string',
          description: 'JSON array of header objects with "key", "value", and optional "enabled" (default true) properties. Example: [{"key": "Content-Type", "value": "application/json"}]',
        },
      },
      required: ['headers'],
    },
  },
  {
    name: 'add_header',
    description: 'Add a single header to the request',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'The header name',
        },
        value: {
          type: 'string',
          description: 'The header value',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'set_query_params',
    description: 'Set the query parameters for the request. This replaces all existing query params.',
    parameters: {
      type: 'object',
      properties: {
        params: {
          type: 'string',
          description: 'JSON array of parameter objects with "key", "value", and optional "enabled" (default true) properties. Example: [{"key": "page", "value": "1"}]',
        },
      },
      required: ['params'],
    },
  },
  {
    name: 'add_query_param',
    description: 'Add a single query parameter to the request',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'The parameter name',
        },
        value: {
          type: 'string',
          description: 'The parameter value',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'set_body',
    description: 'Set the request body',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'The body type',
          enum: ['none', 'json', 'form-urlencoded', 'raw'],
        },
        content: {
          type: 'string',
          description: 'The body content. For JSON, provide valid JSON string. For form-urlencoded, provide JSON array like headers/params.',
        },
      },
      required: ['type'],
    },
  },
];

// Request setters interface - matches useClient hook functions
export interface RequestSetters {
  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setHeaders: (headers: KeyValuePair[]) => void;
  setQuery: (query: KeyValuePair[]) => void;
  setBody: (body: RequestBody) => void;
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

// Format response for AI context - body is a Blob so we return a placeholder
// The actual body text needs to be passed separately if needed
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

// Execute a tool call
export function executeTool(
  toolCall: ToolCall,
  request: Request,
  setters: RequestSetters,
  bodyText?: string
): ToolResult {
  const args = toolCall.arguments ? JSON.parse(toolCall.arguments) : {};

  switch (toolCall.name) {
    case 'get_current_request': {
      return {
        id: toolCall.id,
        data: formatRequestForAI(request),
      };
    }

    case 'get_response': {
      const response = formatResponseForAI(request, bodyText);
      return {
        id: toolCall.id,
        data: response || { error: 'No response available. Execute the request first.' },
      };
    }

    case 'set_method': {
      setters.setMethod(args.method as HttpMethod);
      return {
        id: toolCall.id,
        data: { success: true, method: args.method },
      };
    }

    case 'set_url': {
      setters.setUrl(args.url);
      return {
        id: toolCall.id,
        data: { success: true, url: args.url },
      };
    }

    case 'set_headers': {
      const headers: KeyValuePair[] = JSON.parse(args.headers).map((h: { key: string; value: string; enabled?: boolean }) => ({
        id: generateId(),
        key: h.key,
        value: h.value,
        enabled: h.enabled !== false,
      }));
      setters.setHeaders(headers);
      return {
        id: toolCall.id,
        data: { success: true, headerCount: headers.length },
      };
    }

    case 'add_header': {
      const newHeaders = [...request.headers, { id: generateId(), key: args.key, value: args.value, enabled: true }];
      setters.setHeaders(newHeaders);
      return {
        id: toolCall.id,
        data: { success: true, added: { key: args.key, value: args.value } },
      };
    }

    case 'set_query_params': {
      const params: KeyValuePair[] = JSON.parse(args.params).map((p: { key: string; value: string; enabled?: boolean }) => ({
        id: generateId(),
        key: p.key,
        value: p.value,
        enabled: p.enabled !== false,
      }));
      setters.setQuery(params);
      return {
        id: toolCall.id,
        data: { success: true, paramCount: params.length },
      };
    }

    case 'add_query_param': {
      const newParams = [...request.query, { id: generateId(), key: args.key, value: args.value, enabled: true }];
      setters.setQuery(newParams);
      return {
        id: toolCall.id,
        data: { success: true, added: { key: args.key, value: args.value } },
      };
    }

    case 'set_body': {
      let body: RequestBody;
      switch (args.type) {
        case 'none':
          body = { type: 'none' };
          break;
        case 'json':
          body = { type: 'json', content: formatJson(args.content || '') };
          break;
        case 'raw':
          body = { type: 'raw', content: args.content || '' };
          break;
        case 'form-urlencoded': {
          const data: KeyValuePair[] = args.content 
            ? JSON.parse(args.content).map((p: { key: string; value: string; enabled?: boolean }) => ({
                id: generateId(),
                key: p.key,
                value: p.value,
                enabled: p.enabled !== false,
              }))
            : [];
          body = { type: 'form-urlencoded', data };
          break;
        }
        default:
          body = { type: 'none' };
      }
      setters.setBody(body);
      return {
        id: toolCall.id,
        data: { success: true, bodyType: args.type },
      };
    }

    default:
      return {
        id: toolCall.id,
        data: { error: `Unknown tool: ${toolCall.name}` },
      };
  }
}

// High-level chat function that handles the full conversation loop
export async function chat(
  userMessage: string,
  conversationHistory: Message[],
  request: Request,
  setters: RequestSetters,
  options?: {
    responseBodyText?: string;
    onStream?: (delta: string, snapshot: string) => void;
    onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  }
): Promise<{ response: Message; history: Message[] }> {
  const instructions = `You are an AI assistant helping users build and test HTTP requests. You have access to tools to view and modify the current request configuration.

Your capabilities:
- View the current request (method, URL, headers, query params, body)
- Modify any part of the request
- View and analyze responses from executed requests

Guidelines:
- When the user asks to create or modify a request, use the appropriate tools
- When analyzing responses, look for errors, unexpected data, or issues
- Be concise but helpful in your explanations
- If the user's request is ambiguous, ask for clarification
- When setting headers or params, preserve existing ones unless the user asks to replace them
- Format your responses using Markdown: use **bold**, \`code\`, code blocks with language tags, lists, and headers when appropriate

The user is working with an HTTP client similar to Postman or Insomnia.`;

  // Add user message to history
  const newHistory: Message[] = [
    ...conversationHistory,
    { role: Role.User, content: userMessage },
  ];

  // Keep processing until we get a final response (no tool calls)
  let currentHistory = newHistory;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    attempts++;

    const response = await complete(
      getConfig().ai?.model || '',
      instructions,
      currentHistory,
      requestTools,
      options?.onStream
    );

    // If no tool calls, we're done
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return {
        response,
        history: [...currentHistory, response],
      };
    }

    // Execute tool calls
    currentHistory = [...currentHistory, response];

    for (const toolCall of response.toolCalls) {
      const args = toolCall.arguments ? JSON.parse(toolCall.arguments) : {};
      options?.onToolCall?.(toolCall.name, args);

      const result = executeTool(toolCall, request, setters, options?.responseBodyText);
      currentHistory.push({
        role: Role.Tool,
        content: '',
        toolResult: result,
      });
    }
  }

  // If we hit max attempts, return error message
  return {
    response: {
      role: Role.Assistant,
      content: 'I apologize, but I encountered an issue processing your request. Please try again.',
    },
    history: currentHistory,
  };
}
