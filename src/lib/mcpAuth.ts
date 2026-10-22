// Client for the backend's MCP OAuth endpoints. Tokens never reach the UI;
// the backend stores them encrypted and attaches them to MCP requests.
import { buildMcpProxyPath } from './proxy';

export interface McpAuthStatus {
  status: 'none' | 'pending' | 'authorized' | 'not_required';
  authorizationUrl?: string;
  redirectUrl: string;
  error?: string;
}

export interface McpAuthStart {
  headers?: Record<string, string>;
  clientId?: string;
  clientSecret?: string;
}

export async function mcpAuth(method: 'GET' | 'POST' | 'DELETE', serverUrl: string, body?: McpAuthStart, signal?: AbortSignal): Promise<McpAuthStatus> {
  const path = buildMcpProxyPath(serverUrl, 'auth');
  if (!path) throw new Error('Invalid MCP server URL');
  const response = await fetch(path, body
    ? { method, signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method, signal });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text.trim() || `HTTP ${response.status}`);
  }
  return response.json();
}
