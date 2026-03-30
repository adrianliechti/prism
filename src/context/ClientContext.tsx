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
  type HttpRequest,
  type McpCallToolResponse,
  type McpReadResourceResponse,
} from '../lib/data';
import type { McpListFeaturesResponse, OpenAIChatInput, OpenAIEmbeddingsInput, OpenAIBodyType, OpenAIRequestData, OpenAIImageFile } from '../types/types';
import { resolveVariables } from '../utils/variables';
import { kvToRecord } from '../utils/format';

function createEmptyKeyValue(): KeyValuePair {
  return { id: generateId(), enabled: true, key: '', value: '' };
}

function createNewRequest(name?: string, protocol: Protocol = 'rest'): Request {
  const base: Request = {
    id: generateId(),
    name: name || 'New Request',
    protocol,
    url: '',
    variables: [],
    creationTime: Date.now(),
    executionTime: null,
  };

  switch (protocol) {
    case 'grpc':
      base.grpc = {
        body: '',
        metadata: [createEmptyKeyValue()],
      };
      break;
    case 'mcp':
      base.mcp = {
        headers: [createEmptyKeyValue()],
      };
      break;
    case 'openai':
      base.openai = {
        model: '',
        chat: {
          input: [{ id: generateId(), role: 'user', content: [{ type: 'text', text: '' }] }],
        },
      };
      break;
    case 'rest':
    default:
      base.http = {
        method: 'GET',
        headers: [createEmptyKeyValue()],
        query: [createEmptyKeyValue()],
        body: { type: 'none' },
        request: null,
        response: null,
      };
      break;
  }

  return base;
}

interface ClientState {
  request: Request;
  isExecuting: boolean;
  sidebarCollapsed: boolean;
  aiPanelOpen: boolean;
}

interface ClientContextType {
  // State
  request: Request;
  isExecuting: boolean;
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
  setOptions: (options: Partial<HttpRequest['options']>) => void;
  executeRequest: () => Promise<void>;
  clearResponse: () => void;
  newRequest: () => void;
  
  // gRPC-specific actions
  setGrpcBody: (body: string) => void;
  setGrpcMetadata: (metadata: KeyValuePair[]) => void;
  setGrpcMethodSchema: (schema: Record<string, unknown> | undefined) => void;
  
  // MCP-specific actions
  setMcpTool: (tool: { name: string; arguments: string; schema?: Record<string, unknown> } | undefined) => void;
  setMcpResource: (resource: { uri: string } | undefined) => void;
  setMcpHeaders: (headers: KeyValuePair[]) => void;
  discoverMcpFeatures: () => Promise<McpListFeaturesResponse | null>;
  
  // OpenAI-specific actions
  setOpenAIModel: (model: string) => void;
  setOpenAIModels: (models: string[]) => void;
  setOpenAIApiKey: (apiKey: string) => void;
  setOpenAIBodyType: (bodyType: OpenAIBodyType) => void;
  setOpenAIChatInput: (input: OpenAIChatInput[]) => void;
  setOpenAIImagePrompt: (prompt: string) => void;
  setOpenAIImageFiles: (images: OpenAIImageFile[]) => void;
  setOpenAIAudioText: (text: string) => void;
  setOpenAIAudioVoice: (voice: string) => void;
  setOpenAITranscriptionFile: (file: string) => void;
  setOpenAIEmbeddingsInput: (input: OpenAIEmbeddingsInput[]) => void;
  
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
  isExecuting: false,
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

  const buildOpenAIProxyPath = useCallback((baseUrl: string, endpoint: string) => {
    try {
      const url = new URL(baseUrl);
      const scheme = url.protocol.replace(/:$/, '');
      const host = url.host;
      const cleanEndpoint = endpoint.replace(/^\//, '');
      return `/proxy/${scheme}/${host}/${cleanEndpoint}`;
    } catch {
      return '';
    }
  }, []);

  // Request actions
  const setProtocol = useCallback((protocol: Protocol) => {
    // When changing protocol, preserve only URL and reset the protocol-specific data
    setState(prev => {
      const newReq = createNewRequest(prev.request.name, protocol);
      newReq.id = prev.request.id;
      newReq.url = prev.request.url;
      return { ...prev, request: newReq };
    });
  }, []);

  const setMethod = useCallback((method: HttpMethod) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        http: { ...prev.request.http!, method },
      },
    }));
  }, []);

  const setUrl = useCallback((url: string) => {
    updateRequest({ url });
  }, [updateRequest]);

  const setHeaders = useCallback((headers: KeyValuePair[]) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        http: { ...prev.request.http!, headers },
      },
    }));
  }, []);

  const setQuery = useCallback((query: KeyValuePair[]) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        http: { ...prev.request.http!, query },
      },
    }));
  }, []);

  const setBody = useCallback((body: RequestBody) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        http: prev.request.http
          ? { ...prev.request.http, body }
          : { method: 'GET', headers: [createEmptyKeyValue()], query: [createEmptyKeyValue()], body, request: null, response: null },
      },
    }));
  }, []);

  const setVariables = useCallback((variables: Variable[]) => {
    updateRequest({ variables });
  }, [updateRequest]);

  const setOptions = useCallback((options: Partial<HttpRequest['options']>) => {
    setState(prev => {
      const currentRequest = prev.request.http?.request;
      const currentOptions = currentRequest?.options ?? { insecure: false, redirect: true };
      const newOptions = { ...currentOptions, ...options };
      return {
        ...prev,
        request: {
          ...prev.request,
          http: prev.request.http
            ? {
                ...prev.request.http,
                request: currentRequest
                  ? { ...currentRequest, options: newOptions }
                  : null,
              }
            : undefined,
        },
      };
    });
  }, []);

  // gRPC-specific setters
  const setGrpcBody = useCallback((body: string) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        grpc: prev.request.grpc
          ? { ...prev.request.grpc, body }
          : { body, metadata: [createEmptyKeyValue()] },
      },
    }));
  }, []);

  const setGrpcMetadata = useCallback((metadata: KeyValuePair[]) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        grpc: prev.request.grpc
          ? { ...prev.request.grpc, metadata }
          : { body: '', metadata },
      },
    }));
  }, []);

  const setGrpcMethodSchema = useCallback((schema: Record<string, unknown> | undefined) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        grpc: prev.request.grpc
          ? { ...prev.request.grpc, schema }
          : { body: '', metadata: [createEmptyKeyValue()], schema },
      },
    }));
  }, []);

  // MCP-specific setters
  const setMcpTool = useCallback((tool: { name: string; arguments: string; schema?: Record<string, unknown> } | undefined) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        mcp: { 
          headers: prev.request.mcp?.headers ?? [createEmptyKeyValue()],
          tool, 
          resource: undefined 
        },
      },
    }));
  }, []);

  const setMcpResource = useCallback((resource: { uri: string } | undefined) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        mcp: { 
          headers: prev.request.mcp?.headers ?? [createEmptyKeyValue()],
          resource, 
          tool: undefined 
        },
      },
    }));
  }, []);

  const setMcpHeaders = useCallback((headers: KeyValuePair[]) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        mcp: prev.request.mcp
          ? { ...prev.request.mcp, headers }
          : { headers },
      },
    }));
  }, []);

  // OpenAI-specific setters
  const setOpenAIModel = useCallback((model: string) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        openai: prev.request.openai
          ? { ...prev.request.openai, model }
          : { model, headers: [createEmptyKeyValue()], chat: { input: [] } },
      },
    }));
  }, []);

  const setOpenAIModels = useCallback((models: string[]) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        openai: prev.request.openai
          ? { ...prev.request.openai, models }
          : { model: '', models, headers: [createEmptyKeyValue()], chat: { input: [] } },
      },
    }));
  }, []);

  const setOpenAIApiKey = useCallback((apiKey: string) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        openai: prev.request.openai
          ? { ...prev.request.openai, apiKey }
          : { model: '', apiKey, headers: [createEmptyKeyValue()], chat: { input: [] } },
      },
    }));
  }, []);

  const setOpenAIBodyType = useCallback((bodyType: 'chat' | 'image' | 'audio' | 'transcription' | 'embeddings') => {
    setState(prev => {
      const currentOpenAI = prev.request.openai;
      const newOpenAI: OpenAIRequestData = {
        model: currentOpenAI?.model ?? '',
        apiKey: currentOpenAI?.apiKey,
        ...(bodyType === 'chat' 
          ? { chat: currentOpenAI?.chat ?? { input: [{ id: generateId(), role: 'user', content: [{ type: 'text', text: '' }] }] } }
          : bodyType === 'image'
          ? { image: currentOpenAI?.image ?? { prompt: '', images: [{ id: generateId(), data: '' }] } }
          : bodyType === 'audio'
          ? { audio: currentOpenAI?.audio ?? { text: '', voice: 'alloy' } }
          : bodyType === 'transcription'
          ? { transcription: currentOpenAI?.transcription ?? { file: '' } }
          : { embeddings: currentOpenAI?.embeddings ?? { input: [{ id: generateId(), text: '' }] } }
        ),
      };
      return {
        ...prev,
        request: {
          ...prev.request,
          openai: newOpenAI,
        },
      };
    });
  }, []);

  const setOpenAIChatInput = useCallback((input: OpenAIChatInput[]) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        openai: prev.request.openai
          ? { ...prev.request.openai, chat: { input } }
          : { model: '', headers: [createEmptyKeyValue()], chat: { input } },
      },
    }));
  }, []);

  const setOpenAIImagePrompt = useCallback((prompt: string) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        openai: prev.request.openai
          ? { ...prev.request.openai, image: { ...prev.request.openai.image, prompt } }
          : { model: '', headers: [createEmptyKeyValue()], image: { prompt } },
      },
    }));
  }, []);

  const setOpenAIImageFiles = useCallback((images: OpenAIImageFile[]) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        openai: prev.request.openai
          ? { ...prev.request.openai, image: { prompt: prev.request.openai.image?.prompt ?? '', images } }
          : { model: '', headers: [createEmptyKeyValue()], image: { prompt: '', images } },
      },
    }));
  }, []);

  const setOpenAIAudioText = useCallback((text: string) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        openai: prev.request.openai
          ? { ...prev.request.openai, audio: { ...prev.request.openai.audio, text } }
          : { model: '', headers: [createEmptyKeyValue()], audio: { text, voice: 'alloy' } },
      },
    }));
  }, []);

  const setOpenAIAudioVoice = useCallback((voice: string) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        openai: prev.request.openai
          ? { ...prev.request.openai, audio: { text: prev.request.openai.audio?.text ?? '', voice } }
          : { model: '', headers: [createEmptyKeyValue()], audio: { text: '', voice } },
      },
    }));
  }, []);

  const setOpenAITranscriptionFile = useCallback((file: string) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        openai: prev.request.openai
          ? { ...prev.request.openai, transcription: { file } }
          : { model: '', headers: [createEmptyKeyValue()], transcription: { file } },
      },
    }));
  }, []);

  const setOpenAIEmbeddingsInput = useCallback((input: OpenAIEmbeddingsInput[]) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        openai: prev.request.openai
          ? { ...prev.request.openai, embeddings: { input } }
          : { model: '', headers: [createEmptyKeyValue()], embeddings: { input } },
      },
    }));
  }, []);

  // Discover MCP features from server
  const discoverMcpFeatures = useCallback(async (): Promise<McpListFeaturesResponse | null> => {
    const req = state.request;
    if (!req.url) return null;

    setState(prev => ({ ...prev, isExecuting: true }));

    try {
      const path = buildMcpProxyPath(req.url, 'features');
      if (!path) {
        throw new Error('Invalid MCP server URL');
      }

      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers: kvToRecord(req.mcp?.headers ?? []) }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }
      const features: McpListFeaturesResponse = await response.json();
      setState(prev => ({ ...prev, isExecuting: false }));
      return features;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, isExecuting: false }));
      return { tools: [], resources: [], error: errorMessage };
    }
  }, [state.request, updateRequest, buildMcpProxyPath]);

  const clearResponse = useCallback(() => {
    setState(prev => {
      const { protocol } = prev.request;
      if (protocol === 'grpc' && prev.request.grpc) {
        return {
          ...prev,
          request: {
            ...prev.request,
            grpc: { ...prev.request.grpc, response: undefined },
          },
        };
      } else if (protocol === 'mcp' && prev.request.mcp) {
        return {
          ...prev,
          request: {
            ...prev.request,
            mcp: { ...prev.request.mcp, response: undefined },
          },
        };
      } else if (protocol === 'openai' && prev.request.openai) {
        return {
          ...prev,
          request: {
            ...prev.request,
            openai: { ...prev.request.openai, response: undefined },
          },
        };
      } else if (prev.request.http) {
        return {
          ...prev,
          request: {
            ...prev.request,
            http: { ...prev.request.http, response: null },
          },
        };
      }
      return prev;
    });
  }, []);

  // Save request to history (insert or update)
  const saveToHistory = useCallback((updatedRequest: Request) => {
    const existingInHistory = history.find(h => h.id === updatedRequest.id);
    if (existingInHistory) {
      requestsCollection.update(updatedRequest.id, (draft) => {
        Object.assign(draft, updatedRequest);
      });
    } else {
      requestsCollection.insert(updatedRequest);
    }
  }, [history]);

  // Build error response for a failed request
  function buildErrorRequest(req: Request, errorMessage: string): Request {
    const executionTime = Date.now();
    if (req.protocol === 'grpc') {
      return { ...req, executionTime, grpc: { ...req.grpc!, response: { body: '', duration: 0, error: errorMessage } } };
    }
    if (req.protocol === 'mcp') {
      return { ...req, executionTime, mcp: { headers: req.mcp?.headers ?? [], tool: req.mcp?.tool, resource: req.mcp?.resource, response: { result: undefined, duration: 0, error: errorMessage } } };
    }
    if (req.protocol === 'openai') {
      let errorResult: NonNullable<OpenAIRequestData['response']>['result'];
      if (req.openai?.chat) errorResult = { type: 'text', text: '' };
      else if (req.openai?.image) errorResult = { type: 'image', image: '' };
      else if (req.openai?.audio) errorResult = { type: 'audio', audio: '' };
      else if (req.openai?.transcription) errorResult = { type: 'transcription', text: '' };
      else if (req.openai?.embeddings) errorResult = { type: 'embeddings', embeddings: [] };
      else errorResult = { type: 'text', text: '' };
      return { ...req, executionTime, openai: { ...req.openai!, response: { result: errorResult, duration: 0, error: errorMessage } } };
    }
    return { ...req, executionTime, http: { ...req.http!, response: { status: '', statusCode: 0, headers: {}, body: new Blob(), duration: 0, error: errorMessage } } };
  }

  // --- Per-protocol execute functions ---

  async function executeGrpc(req: Request): Promise<Request> {
    const match = req.url.match(/^(grpcs?):\/\/([^/]+)\/(.+)\/([^/]+)$/);
    if (!match) {
      throw new Error('Invalid gRPC URL format. Expected: grpc://host:port/service/method');
    }
    const [, grpcScheme, grpcHost, grpcService, grpcMethod] = match;

    const grpcBody = req.grpc?.body ?? '{}';
    const body = resolveVariables(grpcBody, req.variables);
    const headersObj: Record<string, string> = { 'Content-Type': 'application/json', ...kvToRecord(req.grpc?.metadata ?? []) };
    const proxyUrl = `/proxy/grpc/${grpcScheme}/${grpcHost}/${grpcService}/${grpcMethod}`;

    const startTime = performance.now();
    const response = await fetch(proxyUrl, { method: 'POST', headers: headersObj, body });
    const duration = Math.round(performance.now() - startTime);

    const responseBody = await response.text();
    const responseMetadata: Record<string, string> = {};
    response.headers.forEach((value, key) => { responseMetadata[key] = value; });

    return {
      ...req,
      executionTime: Date.now(),
      grpc: {
        ...req.grpc,
        body: grpcBody,
        metadata: req.grpc?.metadata ?? [],
        response: { body: responseBody, metadata: responseMetadata, duration, error: response.ok ? undefined : `HTTP ${response.status}` },
      },
    };
  }

  async function executeMcp(req: Request): Promise<Request> {
    const serverUrl = req.url;
    if (!serverUrl) throw new Error('MCP server URL is required');

    const startTime = performance.now();
    const mcpHeaders = kvToRecord(req.mcp?.headers ?? []);
    let mcpResult: McpCallToolResponse | McpReadResourceResponse | undefined;

    if (req.mcp?.tool) {
      let args: Record<string, unknown> = {};
      if (req.mcp.tool.arguments) {
        try { args = JSON.parse(req.mcp.tool.arguments); } catch { /* empty args */ }
      }

      const path = buildMcpProxyPath(serverUrl, 'tool/call');
      if (!path) throw new Error('Invalid MCP server URL');

      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: req.mcp.tool.name, arguments: args, headers: mcpHeaders }),
      });
      if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }
      mcpResult = await response.json();
    } else if (req.mcp?.resource) {
      const path = buildMcpProxyPath(serverUrl, 'resource/call');
      if (!path) throw new Error('Invalid MCP server URL');

      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: req.mcp.resource.uri, headers: mcpHeaders }),
      });
      if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }
      mcpResult = await response.json();
    } else {
      throw new Error('No tool or resource selected');
    }

    return {
      ...req,
      executionTime: Date.now(),
      mcp: { ...req.mcp, response: { result: mcpResult, duration: Math.round(performance.now() - startTime) } },
    };
  }

  async function executeOpenAI(req: Request): Promise<Request> {
    const baseUrl = req.url.replace(/\/$/, '');
    const model = req.openai?.model;
    const apiKey = req.openai?.apiKey;

    if (!baseUrl) throw new Error('OpenAI API URL is required');
    if (!model) throw new Error('Please select a model');

    const openaiBaseHeaders: Record<string, string> = {};
    if (apiKey) openaiBaseHeaders['Authorization'] = `Bearer ${apiKey}`;
    const openaiHeaders: Record<string, string> = { ...openaiBaseHeaders, 'Content-Type': 'application/json' };

    const startTime = performance.now();
    let openaiResponse: OpenAIRequestData['response'];

    if (req.openai?.chat) {
      const input = (req.openai.chat.input ?? []).map(msg => ({
        role: msg.role,
        content: msg.content.map(c => {
          switch (c.type) {
            case 'text':
              return { type: 'input_text', text: c.text };
            case 'file':
              if (c.data.startsWith('data:image/')) {
                return { type: 'input_image', image_url: c.data };
              } else {
                return { type: 'input_file', filename: c.name || 'file', file_data: c.data };
              }
          }
        }),
      }));

      const proxyUrl = buildOpenAIProxyPath(baseUrl, '/v1/responses');
      const response = await fetch(proxyUrl, { method: 'POST', headers: openaiHeaders, body: JSON.stringify({ model, input }) });
      if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }

      const data = await response.json();
      let chatOutput = '';
      if (data.output && Array.isArray(data.output)) {
        for (const item of data.output) {
          if (item.type === 'message' && item.content) {
            for (const content of item.content) {
              if (content.type === 'output_text') chatOutput += content.text;
            }
          }
        }
      }
      openaiResponse = { result: { type: 'text', text: chatOutput }, duration: Math.round(performance.now() - startTime) };
    } else if (req.openai?.image) {
      const prompt = req.openai.image.prompt ?? '';
      const images = req.openai.image.images ?? [];
      const validImages = images.filter(img => img.data.length > 0);
      if (!prompt) throw new Error('Please enter an image prompt');

      if (validImages.length > 0) {
        const formData = new FormData();
        formData.append('model', model);
        formData.append('prompt', prompt);
        for (const img of validImages) {
          const dataUrlMatch = img.data.match(/^data:([^;]+);base64,(.+)$/);
          if (dataUrlMatch) {
            const binary = atob(dataUrlMatch[2]);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
            formData.append('image[]', new Blob([array], { type: dataUrlMatch[1] }), 'image.png');
          }
        }
        const proxyUrl = buildOpenAIProxyPath(baseUrl, '/v1/images/edits');
        const response = await fetch(proxyUrl, { method: 'POST', headers: openaiBaseHeaders, body: formData });
        if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }
        const data = await response.json();
        const img = (data.data || [])[0] as { b64_json?: string; url?: string } | undefined;
        openaiResponse = { result: { type: 'image', image: img?.b64_json || img?.url || '' }, duration: Math.round(performance.now() - startTime) };
      } else {
        const proxyUrl = buildOpenAIProxyPath(baseUrl, '/v1/images/generations');
        const response = await fetch(proxyUrl, { method: 'POST', headers: openaiHeaders, body: JSON.stringify({ model, prompt, response_format: 'b64_json' }) });
        if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }
        const data = await response.json();
        const img = (data.data || [])[0] as { b64_json?: string; url?: string } | undefined;
        openaiResponse = { result: { type: 'image', image: img?.b64_json || img?.url || '' }, duration: Math.round(performance.now() - startTime) };
      }
    } else if (req.openai?.audio) {
      const text = req.openai.audio.text ?? '';
      const voice = req.openai.audio.voice ?? 'alloy';
      if (!text) throw new Error('Please enter text to convert to speech');

      const proxyUrl = buildOpenAIProxyPath(baseUrl, '/v1/audio/speech');
      const response = await fetch(proxyUrl, { method: 'POST', headers: openaiHeaders, body: JSON.stringify({ model, input: text, voice }) });
      if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }

      const audioBlob = await response.blob();
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => { resolve((reader.result as string).split(',')[1] || ''); };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });
      openaiResponse = { result: { type: 'audio', audio: audioBase64 }, duration: Math.round(performance.now() - startTime) };
    } else if (req.openai?.transcription) {
      const dataUrl = req.openai.transcription.file ?? '';
      if (!dataUrl) throw new Error('Please select an audio file to transcribe');

      const [mimeTypePart, base64] = dataUrl.split(',');
      const mimeType = mimeTypePart?.split(':')[1]?.split(';')[0] || 'audio/mpeg';
      const extension = mimeType.split('/')[1] || 'mp3';
      const audioData = atob(base64 || '');
      const audioArray = new Uint8Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) audioArray[i] = audioData.charCodeAt(i);

      const formData = new FormData();
      formData.append('file', new Blob([audioArray], { type: mimeType }), `audio.${extension}`);
      formData.append('model', model);

      const proxyUrl = buildOpenAIProxyPath(baseUrl, '/v1/audio/transcriptions');
      const response = await fetch(proxyUrl, { method: 'POST', headers: openaiBaseHeaders, body: formData });
      if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }
      const data = await response.json();
      openaiResponse = { result: { type: 'transcription', text: data.text || '' }, duration: Math.round(performance.now() - startTime) };
    } else if (req.openai?.embeddings) {
      const texts = (req.openai.embeddings.input ?? []).filter(item => item.text.trim()).map(item => item.text);
      if (texts.length === 0) throw new Error('Please enter at least one text to convert to embeddings');

      const proxyUrl = buildOpenAIProxyPath(baseUrl, '/v1/embeddings');
      const response = await fetch(proxyUrl, { method: 'POST', headers: openaiHeaders, body: JSON.stringify({ model, input: texts }) });
      if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }
      const data = await response.json();
      openaiResponse = { result: { type: 'embeddings', embeddings: (data.data || []).map((item: { embedding: number[] }) => item.embedding) }, duration: Math.round(performance.now() - startTime) };
    } else {
      throw new Error('Invalid OpenAI request type');
    }

    return { ...req, executionTime: Date.now(), openai: { ...req.openai!, response: openaiResponse } };
  }

  async function executeRest(req: Request): Promise<Request> {
    const headersObj: Record<string, string> = kvToRecord(req.http?.headers ?? []);
    const queryParams = new URLSearchParams();
    const httpMethod = req.http?.method ?? 'GET';

    // Merge query params from KV pairs
    for (const p of (req.http?.query ?? []).filter((p: KeyValuePair) => p.enabled && p.key)) {
      queryParams.append(p.key, p.value);
    }

    // Merge query params from the URL itself
    try {
      const typedUrl = new URL(req.url);
      typedUrl.searchParams.forEach((value, key) => { queryParams.append(key, value); });
    } catch { /* ignore invalid URLs */ }

    // Build body
    const httpBody = req.http?.body ?? { type: 'none' as const };
    let body: string | FormData | Blob | undefined;
    let bodyForHistory = '';
    let useFormData = false;

    switch (httpBody.type) {
      case 'json': {
        body = resolveVariables(httpBody.content, req.variables);
        bodyForHistory = httpBody.content;
        if (!headersObj['Content-Type']) headersObj['Content-Type'] = 'application/json';
        break;
      }
      case 'form-urlencoded': {
        const formParams = new URLSearchParams();
        httpBody.data.filter(f => f.enabled && f.key).forEach(f => formParams.append(f.key, f.value));
        body = formParams.toString();
        bodyForHistory = formParams.toString();
        if (!headersObj['Content-Type']) headersObj['Content-Type'] = 'application/x-www-form-urlencoded';
        break;
      }
      case 'form-data': {
        const formData = new FormData();
        const formDescription: string[] = [];
        httpBody.data.filter(f => f.enabled && f.key).forEach(f => {
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
        break;
      }
      case 'binary':
        if (httpBody.file) {
          body = httpBody.file;
          bodyForHistory = `[Binary file: ${httpBody.fileName}]`;
          if (!headersObj['Content-Type']) headersObj['Content-Type'] = (httpBody.file as File).type || 'application/octet-stream';
        }
        break;
      case 'raw':
        body = httpBody.content;
        bodyForHistory = httpBody.content;
        if (!headersObj['Content-Type']) headersObj['Content-Type'] = 'text/plain';
        break;
    }

    // Options
    const options = req.http?.request?.options ?? { insecure: false, redirect: true };
    if (options.insecure) headersObj['X-Prism-Insecure'] = 'true';
    headersObj['X-Prism-Redirect'] = options.redirect ? 'true' : 'false';

    // Build proxy URL
    const targetUrl = new URL(req.url);
    let proxyUrl = '/proxy/' + targetUrl.protocol.slice(0, -1) + '/' + targetUrl.host + targetUrl.pathname;
    const queryString = queryParams.toString();
    if (queryString) proxyUrl += '?' + queryString;

    const clientRequest: HttpRequest = {
      method: httpMethod, url: req.url, headers: headersObj,
      query: Object.fromEntries(queryParams), body: bodyForHistory, options,
    };

    const fetchHeaders: Record<string, string> = { ...headersObj };
    if (useFormData) delete fetchHeaders['Content-Type'];

    const startTime = performance.now();
    const response = await fetch(proxyUrl, {
      method: httpMethod, headers: fetchHeaders,
      body: body && httpMethod !== 'GET' && httpMethod !== 'HEAD' ? body : undefined,
    });
    const duration = Math.round(performance.now() - startTime);

    const responseBody = await response.blob();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => { responseHeaders[key] = value; });

    return {
      ...req,
      executionTime: Date.now(),
      http: {
        ...req.http!,
        request: clientRequest,
        response: { status: response.statusText || String(response.status), statusCode: response.status, headers: responseHeaders, body: responseBody, duration },
      },
    };
  }

  const executeRequest = useCallback(async () => {
    const req = state.request;
    setState(prev => ({ ...prev, isExecuting: true }));

    try {
      let updatedRequest: Request;
      switch (req.protocol) {
        case 'grpc': updatedRequest = await executeGrpc(req); break;
        case 'mcp': updatedRequest = await executeMcp(req); break;
        case 'openai': updatedRequest = await executeOpenAI(req); break;
        default: updatedRequest = await executeRest(req); break;
      }
      saveToHistory(updatedRequest);
      setState(prev => ({ ...prev, request: updatedRequest, isExecuting: false }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const updatedRequest = buildErrorRequest(req, errorMessage);
      saveToHistory(updatedRequest);
      setState(prev => ({ ...prev, request: updatedRequest, isExecuting: false }));
    }
  }, [state.request, saveToHistory, buildMcpProxyPath, buildOpenAIProxyPath]);

  // History actions
  const loadFromHistory = useCallback((entry: Request) => {
    const newReq = createNewRequest(entry.name, entry.protocol ?? 'rest');
    // Preserve original IDs so everything matches
    newReq.id = entry.id;
    newReq.url = entry.url;
    newReq.executionTime = entry.executionTime;
    newReq.variables = entry.variables ?? [];
    
    // Restore protocol-specific fields (keeping original IDs)
    if (entry.http) {
      newReq.http = {
        method: entry.http.method,
        headers: [...entry.http.headers],
        query: [...entry.http.query],
        body: entry.http.body,
        request: entry.http.request,
        response: entry.http.response,
      };
      // Handle special body types
      if (entry.http.body.type === 'form-data') {
        // Note: File objects can't be serialized, so files will be lost
        newReq.http.body = {
          type: 'form-data',
          data: entry.http.body.data.map(f => ({ ...f, file: null })),
        };
      } else if (entry.http.body.type === 'binary') {
        // Binary files can't be restored from history (can't serialize File objects)
        newReq.http.body = { type: 'binary', file: null, fileName: entry.http.body.fileName };
      }
    }
    if (entry.grpc) {
      newReq.grpc = { ...entry.grpc };
    }
    if (entry.mcp) {
      newReq.mcp = { ...entry.mcp };
    }
    if (entry.openai) {
      newReq.openai = { ...entry.openai };
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
    isExecuting: state.isExecuting,
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
    setGrpcBody,
    setGrpcMetadata,
    setGrpcMethodSchema,
    setMcpTool,
    setMcpResource,
    setMcpHeaders,
    discoverMcpFeatures,
    setOpenAIModel,
    setOpenAIModels,
    setOpenAIApiKey,
    setOpenAIBodyType,
    setOpenAIChatInput,
    setOpenAIImagePrompt,
    setOpenAIImageFiles,
    setOpenAIAudioText,
    setOpenAIAudioVoice,
    setOpenAITranscriptionFile,
    setOpenAIEmbeddingsInput,
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
