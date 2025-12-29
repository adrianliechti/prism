import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { KeyValuePair, BodyType, HttpMethod, ProxyRequest, ProxyResponse } from '../types/api';

interface ApiClientState {
  method: HttpMethod;
  url: string;
  headers: KeyValuePair[];
  queryParams: KeyValuePair[];
  bodyType: BodyType;
  bodyContent: string;
  formData: KeyValuePair[];
  response: ProxyResponse | null;
  isLoading: boolean;
  error: string | null;
}

interface ApiClientContextType extends ApiClientState {
  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setHeaders: (headers: KeyValuePair[]) => void;
  setQueryParams: (params: KeyValuePair[]) => void;
  setBodyType: (type: BodyType) => void;
  setBodyContent: (content: string) => void;
  setFormData: (data: KeyValuePair[]) => void;
  executeRequest: () => Promise<void>;
  clearResponse: () => void;
}

const ApiClientContext = createContext<ApiClientContextType | null>(null);

export function useApiClient() {
  const context = useContext(ApiClientContext);
  if (!context) {
    throw new Error('useApiClient must be used within an ApiClientProvider');
  }
  return context;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function createEmptyKeyValue(): KeyValuePair {
  return { id: generateId(), enabled: true, key: '', value: '' };
}

const initialState: ApiClientState = {
  method: 'GET',
  url: '',
  headers: [createEmptyKeyValue()],
  queryParams: [createEmptyKeyValue()],
  bodyType: 'none',
  bodyContent: '',
  formData: [createEmptyKeyValue()],
  response: null,
  isLoading: false,
  error: null,
};

export function ApiClientProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ApiClientState>(initialState);

  const setMethod = useCallback((method: HttpMethod) => {
    setState(prev => ({ ...prev, method }));
  }, []);

  const setUrl = useCallback((url: string) => {
    setState(prev => ({ ...prev, url }));
  }, []);

  const setHeaders = useCallback((headers: KeyValuePair[]) => {
    setState(prev => ({ ...prev, headers }));
  }, []);

  const setQueryParams = useCallback((queryParams: KeyValuePair[]) => {
    setState(prev => ({ ...prev, queryParams }));
  }, []);

  const setBodyType = useCallback((bodyType: BodyType) => {
    setState(prev => ({ ...prev, bodyType }));
  }, []);

  const setBodyContent = useCallback((bodyContent: string) => {
    setState(prev => ({ ...prev, bodyContent }));
  }, []);

  const setFormData = useCallback((formData: KeyValuePair[]) => {
    setState(prev => ({ ...prev, formData }));
  }, []);

  const clearResponse = useCallback(() => {
    setState(prev => ({ ...prev, response: null, error: null }));
  }, []);

  const executeRequest = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Build URL with query params
      let finalUrl = state.url;
      const enabledParams = state.queryParams.filter(p => p.enabled && p.key);
      if (enabledParams.length > 0) {
        const searchParams = new URLSearchParams();
        enabledParams.forEach(p => searchParams.append(p.key, p.value));
        const separator = finalUrl.includes('?') ? '&' : '?';
        finalUrl = `${finalUrl}${separator}${searchParams.toString()}`;
      }

      // Build headers
      const headersObj: Record<string, string> = {};
      state.headers.filter(h => h.enabled && h.key).forEach(h => {
        headersObj[h.key] = h.value;
      });

      // Build body based on type
      let body = '';
      if (state.bodyType === 'json') {
        body = state.bodyContent;
        if (!headersObj['Content-Type']) {
          headersObj['Content-Type'] = 'application/json';
        }
      } else if (state.bodyType === 'form-urlencoded') {
        const formParams = new URLSearchParams();
        state.formData.filter(f => f.enabled && f.key).forEach(f => {
          formParams.append(f.key, f.value);
        });
        body = formParams.toString();
        if (!headersObj['Content-Type']) {
          headersObj['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      } else if (state.bodyType === 'form-data') {
        // For form-data, we'll send as JSON object and let the proxy handle it
        // In a real implementation, you'd use FormData and handle multipart
        const formObj: Record<string, string> = {};
        state.formData.filter(f => f.enabled && f.key).forEach(f => {
          formObj[f.key] = f.value;
        });
        body = JSON.stringify(formObj);
        if (!headersObj['Content-Type']) {
          headersObj['Content-Type'] = 'multipart/form-data';
        }
      } else if (state.bodyType === 'raw') {
        body = state.bodyContent;
        if (!headersObj['Content-Type']) {
          headersObj['Content-Type'] = 'text/plain';
        }
      }

      const proxyRequest: ProxyRequest = {
        method: state.method,
        url: finalUrl,
        headers: headersObj,
        body,
      };

      const response = await fetch('/api/http/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyRequest),
      });

      if (!response.ok) {
        throw new Error(`Proxy error: ${response.statusText}`);
      }

      const proxyResponse: ProxyResponse = await response.json();
      setState(prev => ({ ...prev, response: proxyResponse, isLoading: false }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, [state.method, state.url, state.headers, state.queryParams, state.bodyType, state.bodyContent, state.formData]);

  const value: ApiClientContextType = {
    ...state,
    setMethod,
    setUrl,
    setHeaders,
    setQueryParams,
    setBodyType,
    setBodyContent,
    setFormData,
    executeRequest,
    clearResponse,
  };

  return (
    <ApiClientContext.Provider value={value}>
      {children}
    </ApiClientContext.Provider>
  );
}
