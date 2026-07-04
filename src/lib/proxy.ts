// Builders for the Go backend's /proxy/* bridge endpoints.

/**
 * Build the proxy path for an OpenAI-compatible endpoint. The base URL's path
 * prefix is kept (gateways like openrouter.ai/api/v1 need it); a bare host
 * defaults to the standard /v1 prefix. Endpoints are relative, e.g. "responses".
 */
export function buildOpenAIProxyPath(baseUrl: string, endpoint: string): string {
  try {
    const url = new URL(baseUrl);
    const scheme = url.protocol.replace(/:$/, '');
    let basePath = url.pathname.replace(/\/+$/, '');
    if (!basePath) basePath = '/v1';
    return `/proxy/${scheme}/${url.host}${basePath}/${endpoint.replace(/^\//, '')}`;
  } catch {
    return '';
  }
}

/**
 * Build the proxy path for an MCP bridge endpoint. The full server URL
 * (path and query included) travels in ?server=; the scheme/host path
 * segments only serve routing.
 */
export function buildMcpProxyPath(serverUrl: string, suffix: string): string {
  try {
    const url = new URL(serverUrl);
    const scheme = url.protocol.replace(/:$/, '');
    return `/proxy/mcp/${scheme}/${url.host}/${suffix.replace(/^\//, '')}?server=${encodeURIComponent(serverUrl)}`;
  } catch {
    return '';
  }
}
