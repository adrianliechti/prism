import { useRef, useEffect, useState, useMemo } from 'react';
import { Send, X, Trash2, Square, Loader2, Sparkles } from 'lucide-react';
import { useChat, stream, type UIMessage } from '@tanstack/ai-react';
import { chat, maxIterations } from '@tanstack/ai';
import type { AnyClientTool } from '@tanstack/ai-client';
import { createChatAdapter, getConfiguredModel } from '../api/chatAdapter';
import type { AdapterConfig } from '../api/toolsCommon';
import type { AllSetters } from '../types/chat';
import type { Request } from '../types/types';
import { Markdown } from './Markdown';

// Protocol-specific tools imports
import { createTools as createHttpTools, getInstructions as getHttpInstructions, adapterConfig as httpAdapterConfig } from './http/httpTools';
import { createTools as createGrpcTools, getInstructions as getGrpcInstructions, adapterConfig as grpcAdapterConfig } from './grpc/grpcTools';
import { createTools as createMcpTools, getInstructions as getMcpInstructions, adapterConfig as mcpAdapterConfig } from './mcp/mcpTools';
import { createTools as createOpenAITools, getInstructions as getOpenAIInstructions, adapterConfig as openaiAdapterConfig } from './openai/openaiTools';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  request: Request;
  setters: AllSetters;
}

export function ChatPanel({ isOpen, onClose, request, setters }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [responseBodyText, setResponseBodyText] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Read response body text when available (for HTTP protocol)
  useEffect(() => {
    async function readResponseBody() {
      const httpResponse = request.http?.response;
      if (httpResponse?.body) {
        try {
          const text = await httpResponse.body.text();
          setResponseBodyText(text);
        } catch {
          setResponseBodyText('(unable to read response body)');
        }
      } else {
        setResponseBodyText(undefined);
      }
    }
    readResponseBody();
  }, [request.http?.response]);

  // useChat doesn't propagate tools/connection updates after mount, so tools must
  // read live state through a stable env object. The getters defer to a ref that an
  // effect keeps current; tools only execute after effects flush, never during render.
  const latestRef = useRef({ request, setters, responseBodyText });
  useEffect(() => {
    latestRef.current = { request, setters, responseBodyText };
  });
  const [env] = useState(() => ({
    get request() { return latestRef.current.request; },
    get setters() { return latestRef.current.setters; },
    get responseBodyText() { return latestRef.current.responseBodyText; },
  }));

  const { tools, instructions, adapterConfig } = useMemo((): {
    tools: AnyClientTool[];
    instructions: string;
    adapterConfig: AdapterConfig;
  } => {
    switch (request.protocol) {
      case 'grpc':
        return {
          tools: createGrpcTools(env),
          instructions: getGrpcInstructions(),
          adapterConfig: grpcAdapterConfig,
        };
      case 'mcp':
        return {
          tools: createMcpTools(env),
          instructions: getMcpInstructions(),
          adapterConfig: mcpAdapterConfig,
        };
      case 'openai':
        return {
          tools: createOpenAITools(env),
          instructions: getOpenAIInstructions(),
          adapterConfig: openaiAdapterConfig,
        };
      case 'rest':
      default:
        return {
          tools: createHttpTools(env),
          instructions: getHttpInstructions(),
          adapterConfig: httpAdapterConfig,
        };
    }
  }, [request.protocol, env]);

  // Create connection adapter that wraps the chat() function
  const connection = useMemo(() => {
    const model = getConfiguredModel();
    const adapter = createChatAdapter(model);

    return stream((messages, _data, _signal, input) =>
      chat({
        adapter,
        messages,
        threadId: input.threadId,
        tools,
        systemPrompts: [instructions],
        agentLoopStrategy: maxIterations(10),
      })
    );
  }, [tools, instructions]);

  // useChat rebuilds its client, and with it the connection carrying the
  // protocol's tools and instructions, only when the thread changes.
  const [sessionId] = useState(() => crypto.randomUUID());
  const { messages, sendMessage, isLoading, stop, clear } = useChat({
    connection,
    tools,
    threadId: `${request.protocol}-${sessionId}`,
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Extract text content from message parts
  const getMessageContent = (message: UIMessage): string => {
    return message.parts
      .filter((part): part is { type: 'text'; content: string } => 
        part.type === 'text' && Boolean(part.content)
      )
      .map(part => part.content)
      .join('');
  };

  // Check if message is currently streaming (last assistant message while loading)
  const isStreaming = (message: UIMessage, index: number): boolean => {
    return isLoading && 
           message.role === 'assistant' && 
           index === messages.length - 1;
  };

  if (!isOpen) return null;

  return (
    <div className="w-96 shrink-0 border-l border-border-subtle bg-bg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="window-drag window-controls-end shrink-0 h-12 pl-4 pr-3 flex items-center justify-between border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-fg-muted" />
          <h3 className="text-[13px] font-semibold text-fg">{adapterConfig.name}</h3>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            onClick={clear}
            className="toolbar-button"
            title="Clear chat"
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="toolbar-button"
            title="Close assistant"
            aria-label="Close assistant"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-fg-muted text-sm py-8">
            <Sparkles size={24} className="mx-auto mb-3 text-fg-dim" />
            <p className="mb-2">Ask me to help build your request</p>
            <p className="text-xs text-fg-dim">
              Examples: "Create a POST request to /api/users with a JSON body" or "Add an Authorization header"
            </p>
          </div>
        )}
        {messages.map((message, index) => {
          const content = getMessageContent(message);

          // Each model call is its own message; skip the ones that only called tools
          if (message.role === 'assistant' && !content && !isStreaming(message, index)) return null;

          return (
            <div
              key={message.id}
              className={`text-sm ${
                message.role === 'user'
                  ? 'bg-bg-elevated rounded-lg px-3 py-2'
                  : ''
              }`}
            >
              <div className={message.role === 'user' ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-700 dark:text-neutral-300'}>
                {message.role === 'assistant' ? (
                  content ? (
                    <Markdown>{content}</Markdown>
                  ) : isStreaming(message, index) ? (
                    <span className="flex items-center gap-2 text-neutral-400">
                      <Loader2 size={14} className="animate-spin" />
                      Thinking...
                    </span>
                  ) : null
                ) : (
                  <span className="whitespace-pre-wrap">{content}</span>
                )}
              </div>
            </div>
          );
        })}
        
        {/* Loading indicator when no assistant message yet */}
        {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
          <div className="text-sm">
            <div className="text-neutral-800 dark:text-neutral-200">
              <span className="flex items-center gap-2 text-neutral-400">
                <Loader2 size={14} className="animate-spin" />
                Thinking...
              </span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="shrink-0 p-3 border-t border-border-subtle">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={adapterConfig.placeholder}
            autoCorrect="off"
            rows={1}
            disabled={isLoading}
            className="flex-1 px-3 py-2 bg-bg-input border border-border-subtle rounded-lg text-fg text-sm placeholder-fg-dim resize-none focus:outline-none hover:border-border focus:border-border-strong disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            type={isLoading ? 'button' : 'submit'}
            onClick={isLoading ? stop : undefined}
            disabled={!isLoading && !input.trim()}
            className="p-2 bg-fg text-bg hover:opacity-90 disabled:bg-bg-active disabled:text-fg-dim disabled:hover:opacity-100 rounded-lg transition-colors"
          >
            {isLoading ? <Square size={16} /> : <Send size={16} />}
          </button>
        </div>
      </form>
    </div>
  );
}
