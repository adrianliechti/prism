/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { KeyValuePair, BodyType, HttpMethod, ApiRequest, ApiResponse, RequestTab, HistoryEntry } from '../types/api';

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function createEmptyKeyValue(): KeyValuePair {
  return { id: generateId(), enabled: true, key: '', value: '' };
}

function createNewTab(name?: string): RequestTab {
  return {
    id: generateId(),
    name: name || 'New Request',
    method: 'GET',
    url: '',
    headers: [createEmptyKeyValue()],
    query: [createEmptyKeyValue()],
    bodyType: 'none',
    bodyContent: '',
    formData: [createEmptyKeyValue()],
    insecure: false,
    redirect: true,
    response: null,
    isLoading: false,
    error: null,
  };
}

interface ApiClientState {
  request: RequestTab;
  history: HistoryEntry[];
  sidebarCollapsed: boolean;
}

interface ApiClientContextType {
  // State
  request: RequestTab;
  history: HistoryEntry[];
  sidebarCollapsed: boolean;
  
  // Request actions
  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setHeaders: (headers: KeyValuePair[]) => void;
  setQuery: (params: KeyValuePair[]) => void;
  setBodyType: (type: BodyType) => void;
  setBodyContent: (content: string) => void;
  setFormData: (data: KeyValuePair[]) => void;
  setInsecure: (insecure: boolean) => void;
  setRedirect: (redirect: boolean) => void;
  executeRequest: () => Promise<void>;
  clearResponse: () => void;
  newRequest: () => void;
  
  // History actions
  loadFromHistory: (entry: HistoryEntry) => void;
  clearHistory: () => void;
  deleteHistoryEntry: (id: string) => void;
  
  // Sidebar
  toggleSidebar: () => void;
}

export const ApiClientContext = createContext<ApiClientContextType | null>(null);

const STORAGE_KEY = 'prism-history';

function loadHistoryFromStorage(): HistoryEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveHistoryToStorage(history: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage errors
  }
}

const initialRequest = createNewTab();
const initialState: ApiClientState = {
  request: initialRequest,
  history: [],
  sidebarCollapsed: false,
};

export function ApiClientProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ApiClientState>(() => ({
    ...initialState,
    history: loadHistoryFromStorage(),
  }));

  // Persist history to localStorage
  useEffect(() => {
    saveHistoryToStorage(state.history);
  }, [state.history]);

  // Helper to update request
  const updateRequest = useCallback((updates: Partial<RequestTab>) => {
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

  const setBodyType = useCallback((bodyType: BodyType) => {
    updateRequest({ bodyType });
  }, [updateRequest]);

  const setBodyContent = useCallback((bodyContent: string) => {
    updateRequest({ bodyContent });
  }, [updateRequest]);

  const setFormData = useCallback((formData: KeyValuePair[]) => {
    updateRequest({ formData });
  }, [updateRequest]);

  const setInsecure = useCallback((insecure: boolean) => {
    updateRequest({ insecure });
  }, [updateRequest]);

  const setRedirect = useCallback((redirect: boolean) => {
    updateRequest({ redirect });
  }, [updateRequest]);

  const clearResponse = useCallback(() => {
    updateRequest({ response: null, error: null });
  }, [updateRequest]);

  const executeRequest = useCallback(async () => {
    const req = state.request;

    updateRequest({ isLoading: true, error: null });

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
      if (req.bodyType === 'json') {
        body = req.bodyContent;
        if (!headersObj['Content-Type']) {
          headersObj['Content-Type'] = 'application/json';
        }
      } else if (req.bodyType === 'form-urlencoded') {
        const formParams = new URLSearchParams();
        req.formData.filter(f => f.enabled && f.key).forEach(f => {
          formParams.append(f.key, f.value);
        });
        body = formParams.toString();
        if (!headersObj['Content-Type']) {
          headersObj['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      } else if (req.bodyType === 'form-data') {
        const formObj: Record<string, string> = {};
        req.formData.filter(f => f.enabled && f.key).forEach(f => {
          formObj[f.key] = f.value;
        });
        body = JSON.stringify(formObj);
        if (!headersObj['Content-Type']) {
          headersObj['Content-Type'] = 'multipart/form-data';
        }
      } else if (req.bodyType === 'raw') {
        body = req.bodyContent;
        if (!headersObj['Content-Type']) {
          headersObj['Content-Type'] = 'text/plain';
        }
      }

      const apiRequest: ApiRequest = {
        method: req.method,
        url: req.url,
        headers: headersObj,
        query: queryObj,
        body,
        options: {
          insecure: req.insecure,
          redirect: req.redirect,
        },
      };

      const response = await fetch('/api/http/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiRequest),
      });

      if (!response.ok) {
        throw new Error(`Proxy error: ${response.statusText}`);
      }

      const apiResponse: ApiResponse = await response.json();
      
      // Update request with response
      updateRequest({ response: apiResponse, isLoading: false });
      
      // Add to history
      const historyEntry: HistoryEntry = {
        id: generateId(),
        timestamp: Date.now(),
        method: req.method,
        url: req.url,
        statusCode: apiResponse.statusCode,
        duration: apiResponse.duration,
        request: {
          headers: req.headers,
          query: req.query,
          bodyType: req.bodyType,
          bodyContent: req.bodyContent,
          formData: req.formData,
          insecure: req.insecure,
          redirect: req.redirect,
        },
        response: apiResponse,
      };
      
      setState(prev => ({
        ...prev,
        history: [historyEntry, ...prev.history].slice(0, 100), // Keep last 100 entries
      }));
      
    } catch (err) {
      updateRequest({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [state.request, updateRequest]);

  // History actions
  const loadFromHistory = useCallback((entry: HistoryEntry) => {
    const newRequest = createNewTab();
    newRequest.method = entry.method;
    newRequest.url = entry.url;
    newRequest.headers = entry.request.headers.map(h => ({ ...h, id: generateId() }));
    newRequest.query = entry.request.query.map(p => ({ ...p, id: generateId() }));
    newRequest.bodyType = entry.request.bodyType;
    newRequest.bodyContent = entry.request.bodyContent;
    newRequest.formData = entry.request.formData.map(f => ({ ...f, id: generateId() }));
    newRequest.insecure = entry.request.insecure;
    newRequest.redirect = entry.request.redirect;
    
    setState(prev => ({
      ...prev,
      request: newRequest,
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
      request: createNewTab(),
    }));
  }, []);

  const value: ApiClientContextType = {
    request: state.request,
    history: state.history,
    sidebarCollapsed: state.sidebarCollapsed,
    setMethod,
    setUrl,
    setHeaders,
    setQuery,
    setBodyType,
    setBodyContent,
    setFormData,
    setInsecure,
    setRedirect,
    executeRequest,
    clearResponse,
    newRequest,
    loadFromHistory,
    clearHistory,
    deleteHistoryEntry,
    toggleSidebar,
  };

  return (
    <ApiClientContext.Provider value={value}>
      {children}
    </ApiClientContext.Provider>
  );
}
