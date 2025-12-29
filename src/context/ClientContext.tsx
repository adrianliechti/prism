/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { KeyValuePair, HttpMethod, Request, RequestBody } from '../types/types';
import type { ClientRequest } from '../types/client';

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
    method: 'GET',
    url: '',
    headers: [createEmptyKeyValue()],
    query: [createEmptyKeyValue()],
    body: { type: 'none' },
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
  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setHeaders: (headers: KeyValuePair[]) => void;
  setQuery: (params: KeyValuePair[]) => void;
  setBody: (body: RequestBody) => void;
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

const STORAGE_KEY = 'prism-history';

function loadHistoryFromStorage(): Request[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveHistoryToStorage(history: Request[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage errors
  }
}

const initialState: ClientState = {
  request: createNewRequest(),
  history: [],
  sidebarCollapsed: false,
};

export function ClientProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ClientState>(() => ({
    ...initialState,
    history: loadHistoryFromStorage(),
  }));

  // Persist history to localStorage
  useEffect(() => {
    saveHistoryToStorage(state.history);
  }, [state.history]);

  // Helper to update request
  const updateRequest = useCallback((updates: Partial<Request>) => {
    setState(prev => ({
      ...prev,
      request: { ...prev.request, ...updates },
    }));
  }, []);

  // Request actions
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

      // Build params
      const queryObj: Record<string, string> = {};
      req.query.filter(p => p.enabled && p.key).forEach(p => {
        queryObj[p.key] = p.value;
      });

      // Build body based on type
      let body = '';
      switch (req.body.type) {
        case 'json':
          body = req.body.content;
          if (!headersObj['Content-Type']) {
            headersObj['Content-Type'] = 'application/json';
          }
          break;
        case 'form-urlencoded': {
          const formParams = new URLSearchParams();
          req.body.data.filter(f => f.enabled && f.key).forEach(f => {
            formParams.append(f.key, f.value);
          });
          body = formParams.toString();
          if (!headersObj['Content-Type']) {
            headersObj['Content-Type'] = 'application/x-www-form-urlencoded';
          }
          break;
        }
        case 'form-data': {
          const formObj: Record<string, string> = {};
          req.body.data.filter(f => f.enabled && f.key).forEach(f => {
            formObj[f.key] = f.value;
          });
          body = JSON.stringify(formObj);
          if (!headersObj['Content-Type']) {
            headersObj['Content-Type'] = 'multipart/form-data';
          }
          break;
        }
        case 'raw':
          body = req.body.content;
          if (!headersObj['Content-Type']) {
            headersObj['Content-Type'] = 'text/plain';
          }
          break;
      }

      const clientRequest: ClientRequest = {
        method: req.method,
        url: req.url,
        headers: headersObj,
        query: queryObj,
        body,
        options: req.httpRequest?.options ?? { insecure: false, redirect: true },
      };

      const response = await fetch('/api/http/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientRequest),
      });

      if (!response.ok) {
        throw new Error(`Proxy error: ${response.statusText}`);
      }

      const clientResponse = await response.json();
      const executionTime = Date.now();
      
      // Update current request with response
      const updatedRequest: Request = {
        ...req,
        executionTime,
        httpRequest: clientRequest,
        httpResponse: clientResponse,
        executing: false,
      };
      
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
        body: '',
        duration: 0,
        error: errorMessage,
      };
      
      const updatedRequest: Request = {
        ...req,
        executionTime,
        httpResponse: errorResponse,
        executing: false,
      };
      
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
    newReq.method = entry.method;
    newReq.url = entry.url;
    newReq.headers = entry.headers.map(h => ({ ...h, id: generateId() }));
    newReq.query = entry.query.map(p => ({ ...p, id: generateId() }));
    // Clone body with new IDs for form data
    if (entry.body.type === 'form-urlencoded' || entry.body.type === 'form-data') {
      newReq.body = {
        type: entry.body.type,
        data: entry.body.data.map(f => ({ ...f, id: generateId() })),
      };
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

  const clearHistory = useCallback(() => {
    setState(prev => ({ ...prev, history: [] }));
  }, []);

  const deleteHistoryEntry = useCallback((id: string) => {
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
    setMethod,
    setUrl,
    setHeaders,
    setQuery,
    setBody,
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
