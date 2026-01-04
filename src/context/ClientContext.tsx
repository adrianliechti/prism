/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useCallback, type ReactNode } from 'react';
import { useLiveQuery } from '@tanstack/react-db';
import {
  requestsCollection,
  clearAllRequests,
  generateId,
  type Request,
  type KeyValuePair,
  type HttpMethod,
  type Protocol,
  type RequestBody,
  type Variable,
  type ClientRequest,
  type McpOperationType,
  type McpListFeaturesResponse,
  type McpCallToolResponse,
  type McpReadResourceResponse,
} from '../lib/data';
import { resolveVariables } from '../utils/variables';

function createEmptyKeyValue(): KeyValuePair {
  return { id: generateId(), enabled: true, key: '', value: '' };
}

function createNewRequest(name?: string): Request {
  return {
    id: generateId(),
    name: name || 'New Request',
    protocol: 'rest',
    method: 'GET',
    url: '',
    headers: [createEmptyKeyValue()],
    query: [createEmptyKeyValue()],
    body: { type: 'none' },
    variables: [],
    creationTime: Date.now(),
    executionTime: null,
    httpRequest: null,
    httpResponse: null,
    executing: false,
  };
}

interface ClientState {
  request: Request;
  sidebarCollapsed: boolean;
  aiPanelOpen: boolean;
}

interface ClientContextType {
  // State
  request: Request;
  history: Request[];
  sidebarCollapsed: boolean;
  
  // Request actions
  setProtocol: (protocol: Protocol) => void;
  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setHeaders: (headers: KeyValuePair[]) => void;
  setQuery: (params: KeyValuePair[]) => void;
  setBody: (body: RequestBody) => void;
  setVariables: (variables: Variable[]) => void;
  setOptions: (options: Partial<ClientRequest['options']>) => void;
  executeRequest: () => Promise<void>;
  clearResponse: () => void;
  newRequest: () => void;
  
  // gRPC-specific actions
  setGrpcMethodSchema: (schema: Record<string, unknown> | undefined) => void;
  
  // MCP-specific actions
  setMcpOperation: (operation: McpOperationType) => void;
  setMcpSelectedTool: (tool: string | undefined) => void;
  setMcpSelectedResource: (resource: string | undefined) => void;
  discoverMcpFeatures: () => Promise<void>;
  
  // History actions
  loadFromHistory: (entry: Request) => void;
  clearHistory: () => void;
  deleteHistoryEntry: (id: string) => void;
  
  // Sidebar
  toggleSidebar: () => void;
  
  // AI Panel
  aiPanelOpen: boolean;
  toggleAiPanel: () => void;
}

export const ClientContext = createContext<ClientContextType | null>(null);

const initialState: ClientState = {
  request: createNewRequest(),
  sidebarCollapsed: false,
  aiPanelOpen: false,
};

export function ClientProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ClientState>(initialState);

  // Use TanStack DB live query for history - sorted by execution time descending
  const { data: history = [] } = useLiveQuery((q) =>
    q.from({ req: requestsCollection })
      .orderBy(({ req }) => req.executionTime ?? req.creationTime, 'desc')
  );

  // Helper to update request
  const updateRequest = useCallback((updates: Partial<Request>) => {
    setState(prev => ({
      ...prev,
      request: { ...prev.request, ...updates },
    }));
  }, []);

  const buildMcpProxyPath = useCallback((serverUrl: string, suffix: string) => {
    try {
      const url = new URL(serverUrl);
      const scheme = url.protocol.replace(/:$/, '');
      const host = url.host;
      const path = url.pathname.replace(/^\//, '');
      const cleanSuffix = suffix.replace(/^\//, '');
      const base = `/proxy/mcp/${scheme}/${host}/${cleanSuffix}`;
      return path ? `${base}?path=${encodeURIComponent(path)}` : base;
    } catch {
      return '';
    }
  }, []);

  // Request actions
  const setProtocol = useCallback((protocol: Protocol) => {
    updateRequest({ protocol });
  }, [updateRequest]);

  const setMethod = useCallback((method: HttpMethod) => {
    updateRequest({ method });
  }, [updateRequest]);

  const setUrl = useCallback((url: string) => {
    updateRequest({ url });
  }, [updateRequest]);

  const setHeaders = useCallback((headers: KeyValuePair[]) => {
    updateRequest({ headers });
  }, [updateRequest]);

  const setQuery = useCallback((query: KeyValuePair[]) => {
    updateRequest({ query });
  }, [updateRequest]);

  const setBody = useCallback((body: RequestBody) => {
    updateRequest({ body });
  }, [updateRequest]);

  const setVariables = useCallback((variables: Variable[]) => {
    updateRequest({ variables });
  }, [updateRequest]);

  const setOptions = useCallback((options: Partial<ClientRequest['options']>) => {
    setState(prev => {
      const currentOptions = prev.request.httpRequest?.options ?? { insecure: false, redirect: true };
      const newOptions = { ...currentOptions, ...options };
      return {
        ...prev,
        request: {
          ...prev.request,
          httpRequest: prev.request.httpRequest
            ? { ...prev.request.httpRequest, options: newOptions }
            : null,
        },
      };
    });
  }, []);

  // gRPC-specific setters
  const setGrpcMethodSchema = useCallback((grpcMethodSchema: Record<string, unknown> | undefined) => {
    updateRequest({ grpcMethodSchema });
  }, [updateRequest]);

  // MCP-specific setters
  const setMcpOperation = useCallback((mcpOperation: McpOperationType) => {
    updateRequest({ mcpOperation });
  }, [updateRequest]);

  const setMcpSelectedTool = useCallback((mcpSelectedTool: string | undefined) => {
    updateRequest({ mcpSelectedTool, mcpSelectedResource: undefined });
  }, [updateRequest]);

  const setMcpSelectedResource = useCallback((mcpSelectedResource: string | undefined) => {
    updateRequest({ mcpSelectedResource, mcpSelectedTool: undefined });
  }, [updateRequest]);

  // Discover MCP features from server
  const discoverMcpFeatures = useCallback(async () => {
    const req = state.request;
    if (!req.url) return;

    updateRequest({ executing: true });

    try {
      const path = buildMcpProxyPath(req.url, 'features');
      if (!path) {
        throw new Error('Invalid MCP server URL');
      }

      const response = await fetch(path);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }
      const features: McpListFeaturesResponse = await response.json();
      updateRequest({ 
        mcpFeatures: features, 
        executing: false,
        mcpOperation: 'discover',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      updateRequest({ 
        executing: false,
        mcpFeatures: {
          tools: [],
          resources: [],
          error: errorMessage,
        },
      });
    }
  }, [state.request, updateRequest]);

  const clearResponse = useCallback(() => {
    updateRequest({ httpResponse: null });
  }, [updateRequest]);

  const executeRequest = useCallback(async () => {
    const req = state.request;

    updateRequest({ executing: true });

    try {
      // Build headers
      const headersObj: Record<string, string> = {};
      req.headers.filter(h => h.enabled && h.key).forEach(h => {
        headersObj[h.key] = h.value;
      });

      // gRPC mode
      if (req.protocol === 'grpc') {
        // Parse grpc://host/service/method URL
        const grpcUrl = req.url;
        const match = grpcUrl.match(/^grpc:\/\/([^/]+)\/(.+)\/([^/]+)$/);
        if (!match) {
          throw new Error('Invalid gRPC URL format. Expected: grpc://host:port/service/method');
        }
        const [, grpcHost, grpcService, grpcMethod] = match;

        // gRPC always uses JSON body
        let body = '';
        let bodyForHistory = '';
        
        if (req.body.type === 'json') {
          body = resolveVariables(req.body.content, req.variables);
          bodyForHistory = req.body.content;
        } else {
          body = '{}';
          bodyForHistory = '{}';
        }

        if (!headersObj['Content-Type']) {
          headersObj['Content-Type'] = 'application/json';
        }

        // Build gRPC proxy URL: /proxy/grpc/{host}/{service}/{method}
        const proxyUrl = `/proxy/grpc/${grpcHost}/${grpcService}/${grpcMethod}`;

        const clientRequest: ClientRequest = {
          method: 'POST',
          url: grpcUrl,
          headers: headersObj,
          query: {},
          body: bodyForHistory,
          options: { insecure: false, redirect: false },
        };

        const startTime = performance.now();
        const response = await fetch(proxyUrl, {
          method: 'POST',
          headers: headersObj,
          body,
        });
        const duration = Math.round(performance.now() - startTime);

        const responseBody = await response.blob();
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        const clientResponse = {
          status: response.statusText || String(response.status),
          statusCode: response.status,
          headers: responseHeaders,
          body: responseBody,
          duration,
        };

        const executionTime = Date.now();
        const updatedRequest: Request = {
          ...req,
          executionTime,
          httpRequest: clientRequest,
          httpResponse: clientResponse,
          executing: false,
        };

        // Save to collection (TanStack DB handles persistence)
        const existingInHistory = history.find(h => h.id === req.id);
        if (existingInHistory) {
          requestsCollection.update(req.id, (draft) => {
            Object.assign(draft, updatedRequest);
          });
        } else {
          requestsCollection.insert(updatedRequest);
        }

        setState(prev => ({
          ...prev,
          request: updatedRequest,
        }));

        return;
      }

      // MCP mode
      if (req.protocol === 'mcp') {
        const serverUrl = req.url;
        if (!serverUrl) {
          throw new Error('MCP server URL is required');
        }

        const startTime = performance.now();
        let responseBody: Blob;
        let responseHeaders: Record<string, string> = {};
        let statusCode = 200;
        let status = 'OK';

        // Determine what to execute based on selected tool/resource
        if (req.mcpSelectedTool) {
          // Call a tool
          let args: Record<string, unknown> = {};
          if (req.body.type === 'json' && req.body.content) {
            try {
              args = JSON.parse(req.body.content);
            } catch {
              // Ignore parse errors, use empty args
            }
          }

          const path = buildMcpProxyPath(serverUrl, 'tool/call');
          if (!path) throw new Error('Invalid MCP server URL');

          const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: req.mcpSelectedTool, arguments: args }),
          });

          statusCode = response.status;
          status = response.statusText || String(response.status);
          response.headers.forEach((value, key) => {
            responseHeaders[key.toLowerCase()] = value;
          });
          const result: McpCallToolResponse = await response.json();
          
          const updatedReq: Partial<Request> = {
            mcpToolResponse: result,
          };

          // Convert result to blob for display
          responseBody = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
          
          updateRequest(updatedReq);
        } else if (req.mcpSelectedResource) {
          // Read a resource - get URI from the feature schema
          const resourceFeature = req.mcpFeatures?.resources.find(r => r.name === req.mcpSelectedResource);
          const uri = resourceFeature?.schema?.uri as string || req.mcpSelectedResource;

          const path = buildMcpProxyPath(serverUrl, 'resource/call');
          if (!path) throw new Error('Invalid MCP server URL');

          const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uri }),
          });

          statusCode = response.status;
          status = response.statusText || String(response.status);
          response.headers.forEach((value, key) => {
            responseHeaders[key.toLowerCase()] = value;
          });
          const result: McpReadResourceResponse = await response.json();

          const updatedReq: Partial<Request> = {
            mcpResourceResponse: result,
          };

          // Convert result to blob for display
          responseBody = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
          
          updateRequest(updatedReq);
        } else {
          // Just discover features if nothing selected
          const path = buildMcpProxyPath(serverUrl, 'features');
          if (!path) throw new Error('Invalid MCP server URL');

          const response = await fetch(path);
          statusCode = response.status;
          status = response.statusText || String(response.status);
          response.headers.forEach((value, key) => {
            responseHeaders[key.toLowerCase()] = value;
          });
          const features: McpListFeaturesResponse = await response.json();
          
          updateRequest({ mcpFeatures: features, mcpOperation: 'discover' });
          responseBody = new Blob([JSON.stringify(features, null, 2)], { type: 'application/json' });
        }

        const duration = Math.round(performance.now() - startTime);

        const clientRequest: ClientRequest = {
          method: 'POST',
          url: serverUrl,
          headers: {},
          query: {},
          body: req.mcpSelectedTool ? JSON.stringify({ name: req.mcpSelectedTool }) : '',
          options: { insecure: false, redirect: false },
        };

        const clientResponse = {
          status,
          statusCode,
          headers: responseHeaders,
          body: responseBody,
          duration,
        };

        const executionTime = Date.now();
        const updatedRequest: Request = {
          ...req,
          ...state.request, // Include any updates made during execution
          executionTime,
          httpRequest: clientRequest,
          httpResponse: clientResponse,
          executing: false,
        };

        // Save to collection
        const existingInHistory = history.find(h => h.id === req.id);
        if (existingInHistory) {
          requestsCollection.update(req.id, (draft) => {
            Object.assign(draft, updatedRequest);
          });
        } else {
          requestsCollection.insert(updatedRequest);
        }

        setState(prev => ({
          ...prev,
          request: updatedRequest,
        }));

        return;
      }

      // REST mode
      // Build query string
      const queryParams = new URLSearchParams();
      req.query.filter(p => p.enabled && p.key).forEach(p => {
        queryParams.append(p.key, p.value);
      });

      // Build body based on type
      let body: string | FormData | Blob | undefined;
      let bodyForHistory: string = '';
      let useFormData = false;
      
      switch (req.body.type) {
        case 'json': {
          // Resolve variables in JSON content
          const resolvedContent = resolveVariables(req.body.content, req.variables);
          
          body = resolvedContent;
          bodyForHistory = req.body.content; // Store original with markers
          if (!headersObj['Content-Type']) {
            headersObj['Content-Type'] = 'application/json';
          }
          break;
        }
        case 'form-urlencoded': {
          const formParams = new URLSearchParams();
          req.body.data.filter(f => f.enabled && f.key).forEach(f => {
            formParams.append(f.key, f.value);
          });
          body = formParams.toString();
          bodyForHistory = formParams.toString();
          if (!headersObj['Content-Type']) {
            headersObj['Content-Type'] = 'application/x-www-form-urlencoded';
          }
          break;
        }
        case 'form-data': {
          const formData = new FormData();
          const formDescription: string[] = [];
          req.body.data.filter(f => f.enabled && f.key).forEach(f => {
            if (f.type === 'file' && f.file) {
              formData.append(f.key, f.file, f.fileName);
              formDescription.push(`${f.key}: [File: ${f.fileName}]`);
            } else if (f.type === 'text') {
              formData.append(f.key, f.value);
              formDescription.push(`${f.key}: ${f.value}`);
            }
          });
          body = formData;
          bodyForHistory = formDescription.join('\n');
          useFormData = true;
          // Don't set Content-Type for FormData - browser will set it with boundary
          break;
        }
        case 'binary': {
          if (req.body.file) {
            body = req.body.file;
            bodyForHistory = `[Binary file: ${req.body.fileName}]`;
            if (!headersObj['Content-Type']) {
              headersObj['Content-Type'] = (req.body.file as File).type || 'application/octet-stream';
            }
          }
          break;
        }
        case 'raw':
          body = req.body.content;
          bodyForHistory = req.body.content;
          if (!headersObj['Content-Type']) {
            headersObj['Content-Type'] = 'text/plain';
          }
          break;
      }

      // Get options
      const options = req.httpRequest?.options ?? { insecure: false, redirect: true };

      // Add proxy headers for options
      if (options.insecure) {
        headersObj['X-Prism-Insecure'] = 'true';
      }
      if (options.redirect) {
        headersObj['X-Prism-Redirect'] = 'true';
      }

      // Build proxy URL: /proxy/{scheme}/{host}/{path}?query
      const targetUrl = new URL(req.url);
      let proxyUrl = '/proxy/' + targetUrl.protocol.slice(0, -1) + '/' + targetUrl.host + targetUrl.pathname;
      const queryString = queryParams.toString();
      if (queryString) {
        proxyUrl += '?' + queryString;
      }

      // Store the request for history (without file objects)
      const clientRequest: ClientRequest = {
        method: req.method,
        url: req.url,
        headers: headersObj,
        query: Object.fromEntries(queryParams),
        body: bodyForHistory,
        options,
      };

      // Prepare fetch options
      const fetchHeaders: Record<string, string> = { ...headersObj };
      // For FormData, remove Content-Type so browser sets it with boundary
      if (useFormData) {
        delete fetchHeaders['Content-Type'];
      }

      const startTime = performance.now();
      const response = await fetch(proxyUrl, {
        method: req.method,
        headers: fetchHeaders,
        body: body && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
      });
      const duration = Math.round(performance.now() - startTime);

      // Always read response as Blob
      const responseBody = await response.blob();

      // Convert headers to Record
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const clientResponse = {
        status: response.statusText || String(response.status),
        statusCode: response.status,
        headers: responseHeaders,
        body: responseBody,
        duration,
      };

      const executionTime = Date.now();
      
      // Update current request with response
      const updatedRequest: Request = {
        ...req,
        executionTime,
        httpRequest: clientRequest,
        httpResponse: clientResponse,
        executing: false,
      };
      
      // Save to collection (TanStack DB handles persistence)
      const existingInHistory = history.find(h => h.id === req.id);
      if (existingInHistory) {
        requestsCollection.update(req.id, (draft) => {
          Object.assign(draft, updatedRequest);
        });
      } else {
        requestsCollection.insert(updatedRequest);
      }

      setState(prev => ({
        ...prev,
        request: updatedRequest,
      }));
      
    } catch (err) {
      const executionTime = Date.now();
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      
      // Create error response
      const errorResponse = {
        status: '',
        statusCode: 0,
        headers: {},
        body: new Blob(),
        duration: 0,
        error: errorMessage,
      };
      
      const updatedRequest: Request = {
        ...req,
        executionTime,
        httpResponse: errorResponse,
        executing: false,
      };
      
      // Save to collection
      const existingInHistory = history.find(h => h.id === req.id);
      if (existingInHistory) {
        requestsCollection.update(req.id, (draft) => {
          Object.assign(draft, updatedRequest);
        });
      } else {
        requestsCollection.insert(updatedRequest);
      }

      setState(prev => ({
        ...prev,
        request: updatedRequest,
      }));
    }
  }, [state.request, updateRequest, history]);

  // History actions
  const loadFromHistory = useCallback((entry: Request) => {
    const newReq = createNewRequest();
    // Preserve the original entry's ID so re-executing updates the history entry
    newReq.id = entry.id;
    newReq.name = entry.name;
    newReq.protocol = entry.protocol ?? 'rest';
    newReq.method = entry.method;
    newReq.url = entry.url;
    newReq.headers = entry.headers.map(h => ({ ...h, id: generateId() }));
    newReq.query = entry.query.map(p => ({ ...p, id: generateId() }));
    // Clone variables with new IDs
    newReq.variables = (entry.variables ?? []).map(v => ({ ...v, id: generateId() }));
    // Clone body with new IDs for form data
    if (entry.body.type === 'form-urlencoded') {
      newReq.body = {
        type: 'form-urlencoded',
        data: entry.body.data.map(f => ({ ...f, id: generateId() })),
      };
    } else if (entry.body.type === 'form-data') {
      newReq.body = {
        type: 'form-data',
        // Note: File objects can't be serialized to localStorage, so files will be lost
        data: entry.body.data.map(f => ({ ...f, id: generateId(), file: null })),
      };
    } else if (entry.body.type === 'binary') {
      // Binary files can't be restored from history (can't serialize File objects)
      newReq.body = { type: 'binary', file: null, fileName: entry.body.fileName };
    } else {
      newReq.body = entry.body;
    }
    // Preserve httpRequest options if available
    if (entry.httpRequest) {
      newReq.httpRequest = { ...entry.httpRequest };
    }
    // Restore the response from history
    if (entry.httpResponse) {
      newReq.httpResponse = entry.httpResponse;
    }
    
    setState(prev => ({
      ...prev,
      request: newReq,
    }));
  }, []);

  const clearHistory = useCallback(async () => {
    await clearAllRequests();
  }, []);

  const deleteHistoryEntry = useCallback(async (id: string) => {
    requestsCollection.delete(id);
  }, []);

  const toggleSidebar = useCallback(() => {
    setState(prev => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }));
  }, []);

  const toggleAiPanel = useCallback(() => {
    setState(prev => ({ ...prev, aiPanelOpen: !prev.aiPanelOpen }));
  }, []);

  const newRequest = useCallback(() => {
    setState(prev => ({
      ...prev,
      request: createNewRequest(),
    }));
  }, []);

  const value: ClientContextType = {
    request: state.request,
    history,
    sidebarCollapsed: state.sidebarCollapsed,
    aiPanelOpen: state.aiPanelOpen,
    setProtocol,
    setMethod,
    setUrl,
    setHeaders,
    setQuery,
    setBody,
    setVariables,
    setOptions,
    executeRequest,
    clearResponse,
    newRequest,
    setGrpcMethodSchema,
    setMcpOperation,
    setMcpSelectedTool,
    setMcpSelectedResource,
    discoverMcpFeatures,
    loadFromHistory,
    clearHistory,
    deleteHistoryEntry,
    toggleSidebar,
    toggleAiPanel,
  };

  return (
    <ClientContext.Provider value={value}>
      {children}
    </ClientContext.Provider>
  );
}
