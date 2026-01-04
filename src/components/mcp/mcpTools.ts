// MCP protocol tools for AI chat integration
import { toolDefinition } from '@tanstack/ai';
import { clientTools } from '@tanstack/ai-client';
import { z } from 'zod';
import type { Request, KeyValuePair, McpCallToolResponse, McpReadResourceResponse } from '../../types/types';
import { generateId } from '../../lib/data';
import { formatJson, truncateBody, emptySchema, setUrlSchema, keyValueArraySchema, type AdapterConfig } from '../../api/toolsCommon';

// MCP-specific setters interface
export interface McpSetters {
  setUrl: (url: string) => void;
  setMcpHeaders: (headers: KeyValuePair[]) => void;
  setMcpTool: (tool: { name: string; arguments: string; schema?: Record<string, unknown> } | undefined) => void;
  setMcpResource: (resource: { uri: string } | undefined) => void;
}

// Environment for MCP tools
export interface McpToolsEnvironment {
  request: Request;
  setters: McpSetters;
}

// Format request for AI context
function formatRequestForAI(request: Request): Record<string, unknown> {
  const mcp = request.mcp;
  return {
    url: request.url,
    headers: (mcp?.headers ?? []).filter((h: KeyValuePair) => h.enabled !== false && h.key),
    tool: mcp?.tool ? {
      name: mcp.tool.name,
      arguments: mcp.tool.arguments,
      schema: mcp.tool.schema,
    } : null,
    resource: mcp?.resource ? {
      uri: mcp.resource.uri,
    } : null,
  };
}

// Format MCP response content for display
function formatMcpContent(result: McpCallToolResponse | McpReadResourceResponse): string {
  if ('content' in result) {
    // McpCallToolResponse
    return result.content.map(c => {
      if (c.type === 'text') return c.text || '';
      if (c.type === 'image') return `[Image: ${c.mimeType}]`;
      if (c.type === 'audio') return `[Audio: ${c.mimeType}]`;
      if (c.type === 'resource') return `[Resource: ${c.resource?.uri}]`;
      if (c.type === 'resource_link') return `[Resource Link: ${c.uri}]`;
      return '[Unknown content]';
    }).join('\n');
  } else if ('contents' in result) {
    // McpReadResourceResponse
    return result.contents.map(c => {
      if (c.text) return c.text;
      if (c.blob) return `[Binary data: ${c.mimeType}]`;
      return `[Resource: ${c.uri}]`;
    }).join('\n');
  }
  return '';
}

// Format response for AI context
function formatResponseForAI(request: Request): Record<string, unknown> | null {
  const response = request.mcp?.response;
  if (!response) return null;

  return {
    result: response.result ? truncateBody(formatMcpContent(response.result)) : null,
    duration: response.duration,
    error: response.error,
  };
}

// Zod schemas for MCP-specific tools
const setToolSchema = z.object({
  name: z.string().describe('The name of the MCP tool to call'),
  arguments: z.string().describe('JSON string of the tool arguments'),
});

const setResourceSchema = z.object({
  uri: z.string().describe('The URI of the MCP resource to read'),
});

// Tool definitions
const getRequestDef = toolDefinition({
  name: 'get_request',
  description: 'Get the current MCP request configuration including URL, headers, tool, or resource',
  inputSchema: emptySchema,
});

const getResponseDef = toolDefinition({
  name: 'get_response',
  description: 'Get the response from the last executed MCP request',
  inputSchema: emptySchema,
});

const setUrlDef = toolDefinition({
  name: 'set_url',
  description: 'Set the MCP server URL (e.g., http://localhost:3000/mcp or sse://localhost:3000/sse)',
  inputSchema: setUrlSchema,
});

const setHeadersDef = toolDefinition({
  name: 'set_headers',
  description: 'Set the MCP request headers (for authentication, etc.). This replaces all existing headers.',
  inputSchema: keyValueArraySchema,
});

const setToolDef = toolDefinition({
  name: 'set_tool',
  description: 'Set the MCP tool to call with its arguments. This clears any resource selection.',
  inputSchema: setToolSchema,
});

const setResourceDef = toolDefinition({
  name: 'set_resource',
  description: 'Set the MCP resource to read by URI. This clears any tool selection.',
  inputSchema: setResourceSchema,
});

// Type aliases for tool inputs
type SetUrlInput = z.infer<typeof setUrlSchema>;
type KeyValueInput = z.infer<typeof keyValueArraySchema>;
type SetToolInput = z.infer<typeof setToolSchema>;
type SetResourceInput = z.infer<typeof setResourceSchema>;

// Create MCP tools
export function createTools(environment: McpToolsEnvironment) {
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

  const setHeaders = setHeadersDef.client(async (args: unknown) => {
    const input = args as KeyValueInput;
    try {
      const headers: KeyValuePair[] = JSON.parse(input.items).map((h: { key: string; value: string; enabled?: boolean }) => ({
        id: generateId(),
        key: h.key,
        value: h.value,
        enabled: h.enabled !== false,
      }));
      setters.setMcpHeaders(headers);
      return { success: true, headerCount: headers.length };
    } catch (e) {
      return { success: false, error: `Invalid JSON for headers: ${e instanceof Error ? e.message : 'parse error'}` };
    }
  });

  const setTool = setToolDef.client(async (args: unknown) => {
    const input = args as SetToolInput;
    setters.setMcpTool({
      name: input.name,
      arguments: formatJson(input.arguments),
    });
    return { success: true, tool: input.name };
  });

  const setResource = setResourceDef.client(async (args: unknown) => {
    const input = args as SetResourceInput;
    setters.setMcpResource({
      uri: input.uri,
    });
    return { success: true, resource: input.uri };
  });

  return clientTools(
    getRequest,
    getResponse,
    setUrl,
    setHeaders,
    setTool,
    setResource
  );
}

// MCP-specific system instructions
export function getInstructions(): string {
  return `You are an AI assistant embedded in an MCP (Model Context Protocol) client. You have tools that directly modify the MCP request form visible to the user in real-time.

IMPORTANT: When you use tools like set_url, set_headers, set_tool, set_resource, the changes appear immediately in the user's request panel. You are actively editing their request—not just describing what to do.

Your capabilities:
- View the current MCP request configuration (URL, headers, tool or resource)
- Directly modify the request—changes are applied instantly to the UI
- View and analyze responses after the user executes the request

Guidelines:
- MCP servers expose tools and resources that can be called/read
- Use set_tool to configure a tool call with its name and JSON arguments
- Use set_resource to configure reading a resource by URI
- Tool and resource are mutually exclusive—setting one clears the other
- Headers can be used for authentication (e.g., Authorization header)
- After making changes, briefly confirm what you did
- You cannot execute/send requests—the user must click Send
- Format your responses using Markdown`;
}

// Adapter metadata
export const adapterConfig: AdapterConfig = {
  id: 'mcp',
  name: 'MCP Assistant',
  placeholder: 'Ask about your MCP request...',
};
