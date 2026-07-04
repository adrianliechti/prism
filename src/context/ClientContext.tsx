import { useState, useCallback, type ReactNode } from 'react';
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
import { buildOpenAIProxyPath, buildMcpProxyPath } from '../lib/proxy';
import type { McpListFeaturesResponse, OpenAIChatInput, OpenAIEmbeddingsInput, OpenAIRequestData, OpenAIImageFile } from '../types/types';
import { resolveVariables } from '../utils/variables';
import { kvToRecord } from '../utils/format';
import { ClientContext, type ClientContextType } from './clientContextBase';

const defaultHttpOptions: HttpRequest['options'] = { insecure: false, redirect: true };

function createEmptyKeyValue(): KeyValuePair {
  return { id: generateId(), enabled: true, key: '', value: '' };
}

// Response headers injected by the Go proxy for its own functioning; hidden
// from the displayed response (upstream originals arrive as X-Prism-Upstream-*).
const PROXY_INJECTED_HEADERS = new Set([
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'x-prism-status',
]);

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
        options: defaultHttpOptions,
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
          : { method: 'GET', headers: [createEmptyKeyValue()], query: [createEmptyKeyValue()], body, options: defaultHttpOptions, request: null, response: null },
      },
    }));
  }, []);

  const setVariables = useCallback((variables: Variable[]) => {
    updateRequest({ variables });
  }, [updateRequest]);

  const setOptions = useCallback((options: Partial<HttpRequest['options']>) => {
    setState(prev => {
      const currentOptions = prev.request.http?.options ?? defaultHttpOptions;
      const newOptions = { ...currentOptions, ...options };
      return {
        ...prev,
        request: {
          ...prev.request,
          http: prev.request.http
            ? {
                ...prev.request.http,
                options: newOptions,
                request: prev.request.http.request
                  ? { ...prev.request.http.request, options: newOptions }
                  : prev.request.http.request,
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
          // editing arguments must not wipe the schema or the last response
          tool: tool && !tool.schema && prev.request.mcp?.tool?.name === tool.name
            ? { ...tool, schema: prev.request.mcp.tool.schema }
            : tool,
          resource: undefined,
          response: prev.request.mcp?.response,
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
          : { model, chat: { input: [] } },
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
          : { model: '', apiKey, chat: { input: [] } },
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
          : { model: '', chat: { input } },
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
          : { model: '', image: { prompt } },
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
          : { model: '', image: { prompt: '', images } },
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
          : { model: '', audio: { text, voice: 'alloy' } },
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
          : { model: '', audio: { text: '', voice } },
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
          : { model: '', transcription: { file } },
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
          : { model: '', embeddings: { input } },
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
        body: JSON.stringify({ headers: kvToRecord(req.mcp?.headers ?? [], v => resolveVariables(v, req.variables)) }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }
      const features: McpListFeaturesResponse = await response.json();
      if (features.errors?.length && !features.error) {
        features.error = features.errors.join('; ');
      }
      setState(prev => ({ ...prev, isExecuting: false }));
      return features;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, isExecuting: false }));
      return { tools: [], resources: [], error: errorMessage };
    }
  }, [state.request]);

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
    const historyRequest = updatedRequest.openai?.apiKey
      ? { ...updatedRequest, openai: { ...updatedRequest.openai, apiKey: undefined } }
      : updatedRequest;
    const existingInHistory = history.find(h => h.id === historyRequest.id);
    if (existingInHistory) {
      requestsCollection.update(historyRequest.id, (draft) => {
        Object.assign(draft, historyRequest);
      });
    } else {
      requestsCollection.insert(historyRequest);
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
    // Metadata is smuggled as X-Prism-Header-* so browser-generated headers
    // never leak into gRPC metadata and no key gets silently dropped.
    const headersObj: Record<string, string> = { 'Content-Type': 'application/json' };
    for (const kv of (req.grpc?.metadata ?? []).filter(kv => kv.enabled && kv.key)) {
      const key = resolveVariables(kv.key, req.variables).toLowerCase();
      if (key === 'content-type') continue; // reserved by the gRPC protocol itself
      headersObj[`x-prism-header-${key}`] = resolveVariables(kv.value, req.variables);
    }
    const proxyUrl = `/proxy/grpc/${grpcScheme}/${grpcHost}/${grpcService}/${grpcMethod}`;

    const startTime = performance.now();
    const response = await fetch(proxyUrl, { method: 'POST', headers: headersObj, body });
    const duration = Math.round(performance.now() - startTime);

    const responseBody = await response.text();
    const responseMetadata: Record<string, string> = {};
    response.headers.forEach((value, key) => { responseMetadata[key] = value; });

    let error: string | undefined;
    if (!response.ok) {
      const trimmed = responseBody.trim();
      error = trimmed ? trimmed : `HTTP ${response.status}`;
    }

    return {
      ...req,
      executionTime: Date.now(),
      grpc: {
        ...req.grpc,
        body: grpcBody,
        metadata: req.grpc?.metadata ?? [],
        response: { body: responseBody, metadata: responseMetadata, duration, error },
      },
    };
  }

  async function executeMcp(req: Request): Promise<Request> {
    const serverUrl = req.url;
    if (!serverUrl) throw new Error('MCP server URL is required');

    const startTime = performance.now();
    const mcpHeaders = kvToRecord(req.mcp?.headers ?? [], v => resolveVariables(v, req.variables));
    let mcpResult: McpCallToolResponse | McpReadResourceResponse | undefined;

    if (req.mcp?.tool) {
      let args: Record<string, unknown> = {};
      const rawArgs = resolveVariables(req.mcp.tool.arguments, req.variables);
      if (rawArgs.trim()) {
        try {
          args = JSON.parse(rawArgs);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Invalid JSON';
          throw new Error(`Invalid MCP tool arguments: ${message}`, { cause: err });
        }
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

    try {
      new URL(baseUrl);
    } catch {
      throw new Error('Invalid OpenAI API URL. Include the scheme, e.g. https://api.openai.com/v1');
    }

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

      const proxyUrl = buildOpenAIProxyPath(baseUrl, 'responses');
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
        const proxyUrl = buildOpenAIProxyPath(baseUrl, 'images/edits');
        const response = await fetch(proxyUrl, { method: 'POST', headers: openaiBaseHeaders, body: formData });
        if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }
        const data = await response.json();
        const img = (data.data || [])[0] as { b64_json?: string; url?: string } | undefined;
        openaiResponse = { result: { type: 'image', image: img?.b64_json || img?.url || '' }, duration: Math.round(performance.now() - startTime) };
      } else {
        const proxyUrl = buildOpenAIProxyPath(baseUrl, 'images/generations');
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

      const proxyUrl = buildOpenAIProxyPath(baseUrl, 'audio/speech');
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

      const proxyUrl = buildOpenAIProxyPath(baseUrl, 'audio/transcriptions');
      const response = await fetch(proxyUrl, { method: 'POST', headers: openaiBaseHeaders, body: formData });
      if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }
      const data = await response.json();
      openaiResponse = { result: { type: 'transcription', text: data.text || '' }, duration: Math.round(performance.now() - startTime) };
    } else if (req.openai?.embeddings) {
      const texts = (req.openai.embeddings.input ?? []).filter(item => item.text.trim()).map(item => item.text);
      if (texts.length === 0) throw new Error('Please enter at least one text to convert to embeddings');

      const proxyUrl = buildOpenAIProxyPath(baseUrl, 'embeddings');
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
    const resolve = (text: string) => resolveVariables(text, req.variables);
    const resolvedUrl = resolve(req.url);
    const httpMethod = req.http?.method ?? 'GET';

    // Ordered header list so duplicate names are preserved (like curl)
    const headerPairs: Array<[string, string]> = (req.http?.headers ?? [])
      .filter((h: KeyValuePair) => h.enabled && h.key)
      .map((h: KeyValuePair) => [resolve(h.key), resolve(h.value)]);
    const hasHeaderPair = (name: string) =>
      headerPairs.some(([key]) => key.toLowerCase() === name.toLowerCase());
    const addHeaderIfMissing = (name: string, value: string) => {
      if (!hasHeaderPair(name)) headerPairs.push([name, value]);
    };

    const queryParams = new URLSearchParams();

    // Query params from the URL come first, then the KV panel entries
    try {
      const typedUrl = new URL(resolvedUrl);
      typedUrl.searchParams.forEach((value, key) => { queryParams.append(key, value); });
    } catch { /* ignore invalid URLs */ }

    for (const p of (req.http?.query ?? []).filter((p: KeyValuePair) => p.enabled && p.key)) {
      queryParams.append(resolve(p.key), resolve(p.value));
    }

    // Build body
    const httpBody = req.http?.body ?? { type: 'none' as const };
    let body: string | FormData | Blob | undefined;
    let bodyForHistory = '';
    let useFormData = false;

    switch (httpBody.type) {
      case 'json': {
        body = resolve(httpBody.content);
        bodyForHistory = httpBody.content;
        addHeaderIfMissing('Content-Type', 'application/json');
        break;
      }
      case 'xml': {
        body = resolve(httpBody.content);
        bodyForHistory = httpBody.content;
        addHeaderIfMissing('Content-Type', 'application/xml');
        break;
      }
      case 'form-urlencoded': {
        const formParams = new URLSearchParams();
        httpBody.data.filter(f => f.enabled && f.key).forEach(f => formParams.append(resolve(f.key), resolve(f.value)));
        body = formParams.toString();
        bodyForHistory = formParams.toString();
        addHeaderIfMissing('Content-Type', 'application/x-www-form-urlencoded');
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
            formData.append(f.key, resolve(f.value));
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
          addHeaderIfMissing('Content-Type', (httpBody.file as File).type || 'application/octet-stream');
        }
        break;
      case 'raw':
        body = resolve(httpBody.content);
        bodyForHistory = httpBody.content;
        addHeaderIfMissing('Content-Type', 'text/plain');
        break;
    }

    // Options
    const options = req.http?.options ?? defaultHttpOptions;

    // Build proxy URL
    let targetUrl: URL;
    try {
      targetUrl = new URL(resolvedUrl);
    } catch {
      throw new Error('Invalid URL. Include the scheme, e.g. https://example.com');
    }
    let proxyUrl = '/proxy/' + targetUrl.protocol.slice(0, -1) + '/' + targetUrl.host + targetUrl.pathname;
    const queryString = queryParams.toString();
    if (queryString) proxyUrl += '?' + queryString;

    const headersForHistory: Record<string, string> = {};
    for (const [key, value] of headerPairs) {
      headersForHistory[key] = headersForHistory[key] !== undefined ? `${headersForHistory[key]}, ${value}` : value;
    }

    const clientRequest: HttpRequest = {
      method: httpMethod, url: req.url, headers: headersForHistory,
      query: Object.fromEntries(queryParams), body: bodyForHistory, options,
    };

    // Every user header is smuggled as X-Prism-Header-* and unwrapped by the
    // proxy: the browser can neither drop them (fetch's forbidden-header
    // list) nor mix them up with its own automatic headers.
    const fetchHeaders = new Headers();
    for (const [key, value] of headerPairs) {
      if (useFormData && key.toLowerCase() === 'content-type') continue; // browser sets the multipart boundary
      try {
        fetchHeaders.append(`x-prism-header-${key}`, value);
      } catch (err) {
        throw new Error(`Invalid header "${key}"`, { cause: err });
      }
    }
    if (options.insecure) fetchHeaders.set('X-Prism-Insecure', 'true');
    fetchHeaders.set('X-Prism-Redirect', options.redirect ? 'true' : 'false');

    const startTime = performance.now();
    const response = await fetch(proxyUrl, {
      method: httpMethod, headers: fetchHeaders,
      body: body && httpMethod !== 'GET' && httpMethod !== 'HEAD' ? body : undefined,
    });
    const responseBody = await response.blob();
    const duration = Math.round(performance.now() - startTime);

    // The proxy masks 3xx behind X-Prism-Status ("302 Found") when redirect
    // following is off, so the browser fetch doesn't chase Location itself.
    let statusCode = response.status;
    let statusText = response.statusText;
    const masked = response.headers.get('x-prism-status');
    if (masked) {
      const space = masked.indexOf(' ');
      const code = Number(space === -1 ? masked : masked.slice(0, space));
      if (code) {
        statusCode = code;
        statusText = space === -1 ? '' : masked.slice(space + 1);
      }
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (PROXY_INJECTED_HEADERS.has(lower)) return;
      if (lower.startsWith('x-prism-upstream-')) {
        responseHeaders[lower.slice('x-prism-upstream-'.length)] = value;
        return;
      }
      responseHeaders[key] = value;
    });

    return {
      ...req,
      executionTime: Date.now(),
      http: {
        ...req.http!,
        request: clientRequest,
        response: { status: statusText || String(statusCode), statusCode, headers: responseHeaders, body: responseBody, duration },
      },
    };
  }

  const executeRequest = async () => {
    const req = state.request;
    setState(prev => ({ ...prev, isExecuting: true }));

    let updatedRequest: Request;
    try {
      switch (req.protocol) {
        case 'grpc': updatedRequest = await executeGrpc(req); break;
        case 'mcp': updatedRequest = await executeMcp(req); break;
        case 'openai': updatedRequest = await executeOpenAI(req); break;
        default: updatedRequest = await executeRest(req); break;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      updatedRequest = buildErrorRequest(req, errorMessage);
    }

    // Merge only the response back so edits made while the request was in
    // flight (user typing, AI-tool changes) aren't clobbered by the snapshot
    // the execution ran against.
    setState(prev => {
      if (prev.request.id !== req.id || prev.request.protocol !== req.protocol) {
        return { ...prev, isExecuting: false };
      }
      const merged: Request = { ...prev.request, executionTime: updatedRequest.executionTime };
      if (updatedRequest.http) {
        merged.http = { ...(prev.request.http ?? updatedRequest.http), request: updatedRequest.http.request, response: updatedRequest.http.response };
      }
      if (updatedRequest.grpc) {
        merged.grpc = { ...(prev.request.grpc ?? updatedRequest.grpc), response: updatedRequest.grpc.response };
      }
      if (updatedRequest.mcp) {
        merged.mcp = { ...(prev.request.mcp ?? updatedRequest.mcp), response: updatedRequest.mcp.response };
      }
      if (updatedRequest.openai) {
        merged.openai = { ...(prev.request.openai ?? updatedRequest.openai), response: updatedRequest.openai.response };
      }
      return { ...prev, request: merged, isExecuting: false };
    });

    try {
      saveToHistory(updatedRequest);
    } catch (saveErr) {
      console.error('Failed to save request to history:', saveErr);
    }
  };

  // History actions
  const loadFromHistory = useCallback((entry: Request) => {
    const newReq = createNewRequest(entry.name, entry.protocol ?? 'rest');
    // Preserve original IDs so everything matches
    newReq.id = entry.id;
    newReq.url = entry.url;
    newReq.creationTime = entry.creationTime ?? newReq.creationTime;
    newReq.executionTime = entry.executionTime;
    newReq.variables = entry.variables ?? [];
    
    // Restore protocol-specific fields (keeping original IDs)
    if (entry.http) {
      newReq.http = {
        method: entry.http.method,
        headers: [...entry.http.headers],
        query: [...entry.http.query],
        body: entry.http.body,
        options: entry.http.options,
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
    // If we just deleted the active request, replace it so the editor isn't orphaned.
    setState(prev => {
      if (prev.request.id !== id) return prev;
      return { ...prev, request: createNewRequest() };
    });
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
