import { useState, useCallback, useEffect, useEffectEvent, useRef, type ReactNode } from 'react';
import { coalesce, useLiveQuery } from '@tanstack/react-db';
import {
  requestsCollection,
  clearAllRequests,
  generateId,
  loadDrafts,
  saveDraft,
  saveHistoryEntry,
  deleteDraft,
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
import { buildResponsesInput, getOpenAIBodyType, inferOpenAIBodyType, parseResponsesOutput } from '../lib/openai';
import type { McpListFeaturesResponse, McpOAuthClient, OpenAIBodyType, OpenAIChatInput, OpenAIEmbeddingsInput, OpenAIRequestData, OpenAIImageFile } from '../types/types';
import { resolveVariables } from '../utils/variables';
import { kvToRecord } from '../utils/format';
import { ClientContext, type ClientContextType } from './clientContextBase';
import { executeHttp } from '../lib/http';
import { normalizeRequest, queryFromUrl, urlWithQuery } from '../lib/requestUtils';

const defaultHttpOptions: HttpRequest['options'] = { insecure: false, redirect: true, timeout: 30000 };

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
        bodyType: 'chat',
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
        queryInUrl: true,
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
  drafts: Record<string, Request>;
  executingIds: string[];
  loaded: boolean;
  storageError?: string;
  saving: boolean;
  sidebarCollapsed: boolean;
  aiPanelOpen: boolean;
}

const initialState: ClientState = {
  request: createNewRequest(),
  drafts: {},
  executingIds: [],
  loaded: false,
  saving: false,
  sidebarCollapsed: false,
  aiPanelOpen: false,
};

function selectDraft(state: ClientState, request: Request): ClientState {
  return { ...state, drafts: { ...state.drafts, [state.request.id]: state.request }, request };
}

// Switching modes keeps the input of the other modes, so picking a model of
// another kind by mistake loses nothing; only the stale response is dropped.
function withOpenAIBodyType(openai: OpenAIRequestData | undefined, bodyType: OpenAIBodyType): OpenAIRequestData {
  const next: OpenAIRequestData = { model: '', ...openai, bodyType };
  if (getOpenAIBodyType(openai) !== bodyType) next.response = undefined;
  switch (bodyType) {
    case 'chat': next.chat ??= { input: [{ id: generateId(), role: 'user', content: [{ type: 'text', text: '' }] }] }; break;
    case 'image': next.image ??= { prompt: '', images: [{ id: generateId(), data: '' }] }; break;
    case 'audio': next.audio ??= { text: '', voice: 'alloy' }; break;
    case 'transcription': next.transcription ??= { file: '' }; break;
    case 'embeddings': next.embeddings ??= { input: [{ id: generateId(), text: '' }] }; break;
  }
  return next;
}

function mergeResponse(draft: Request, result: Request): Request {
  const merged = { ...draft, executionTime: result.executionTime };
  if (result.http && draft.http) merged.http = { ...draft.http, request: result.http.request, response: result.http.response };
  if (result.grpc && draft.grpc) merged.grpc = { ...draft.grpc, response: result.grpc.response };
  if (result.mcp && draft.mcp) merged.mcp = { ...draft.mcp, response: result.mcp.response };
  if (result.openai && draft.openai) merged.openai = { ...draft.openai, response: result.openai.response };
  return merged;
}

export function ClientProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ClientState>(initialState);
  const executions = useRef(new Map<string, AbortController>());
  const pendingSaves = useRef(0);
  const failedDrafts = useRef(new Set<string>());
  const failedHistory = useRef(new Map<string, Request>());
  const historyWrites = useRef(new Set<string>());
  const workspaceWrite = useRef(Promise.resolve());
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let disposed = false;
    Promise.all([loadDrafts(), fetch('/data/workspace/current', { cache: 'no-store' }).then(async r => {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('Failed to load workspace');
      return r.json() as Promise<{ activeRequestId?: string }>;
    })]).then(([drafts, workspace]) => {
      if (disposed) return;
      const request = drafts.find(d => d.id === workspace?.activeRequestId) ?? drafts.sort((a,b) => b.creationTime-a.creationTime)[0] ?? createNewRequest();
      setState(prev => ({ ...prev, loaded: true, storageError: undefined, request, drafts: Object.fromEntries(drafts.map(d => [d.id,d])) }));
    }).catch(error => { if (!disposed) setState(prev => ({ ...prev, storageError: String(error) })); });
    return () => { disposed = true; };
  }, [reload]);

  const persistDraft = useCallback(async (request: Request) => {
    pendingSaves.current++;
    setState(prev => ({ ...prev, saving: true }));
    try {
      await saveDraft(request);
      failedDrafts.current.delete(request.id);
    } catch (error) {
      failedDrafts.current.add(request.id);
      setState(prev => ({ ...prev, storageError: `Could not save request: ${String(error)}` }));
    }
    finally {
      pendingSaves.current--;
      if (pendingSaves.current === 0) setState(prev => ({ ...prev, saving: false }));
    }
  }, []);

  const { request: current, loaded } = state;
  const persistCurrentDraft = useEffectEvent(() => { void persistDraft(current); });
  useEffect(() => {
    // This effect writes to external storage; the state update reports save progress.
    // oxlint-disable-next-line react/set-state-in-effect
    if (loaded) persistCurrentDraft();
    // Persist editable fields only. Streaming response updates do not rewrite drafts.
  }, [loaded, current.id, current.name, current.protocol, current.url, current.variables,
    current.http?.method, current.http?.body, current.http?.bodyDrafts, current.http?.headers, current.http?.query, current.http?.options,
    current.grpc?.body, current.grpc?.metadata, current.grpc?.schema,
    current.mcp?.tool, current.mcp?.resource, current.mcp?.headers, current.mcp?.oauth,
    current.openai?.model, current.openai?.apiKey, current.openai?.bodyType, current.openai?.chat, current.openai?.image, current.openai?.audio, current.openai?.transcription, current.openai?.embeddings]);

  const persistWorkspace = useCallback((id: string) => {
    // Preserve navigation order even when consecutive writes complete slowly.
    workspaceWrite.current = workspaceWrite.current.then(async () => {
      const response = await fetch('/data/workspace/current', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activeRequestId: id }) });
      if (!response.ok) throw new Error('Could not save active request');
    }).catch(error => setState(prev => ({ ...prev, storageError: String(error) })));
    return workspaceWrite.current;
  }, []);

  useEffect(() => {
    if (loaded) void persistWorkspace(current.id);
  }, [loaded, current.id, persistWorkspace]);

  useEffect(() => {
    const running = executions.current;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingSaves.current || failedDrafts.current.size || failedHistory.current.size) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('beforeunload', beforeUnload); for (const controller of running.values()) controller.abort(); };
  }, []);

  const beginExecution = useCallback((id: string) => {
    if (executions.current.has(id)) return null;
    const controller = new AbortController();
    executions.current.set(id, controller);
    setState(prev => ({ ...prev, executingIds: [...prev.executingIds, id] }));
    return controller;
  }, []);

  const finishExecution = useCallback((id: string, controller: AbortController) => {
    if (executions.current.get(id) !== controller) return;
    executions.current.delete(id);
    setState(prev => ({ ...prev, executingIds: prev.executingIds.filter(key => key !== id) }));
  }, []);

  const cancelRequest = useCallback(() => {
    executions.current.get(state.request.id)?.abort(new Error('Request cancelled'));
  }, [state.request.id]);

  // Use TanStack DB live query for history - sorted by execution time descending.
  // Query refs are proxies, so the fallback must be a query expression, not ??.
  const { data: history = [] } = useLiveQuery((q) =>
    q.from({ req: requestsCollection })
      .orderBy(({ req }) => coalesce(req.executionTime, req.creationTime), 'desc')
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
    setState(prev => {
      if (prev.request.protocol === protocol) return prev;
      const newReq = createNewRequest(prev.request.name, protocol);
      newReq.url = prev.request.url;
      if (newReq.http) newReq.http.query = queryFromUrl(newReq.url);
      return selectDraft(prev, newReq);
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
    setState(prev => ({ ...prev, request: { ...prev.request, url,
      http: prev.request.http ? { ...prev.request.http, query: queryFromUrl(url, prev.request.http.query), queryInUrl: true } : undefined } }));
  }, []);

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
        url: urlWithQuery(prev.request.url, query),
        http: { ...prev.request.http!, query, queryInUrl: true },
      },
    }));
  }, []);

  const setBody = useCallback((body: RequestBody) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        http: prev.request.http
          ? { ...prev.request.http, body, bodyDrafts: { ...prev.request.http.bodyDrafts, [prev.request.http.body.type]: prev.request.http.body, [body.type]: body } }
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

  const setMcpOAuth = useCallback((oauth: McpOAuthClient) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        mcp: { headers: [], ...prev.request.mcp, oauth },
      },
    }));
  }, []);

  // OpenAI-specific setters
  const setOpenAIModel = useCallback((model: string) => {
    setState(prev => {
      // Models no mode fits (realtime, rerankers) keep the current mode
      const bodyType = (model ? inferOpenAIBodyType(model) : undefined) ?? getOpenAIBodyType(prev.request.openai);
      return {
        ...prev,
        request: {
          ...prev.request,
          openai: { ...withOpenAIBodyType(prev.request.openai, bodyType), model },
        },
      };
    });
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

    const controller = beginExecution(req.id);
    if (!controller) return null;
    const timer = window.setTimeout(() => controller.abort(new Error('Discovery timed out')), 30000);

    try {
      const path = buildMcpProxyPath(req.url, 'features');
      if (!path) {
        throw new Error('Invalid MCP server URL');
      }

      const response = await fetch(path, {
        signal: controller.signal, method: 'POST',
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
      return features;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return { tools: [], resources: [], error: errorMessage };
    } finally { window.clearTimeout(timer); finishExecution(req.id, controller); }
  }, [state.request, beginExecution, finishExecution]);

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

  const persistHistory = useCallback(async (entry: Request) => {
    if (historyWrites.current.has(entry.id)) return;
    historyWrites.current.add(entry.id);
    pendingSaves.current++;
    setState(prev => ({ ...prev, saving: true }));
    try {
      await saveHistoryEntry(entry);
      failedHistory.current.delete(entry.id);
    } catch (error) {
      failedHistory.current.set(entry.id, entry);
      setState(prev => ({ ...prev, storageError: `Could not save history: ${String(error)}` }));
    } finally {
      historyWrites.current.delete(entry.id);
      pendingSaves.current--;
      if (pendingSaves.current === 0) setState(prev => ({ ...prev, saving: false }));
    }
  }, []);

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
      switch (getOpenAIBodyType(req.openai)) {
        case 'chat': errorResult = { type: 'text', text: '' }; break;
        case 'image': errorResult = { type: 'image', image: '' }; break;
        case 'audio': errorResult = { type: 'audio', audio: '' }; break;
        case 'transcription': errorResult = { type: 'transcription', text: '' }; break;
        case 'embeddings': errorResult = { type: 'embeddings', embeddings: [] }; break;
      }
      return { ...req, executionTime, openai: { ...req.openai!, response: { result: errorResult, duration: 0, error: errorMessage } } };
    }
    return { ...req, executionTime, http: { ...req.http!, response: { status: '', statusCode: 0, headers: {}, body: new Blob(), duration: 0, error: errorMessage } } };
  }

  // --- Per-protocol execute functions ---

  async function executeGrpc(req: Request, signal: AbortSignal): Promise<Request> {
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
    const response = await fetch(proxyUrl, { signal, method: 'POST', headers: headersObj, body });
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

  async function executeMcp(req: Request, signal: AbortSignal): Promise<Request> {
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
        signal, method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: req.mcp.tool.name, arguments: args, headers: mcpHeaders }),
      });
      if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }
      mcpResult = await response.json();
    } else if (req.mcp?.resource) {
      const path = buildMcpProxyPath(serverUrl, 'resource/call');
      if (!path) throw new Error('Invalid MCP server URL');

      const response = await fetch(path, {
        signal, method: 'POST',
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

  async function executeOpenAI(req: Request, signal: AbortSignal): Promise<Request> {
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
    const bodyType = getOpenAIBodyType(req.openai);
    let openaiResponse: OpenAIRequestData['response'];

    if (bodyType === 'chat') {
      const input = buildResponsesInput(req.openai?.chat?.input ?? []);
      if (input.length === 0) throw new Error('Please enter at least one message');

      const proxyUrl = buildOpenAIProxyPath(baseUrl, 'responses');
      const response = await fetch(proxyUrl, { signal, method: 'POST', headers: openaiHeaders, body: JSON.stringify({ model, input }) });
      if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }

      const data = await response.json();
      openaiResponse = { result: { type: 'text', text: parseResponsesOutput(data) }, duration: Math.round(performance.now() - startTime) };
    } else if (bodyType === 'image') {
      const prompt = req.openai?.image?.prompt ?? '';
      const images = req.openai?.image?.images ?? [];
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
        const response = await fetch(proxyUrl, { signal, method: 'POST', headers: openaiBaseHeaders, body: formData });
        if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }
        const data = await response.json();
        const img = (data.data || [])[0] as { b64_json?: string; url?: string } | undefined;
        openaiResponse = { result: { type: 'image', image: img?.b64_json || img?.url || '' }, duration: Math.round(performance.now() - startTime) };
      } else {
        const proxyUrl = buildOpenAIProxyPath(baseUrl, 'images/generations');
        const response = await fetch(proxyUrl, { signal, method: 'POST', headers: openaiHeaders, body: JSON.stringify({ model, prompt, response_format: 'b64_json' }) });
        if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }
        const data = await response.json();
        const img = (data.data || [])[0] as { b64_json?: string; url?: string } | undefined;
        openaiResponse = { result: { type: 'image', image: img?.b64_json || img?.url || '' }, duration: Math.round(performance.now() - startTime) };
      }
    } else if (bodyType === 'audio') {
      const text = req.openai?.audio?.text ?? '';
      const voice = req.openai?.audio?.voice ?? 'alloy';
      if (!text) throw new Error('Please enter text to convert to speech');

      const proxyUrl = buildOpenAIProxyPath(baseUrl, 'audio/speech');
      const response = await fetch(proxyUrl, { signal, method: 'POST', headers: openaiHeaders, body: JSON.stringify({ model, input: text, voice }) });
      if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }

      const audioBlob = await response.blob();
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => { resolve((reader.result as string).split(',')[1] || ''); };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });
      openaiResponse = { result: { type: 'audio', audio: audioBase64 }, duration: Math.round(performance.now() - startTime) };
    } else if (bodyType === 'transcription') {
      const dataUrl = req.openai?.transcription?.file ?? '';
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
      const response = await fetch(proxyUrl, { signal, method: 'POST', headers: openaiBaseHeaders, body: formData });
      if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }
      const data = await response.json();
      openaiResponse = { result: { type: 'transcription', text: data.text || '' }, duration: Math.round(performance.now() - startTime) };
    } else {
      const texts = (req.openai?.embeddings?.input ?? []).filter(item => item.text.trim()).map(item => item.text);
      if (texts.length === 0) throw new Error('Please enter at least one text to convert to embeddings');

      const proxyUrl = buildOpenAIProxyPath(baseUrl, 'embeddings');
      const response = await fetch(proxyUrl, { signal, method: 'POST', headers: openaiHeaders, body: JSON.stringify({ model, input: texts }) });
      if (!response.ok) { const t = await response.text(); throw new Error(t || `HTTP ${response.status}`); }
      const data = await response.json();
      openaiResponse = { result: { type: 'embeddings', embeddings: (data.data || []).map((item: { embedding: number[] }) => item.embedding) }, duration: Math.round(performance.now() - startTime) };
    }

    return { ...req, executionTime: Date.now(), openai: { ...req.openai!, response: openaiResponse } };
  }


  const executeRequest = async () => {
    const req = state.request;
    const controller = beginExecution(req.id);
    if (!controller) return;
    const timeout = req.http?.options.timeout ?? 30000;
    const timer = timeout > 0 ? window.setTimeout(() => controller.abort(new Error(`Request timed out after ${timeout / 1000}s`)), timeout) : undefined;
    let latest: Request | undefined;
    const publish = (result: Request) => {
      latest = result;
      setState(prev => {
        if (prev.request.id === req.id) return { ...prev, request: mergeResponse(prev.request, result) };
        const draft = prev.drafts[req.id];
        return draft ? { ...prev, drafts: { ...prev.drafts, [req.id]: mergeResponse(draft, result) } } : prev;
      });
    };
    let updatedRequest: Request;
    try {
      switch (req.protocol) {
        case 'grpc': updatedRequest = await executeGrpc(req, controller.signal); break;
        case 'mcp': updatedRequest = await executeMcp(req, controller.signal); break;
        case 'openai': updatedRequest = await executeOpenAI(req, controller.signal); break;
        default: updatedRequest = await executeHttp(req, controller.signal, publish); break;
      }
    } catch (err) {
      const failure = controller.signal.aborted ? controller.signal.reason : err;
      const message = failure instanceof Error ? failure.message : 'Request failed';
      if (latest?.http?.response) {
        updatedRequest = { ...latest, http: { ...latest.http, response: { ...latest.http.response, streaming: false, interrupted: message } } };
      } else updatedRequest = buildErrorRequest(req, message);
    } finally { window.clearTimeout(timer); }
    publish(updatedRequest);
    finishExecution(req.id, controller);
    await persistHistory({ ...updatedRequest, id: generateId(), requestId: req.id });
  };

  const loadFromHistory = useCallback((entry: Request) => {
    const request = normalizeRequest({ ...entry, id: generateId(), requestId: undefined, creationTime: Date.now() });
    setState(prev => selectDraft(prev, request));
  }, []);

  const selectRequest = useCallback((id: string) => {
    setState(prev => prev.request.id === id || !prev.drafts[id] ? prev : selectDraft(prev, prev.drafts[id]));
  }, []);

  const deleteRequest = useCallback(async (id: string) => {
    executions.current.get(id)?.abort(new Error('Request deleted'));
    try {
      await deleteDraft(id);
      failedDrafts.current.delete(id);
      setState(prev => {
        const drafts = { ...prev.drafts };
        delete drafts[id];
        return { ...prev, drafts, request: prev.request.id === id ? Object.values(drafts)[0] ?? createNewRequest() : prev.request };
      });
    } catch (error) { setState(prev => ({ ...prev, storageError: String(error) })); }
  }, []);

  const clearHistory = useCallback(async () => {
    try { await clearAllRequests(); }
    catch (error) { setState(prev => ({ ...prev, storageError: String(error) })); }
  }, []);

  const deleteHistoryEntry = useCallback(async (id: string) => {
    try { await requestsCollection.delete(id).isPersisted.promise; }
    catch (error) { setState(prev => ({ ...prev, storageError: String(error) })); }
  }, []);

  const toggleSidebar = useCallback(() => {
    setState(prev => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }));
  }, []);

  const toggleAiPanel = useCallback(() => {
    setState(prev => ({ ...prev, aiPanelOpen: !prev.aiPanelOpen }));
  }, []);

  const newRequest = useCallback(() => {
    setState(prev => selectDraft(prev, createNewRequest()));
  }, []);

  const retrySave = () => {
    setState(prev => ({ ...prev, storageError: undefined }));
    const drafts = { ...state.drafts, [state.request.id]: state.request };
    for (const id of new Set([...failedDrafts.current, state.request.id])) {
      if (drafts[id]) void persistDraft(drafts[id]);
    }
    for (const entry of failedHistory.current.values()) void persistHistory(entry);
    void persistWorkspace(state.request.id);
  };

  const value: ClientContextType = {
    request: state.request,
    isExecuting: state.executingIds.includes(state.request.id),
    executingIds: state.executingIds,
    drafts: Object.values({ ...state.drafts, [state.request.id]: state.request }).sort((a,b) => b.creationTime-a.creationTime),
    selectRequest,
    deleteRequest,
    cancelRequest,
    setName: name => updateRequest({ name }),
    storageError: state.storageError,
    isSaving: state.saving,
    retrySave,
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
    setMcpOAuth,
    discoverMcpFeatures,
    setOpenAIModel,
    setOpenAIApiKey,
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

  if (!state.loaded) return <div className="h-screen flex flex-col items-center justify-center gap-3 text-sm text-neutral-500">
    {state.storageError || 'Loading saved requests…'}
    {state.storageError && <button className="px-3 py-1 border rounded" onClick={() => setReload(n => n + 1)}>Retry</button>}
  </div>;

  return (
    <ClientContext.Provider value={value}>
      {children}
    </ClientContext.Provider>
  );
}
