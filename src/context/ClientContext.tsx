/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { KeyValuePair, HttpMethod, Protocol, Request, RequestBody, Variable } from '../types/types';
import type { ClientRequest } from '../types/client';
import { getValue, setValue, deleteValue, listEntries } from '../lib/data';
import { resolveVariables } from '../utils/variables';

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

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
  history: Request[];
  sidebarCollapsed: boolean;
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
  
  // History actions
  loadFromHistory: (entry: Request) => void;
  clearHistory: () => void;
  deleteHistoryEntry: (id: string) => void;
  
  // Sidebar
  toggleSidebar: () => void;
}

export const ClientContext = createContext<ClientContextType | null>(null);

// Serialized format for storing in IndexedDB
interface SerializedRequest extends Omit<Request, 'httpResponse'> {
  httpResponse: {
    status: string;
    statusCode: number;
    headers: Record<string, string>;
    content: string;
    contentType: string;
    duration: number;
    error?: string;
  } | null;
}

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

async function serializeRequest(req: Request): Promise<SerializedRequest> {
  // Handle body serialization
  let body = req.body;
  if (req.body.type === 'form-data') {
    body = {
      ...req.body,
      data: req.body.data.map(f => ({ ...f, file: null })),
    };
  } else if (req.body.type === 'binary') {
    body = { ...req.body, file: null };
  }

  // Handle response body serialization (Blob -> base64)
  let httpResponse: SerializedRequest['httpResponse'] = null;
  if (req.httpResponse) {
    const content = req.httpResponse.body instanceof Blob
      ? await blobToBase64(req.httpResponse.body)
      : '';
    const contentType = req.httpResponse.body instanceof Blob
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
    ...req,
    body,
    httpResponse,
  };
}

async function saveRequest(req: Request): Promise<void> {
  const serialized = await serializeRequest(req);
  await setValue(req.id, serialized);
}

function deserializeHistory(serialized: SerializedRequest[]): Request[] {
  return serialized.map(req => {
    // Reconstruct Blob from base64
    let httpResponse = null;
    if (req.httpResponse) {
      const body = req.httpResponse.content
        ? base64ToBlob(req.httpResponse.content, req.httpResponse.contentType)
        : new Blob([]);
      
      httpResponse = {
        status: req.httpResponse.status,
        statusCode: req.httpResponse.statusCode,
        headers: req.httpResponse.headers,
        body,
        duration: req.httpResponse.duration,
        error: req.httpResponse.error,
      };
    }

    return {
      ...req,
      protocol: req.protocol ?? 'rest',
      variables: req.variables ?? [],
      httpResponse,
    };
  });
}

const initialState: ClientState = {
  request: createNewRequest(),
  history: [],
  sidebarCollapsed: false,
};

export function ClientProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ClientState>(initialState);

  // Load history from storage on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const entries = await listEntries();
        const requests = await Promise.all(
          entries.map(async (entry) => {
            const serialized = await getValue<SerializedRequest>(entry.id);
            return serialized ? deserializeHistory([serialized])[0] : null;
          })
        );
        const history = requests
          .filter((r): r is Request => r !== null)
          .sort((a, b) => (b.executionTime ?? b.creationTime) - (a.executionTime ?? a.creationTime));
        setState(prev => ({ ...prev, history }));
      } catch (error) {
        console.error('Failed to load history:', error);
      }
    }
    loadHistory();
  }, []);

  // Helper to update request
  const updateRequest = useCallback((updates: Partial<Request>) => {
    setState(prev => ({
      ...prev,
      request: { ...prev.request, ...updates },
    }));
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

        const clientRequest = {
          method: 'POST' as const,
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

        // Save to filesystem
        saveRequest(updatedRequest);

        setState(prev => {
          const existingIndex = prev.history.findIndex(h => h.id === req.id);
          let newHistory: Request[];

          if (existingIndex >= 0) {
            newHistory = [...prev.history];
            newHistory[existingIndex] = updatedRequest;
          } else {
            newHistory = [updatedRequest, ...prev.history];
          }

          newHistory = newHistory
            .sort((a, b) => (b.executionTime ?? 0) - (a.executionTime ?? 0))
            .slice(0, 100);

          return {
            ...prev,
            request: updatedRequest,
            history: newHistory,
          };
        });

        return;
      }

      // REST mode (existing logic)
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
              headersObj['Content-Type'] = req.body.file.type || 'application/octet-stream';
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
      const clientRequest = {
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
      
      // Save to filesystem
      saveRequest(updatedRequest);

      // Update history - find existing entry by id and update, or add new
      setState(prev => {
        const existingIndex = prev.history.findIndex(h => h.id === req.id);
        let newHistory: Request[];
        
        if (existingIndex >= 0) {
          // Update in place
          newHistory = [...prev.history];
          newHistory[existingIndex] = updatedRequest;
        } else {
          // Add new entry
          newHistory = [updatedRequest, ...prev.history];
        }
        
        // Sort by executionTime descending and limit to 100
        newHistory = newHistory
          .sort((a, b) => (b.executionTime ?? 0) - (a.executionTime ?? 0))
          .slice(0, 100);
        
        return {
          ...prev,
          request: updatedRequest,
          history: newHistory,
        };
      });
      
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
      
      // Save to filesystem
      saveRequest(updatedRequest);

      // Update history with failed request too
      setState(prev => {
        const existingIndex = prev.history.findIndex(h => h.id === req.id);
        let newHistory: Request[];
        
        if (existingIndex >= 0) {
          newHistory = [...prev.history];
          newHistory[existingIndex] = updatedRequest;
        } else {
          newHistory = [updatedRequest, ...prev.history];
        }
        
        newHistory = newHistory
          .sort((a, b) => (b.executionTime ?? 0) - (a.executionTime ?? 0))
          .slice(0, 100);
        
        return {
          ...prev,
          request: updatedRequest,
          history: newHistory,
        };
      });
    }
  }, [state.request, updateRequest]);

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
    const entries = await listEntries();
    await Promise.all(entries.map(entry => deleteValue(entry.id)));
    setState(prev => ({ ...prev, history: [] }));
  }, []);

  const deleteHistoryEntry = useCallback(async (id: string) => {
    await deleteValue(id);
    setState(prev => ({
      ...prev,
      history: prev.history.filter(h => h.id !== id),
    }));
  }, []);

  const toggleSidebar = useCallback(() => {
    setState(prev => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }));
  }, []);

  const newRequest = useCallback(() => {
    setState(prev => ({
      ...prev,
      request: createNewRequest(),
    }));
  }, []);

  const value: ClientContextType = {
    request: state.request,
    history: state.history,
    sidebarCollapsed: state.sidebarCollapsed,
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
    loadFromHistory,
    clearHistory,
    deleteHistoryEntry,
    toggleSidebar,
  };

  return (
    <ClientContext.Provider value={value}>
      {children}
    </ClientContext.Provider>
  );
}
