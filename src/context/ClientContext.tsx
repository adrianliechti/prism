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
import type { McpListFeaturesResponse, OpenAIChatInput, OpenAIBodyType, OpenAIRequestData } from '../types/types';
import { resolveVariables } from '../utils/variables';

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
    executing: false,
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
          input: [{ id: generateId(), role: 'user', content: [{ type: 'input_text', text: '' }] }],
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
  setOpenAIBodyType: (bodyType: OpenAIBodyType) => void;
  setOpenAIChatInput: (input: OpenAIChatInput[]) => void;
  setOpenAIImagePrompt: (prompt: string) => void;
  setOpenAIAudioText: (text: string) => void;
  setOpenAIAudioVoice: (voice: string) => void;
  setOpenAITranscriptionFile: (file: string) => void;
  setOpenAIEmbeddingsText: (text: string) => void;
  
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
          : { method: 'GET', headers: [], query: [], body, request: null, response: null },
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
          : { body, metadata: [] },
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
          : { body: '', metadata: [], schema },
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
          : { model, chat: { input: [] } },
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
          : { model: '', models, chat: { input: [] } },
      },
    }));
  }, []);

  const setOpenAIBodyType = useCallback((bodyType: 'chat' | 'image' | 'audio' | 'transcription' | 'embeddings') => {
    setState(prev => {
      const currentOpenAI = prev.request.openai;
      const newOpenAI: OpenAIRequestData = {
        model: currentOpenAI?.model ?? '',
        ...(bodyType === 'chat' 
          ? { chat: currentOpenAI?.chat ?? { input: [{ id: generateId(), role: 'user', content: [{ type: 'input_text', text: '' }] }] } }
          : bodyType === 'image'
          ? { image: currentOpenAI?.image ?? { prompt: '' } }
          : bodyType === 'audio'
          ? { audio: currentOpenAI?.audio ?? { text: '', voice: 'alloy' } }
          : bodyType === 'transcription'
          ? { transcription: currentOpenAI?.transcription ?? { file: '' } }
          : { embeddings: currentOpenAI?.embeddings ?? { text: '' } }
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
          ? { ...prev.request.openai, image: { prompt } }
          : { model: '', image: { prompt } },
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

  const setOpenAIEmbeddingsText = useCallback((text: string) => {
    setState(prev => ({
      ...prev,
      request: {
        ...prev.request,
        openai: prev.request.openai
          ? { ...prev.request.openai, embeddings: { text } }
          : { model: '', embeddings: { text } },
      },
    }));
  }, []);

  // Discover MCP features from server
  const discoverMcpFeatures = useCallback(async (): Promise<McpListFeaturesResponse | null> => {
    const req = state.request;
    if (!req.url) return null;

    updateRequest({ executing: true });

    try {
      const path = buildMcpProxyPath(req.url, 'features');
      if (!path) {
        throw new Error('Invalid MCP server URL');
      }

      // Convert KeyValuePair[] to headers object
      const mcpHeaders: Record<string, string> = {};
      for (const kv of req.mcp?.headers ?? []) {
        if (kv.enabled && kv.key) {
          mcpHeaders[kv.key] = kv.value;
        }
      }

      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers: mcpHeaders }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }
      const features: McpListFeaturesResponse = await response.json();
      updateRequest({ executing: false });
      return features;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      updateRequest({ executing: false });
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

  const executeRequest = useCallback(async () => {
    const req = state.request;

    updateRequest({ executing: true });

    try {
      // gRPC mode
      if (req.protocol === 'grpc') {
        // Parse grpc://host/service/method URL
        const grpcUrl = req.url;
        const match = grpcUrl.match(/^grpc:\/\/([^/]+)\/(.+)\/([^/]+)$/);
        if (!match) {
          throw new Error('Invalid gRPC URL format. Expected: grpc://host:port/service/method');
        }
        const [, grpcHost, grpcService, grpcMethod] = match;

        // gRPC uses its own body field
        const grpcBody = req.grpc?.body ?? '{}';
        const body = resolveVariables(grpcBody, req.variables);

        // Build headers from metadata
        const headersObj: Record<string, string> = { 'Content-Type': 'application/json' };
        (req.grpc?.metadata ?? []).filter((h: KeyValuePair) => h.enabled && h.key).forEach((h: KeyValuePair) => {
          headersObj[h.key] = h.value;
        });

        // Build gRPC proxy URL: /proxy/grpc/{host}/{service}/{method}
        const proxyUrl = `/proxy/grpc/${grpcHost}/${grpcService}/${grpcMethod}`;

        const startTime = performance.now();
        const response = await fetch(proxyUrl, {
          method: 'POST',
          headers: headersObj,
          body,
        });
        const duration = Math.round(performance.now() - startTime);

        const responseBody = await response.text();
        const responseMetadata: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseMetadata[key] = value;
        });

        const executionTime = Date.now();
        const updatedRequest: Request = {
          ...req,
          executionTime,
          executing: false,
          grpc: {
            ...req.grpc,
            body: grpcBody,
            metadata: req.grpc?.metadata ?? [],
            response: {
              body: responseBody,
              metadata: responseMetadata,
              duration,
              error: response.ok ? undefined : `HTTP ${response.status}`,
            },
          },
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
        let mcpResult: McpCallToolResponse | McpReadResourceResponse | undefined;

        // Determine what to execute based on tool/resource
        if (req.mcp?.tool) {
          // Call a tool - arguments are stored in tool.arguments as JSON string
          let args: Record<string, unknown> = {};
          if (req.mcp.tool.arguments) {
            try {
              args = JSON.parse(req.mcp.tool.arguments);
            } catch {
              // Ignore parse errors, use empty args
            }
          }

          // Convert KeyValuePair[] to headers object
          const mcpHeaders: Record<string, string> = {};
          for (const kv of req.mcp?.headers ?? []) {
            if (kv.enabled && kv.key) {
              mcpHeaders[kv.key] = kv.value;
            }
          }

          const path = buildMcpProxyPath(serverUrl, 'tool/call');
          if (!path) throw new Error('Invalid MCP server URL');

          const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: req.mcp.tool.name, arguments: args, headers: mcpHeaders }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP ${response.status}`);
          }

          const result: McpCallToolResponse = await response.json();
          mcpResult = result;
        } else if (req.mcp?.resource) {
          // Read a resource
          const path = buildMcpProxyPath(serverUrl, 'resource/call');
          if (!path) throw new Error('Invalid MCP server URL');

          // Convert KeyValuePair[] to headers object
          const mcpHeaders: Record<string, string> = {};
          for (const kv of req.mcp?.headers ?? []) {
            if (kv.enabled && kv.key) {
              mcpHeaders[kv.key] = kv.value;
            }
          }

          const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uri: req.mcp.resource.uri, headers: mcpHeaders }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP ${response.status}`);
          }

          const result: McpReadResourceResponse = await response.json();
          mcpResult = result;
        } else {
          throw new Error('No tool or resource selected');
        }

        const duration = Math.round(performance.now() - startTime);
        const executionTime = Date.now();
        const updatedRequest: Request = {
          ...req,
          executionTime,
          executing: false,
          mcp: {
            ...req.mcp,
            response: {
              result: mcpResult,
              duration,
            },
          },
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

      // OpenAI mode
      if (req.protocol === 'openai') {
        const baseUrl = req.url.replace(/\/$/, '');
        const model = req.openai?.model;
        const isChat = !!req.openai?.chat;

        if (!baseUrl) {
          throw new Error('OpenAI API URL is required');
        }
        if (!model) {
          throw new Error('Please select a model');
        }

        const startTime = performance.now();
        let openaiResponse: OpenAIRequestData['response'];

        if (isChat) {
          // Build input messages for /v1/responses API
          const input = (req.openai?.chat?.input ?? []).map(msg => ({
            role: msg.role,
            content: msg.content.map(c => {
              switch (c.type) {
                case 'input_text':
                  return { type: 'input_text', text: c.text };
                case 'input_image':
                  return { type: 'input_image', image_url: c.image_url };
                case 'input_file':
                  return { type: 'input_file', filename: c.filename, file_data: c.file_data };
              }
            }),
          }));

          const response = await fetch(`${baseUrl}/v1/responses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, input }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP ${response.status}`);
          }

          const data = await response.json();
          // Extract the output text from the response
          // The response format has output array with items
          let chatOutput = '';
          if (data.output && Array.isArray(data.output)) {
            for (const item of data.output) {
              if (item.type === 'message' && item.content) {
                for (const content of item.content) {
                  if (content.type === 'output_text') {
                    chatOutput += content.text;
                  }
                }
              }
            }
          }
          openaiResponse = { result: { type: 'text', text: chatOutput }, duration: Math.round(performance.now() - startTime) };
        } else if (req.openai?.image) {
          // Image generation via /v1/images/generations
          const prompt = req.openai?.image?.prompt ?? '';
          if (!prompt) {
            throw new Error('Please enter an image prompt');
          }

          const response = await fetch(`${baseUrl}/v1/images/generations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt, response_format: 'b64_json' }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP ${response.status}`);
          }

          const data = await response.json();
          const img = (data.data || [])[0] as { b64_json?: string; url?: string } | undefined;
          const image = img?.b64_json || img?.url || '';
          openaiResponse = { 
            result: { type: 'image', image },
            duration: Math.round(performance.now() - startTime) 
          };
        } else if (req.openai?.audio) {
          // Audio/TTS generation via /v1/audio/speech
          const text = req.openai?.audio?.text ?? '';
          const voice = req.openai?.audio?.voice ?? 'alloy';
          if (!text) {
            throw new Error('Please enter text to convert to speech');
          }

          const response = await fetch(`${baseUrl}/v1/audio/speech`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, input: text, voice }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP ${response.status}`);
          }

          // Get the audio data as a blob and convert to base64
          const audioBlob = await response.blob();
          const reader = new FileReader();
          const audioBase64 = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              // Remove the data URL prefix (e.g., "data:audio/mpeg;base64,")
              const base64 = result.split(',')[1] || '';
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(audioBlob);
          });

          openaiResponse = { 
            result: { type: 'audio', audio: audioBase64 },
            duration: Math.round(performance.now() - startTime) 
          };
        } else if (req.openai?.transcription) {
          // Audio transcription via /v1/audio/transcriptions
          const dataUrl = req.openai?.transcription?.file ?? '';
          if (!dataUrl) {
            throw new Error('Please select an audio file to transcribe');
          }

          // Extract base64 and MIME type from data URL (data:audio/...;base64,...)
          const [mimeTypePart, base64] = dataUrl.split(',');
          const mimeType = mimeTypePart?.split(':')[1]?.split(';')[0] || 'audio/mpeg';
          const extension = mimeType.split('/')[1] || 'mp3';
          const audioData = atob(base64 || '');
          const audioArray = new Uint8Array(audioData.length);
          for (let i = 0; i < audioData.length; i++) {
            audioArray[i] = audioData.charCodeAt(i);
          }
          const audioBlob = new Blob([audioArray], { type: mimeType });

          // Create FormData
          const formData = new FormData();
          formData.append('file', audioBlob, `audio.${extension}`);
          formData.append('model', model);

          const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP ${response.status}`);
          }

          const data = await response.json();
          const transcriptionText = data.text || '';
          
          openaiResponse = { 
            result: { type: 'transcription', text: transcriptionText },
            duration: Math.round(performance.now() - startTime) 
          };
        } else if (req.openai?.embeddings) {
          // Embeddings generation via /v1/embeddings
          const text = req.openai?.embeddings?.text ?? '';
          if (!text) {
            throw new Error('Please enter text to convert to embeddings');
          }

          const response = await fetch(`${baseUrl}/v1/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, input: text }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP ${response.status}`);
          }

          const data = await response.json();
          const embeddings = (data.data?.[0]?.embedding || []) as number[];
          
          openaiResponse = { 
            result: { type: 'embeddings', embeddings },
            duration: Math.round(performance.now() - startTime) 
          };
        } else {
          throw new Error('Invalid OpenAI request type');
        }

        const executionTime = Date.now();
        const updatedRequest: Request = {
          ...req,
          executionTime,
          executing: false,
          openai: {
            ...req.openai!,
            response: openaiResponse,
          },
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
      // Build headers
      const headersObj: Record<string, string> = {};
      (req.http?.headers ?? []).filter((h: KeyValuePair) => h.enabled && h.key).forEach((h: KeyValuePair) => {
        headersObj[h.key] = h.value;
      });

      // Build query string
      const queryParams = new URLSearchParams();
      const httpMethod = req.http?.method ?? 'GET';
      (req.http?.query ?? []).filter((p: KeyValuePair) => p.enabled && p.key).forEach((p: KeyValuePair) => {
        queryParams.append(p.key, p.value);
      });

      // Build body based on type (from http.body)
      const httpBody = req.http?.body ?? { type: 'none' as const };
      let body: string | FormData | Blob | undefined;
      let bodyForHistory: string = '';
      let useFormData = false;
      
      switch (httpBody.type) {
        case 'json': {
          // Resolve variables in JSON content
          const resolvedContent = resolveVariables(httpBody.content, req.variables);
          
          body = resolvedContent;
          bodyForHistory = httpBody.content; // Store original with markers
          if (!headersObj['Content-Type']) {
            headersObj['Content-Type'] = 'application/json';
          }
          break;
        }
        case 'form-urlencoded': {
          const formParams = new URLSearchParams();
          httpBody.data.filter((f: { enabled: boolean; key: string; value: string }) => f.enabled && f.key).forEach((f: { key: string; value: string }) => {
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
          httpBody.data.filter((f: { enabled: boolean; key: string }) => f.enabled && f.key).forEach((f: { type: string; key: string; value: string; file?: File | null; fileName?: string }) => {
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
          if (httpBody.file) {
            body = httpBody.file;
            bodyForHistory = `[Binary file: ${httpBody.fileName}]`;
            if (!headersObj['Content-Type']) {
              headersObj['Content-Type'] = (httpBody.file as File).type || 'application/octet-stream';
            }
          }
          break;
        }
        case 'raw':
          body = httpBody.content;
          bodyForHistory = httpBody.content;
          if (!headersObj['Content-Type']) {
            headersObj['Content-Type'] = 'text/plain';
          }
          break;
      }

      // Get options
      const options = req.http?.request?.options ?? { insecure: false, redirect: true };

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
      const clientRequest: HttpRequest = {
        method: httpMethod,
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
        method: httpMethod,
        headers: fetchHeaders,
        body: body && httpMethod !== 'GET' && httpMethod !== 'HEAD' ? body : undefined,
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
        executing: false,
        http: {
          ...req.http!,
          request: clientRequest,
          response: clientResponse,
        },
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
      
      // Create error response based on protocol
      if (req.protocol === 'grpc') {
        const updatedRequest: Request = {
          ...req,
          executionTime,
          executing: false,
          grpc: {
            ...req.grpc!,
            response: {
              body: '',
              duration: 0,
              error: errorMessage,
            },
          },
        };
        
        const existingInHistory = history.find(h => h.id === req.id);
        if (existingInHistory) {
          requestsCollection.update(req.id, (draft) => {
            Object.assign(draft, updatedRequest);
          });
        } else {
          requestsCollection.insert(updatedRequest);
        }

        setState(prev => ({ ...prev, request: updatedRequest }));
      } else if (req.protocol === 'mcp') {
        const updatedRequest: Request = {
          ...req,
          executionTime,
          executing: false,
          mcp: {
            headers: req.mcp?.headers ?? [],
            tool: req.mcp?.tool,
            resource: req.mcp?.resource,
            response: {
              result: undefined,
              duration: 0,
              error: errorMessage,
            },
          },
        };
        
        const existingInHistory = history.find(h => h.id === req.id);
        if (existingInHistory) {
          requestsCollection.update(req.id, (draft) => {
            Object.assign(draft, updatedRequest);
          });
        } else {
          requestsCollection.insert(updatedRequest);
        }

        setState(prev => ({ ...prev, request: updatedRequest }));
      } else if (req.protocol === 'openai') {
        const isChat = !!req.openai?.chat;
        const errorResponse = isChat
          ? { result: { type: 'text' as const, text: '' }, duration: 0, error: errorMessage }
          : { result: { type: 'image' as const, image: '' }, duration: 0, error: errorMessage };
        
        const updatedRequest: Request = {
          ...req,
          executionTime,
          executing: false,
          openai: {
            ...req.openai!,
            response: errorResponse,
          },
        };
        
        const existingInHistory = history.find(h => h.id === req.id);
        if (existingInHistory) {
          requestsCollection.update(req.id, (draft) => {
            Object.assign(draft, updatedRequest);
          });
        } else {
          requestsCollection.insert(updatedRequest);
        }

        setState(prev => ({ ...prev, request: updatedRequest }));
      } else {
        // HTTP error response
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
          executing: false,
          http: {
            ...req.http!,
            response: errorResponse,
          },
        };
        
        const existingInHistory = history.find(h => h.id === req.id);
        if (existingInHistory) {
          requestsCollection.update(req.id, (draft) => {
            Object.assign(draft, updatedRequest);
          });
        } else {
          requestsCollection.insert(updatedRequest);
        }

        setState(prev => ({ ...prev, request: updatedRequest }));
      }
    }
  }, [state.request, updateRequest, history, buildMcpProxyPath]);

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
    setOpenAIBodyType,
    setOpenAIChatInput,
    setOpenAIImagePrompt,
    setOpenAIAudioText,
    setOpenAIAudioVoice,
    setOpenAITranscriptionFile,
    setOpenAIEmbeddingsText,
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
