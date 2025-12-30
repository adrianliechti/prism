import { useState, useRef, useEffect } from 'react';
import { Send, X, Loader2, Trash2, Sparkles } from 'lucide-react';
import { chat, type RequestSetters } from '../api/requestChat';
import type { Message as APIMessage } from '../api/openai';
import type { Request } from '../types/types';
import { Markdown } from './Markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface AiPanelProps {
  onClose: () => void;
  request: Request;
  setters: RequestSetters;
}

export function AiPanel({ onClose, request, setters }: AiPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationHistory, setConversationHistory] = useState<APIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    const assistantMessageId = (Date.now() + 1).toString();

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Add streaming placeholder message
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      },
    ]);

    try {
      // Read response body text if available (Blob -> text)
      let responseBodyText: string | undefined;
      if (request.httpResponse?.body) {
        try {
          responseBodyText = await request.httpResponse.body.text();
        } catch {
          responseBodyText = '(unable to read response body)';
        }
      }

      const { response, history } = await chat(
        userMessage.content,
        conversationHistory,
        request,
        setters,
        {
          responseBodyText,
          onStream: (_delta, snapshot) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: snapshot }
                  : m
              )
            );
          },
          onToolCall: (toolName, args) => {
            console.log('Tool call:', toolName, args);
          },
        }
      );

      // Update conversation history for context
      setConversationHistory(history);

      // Finalize the assistant message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: response.content, isStreaming: false }
            : m
        )
      );
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: 'Sorry, I encountered an error. Please try again.',
                isStreaming: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setConversationHistory([]);
  };

  return (
    <div className="w-96 shrink-0 bg-white border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 flex flex-col rounded-xl overflow-hidden">
      {/* Header */}
      <div className="shrink-0 h-12 px-4 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-amber-500" />
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">AI Assistant</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClearChat}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 rounded transition-colors"
            title="Clear chat"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-neutral-500 dark:text-neutral-400 text-sm py-8">
            <Sparkles size={24} className="mx-auto mb-3 text-amber-500/50" />
            <p className="mb-2">Ask me to help build your request</p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Examples: "Create a POST request to /api/users with a JSON body" or "Add an Authorization header"
            </p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`text-sm ${
              message.role === 'user'
                ? 'bg-neutral-100 dark:bg-neutral-800 rounded-lg px-3 py-2'
                : ''
            }`}
          >
            <div className={message.role === 'user' ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-700 dark:text-neutral-300'}>
              {message.content ? (
                message.role === 'assistant' ? (
                  <Markdown>{message.content}</Markdown>
                ) : (
                  <span className="whitespace-pre-wrap">{message.content}</span>
                )
              ) : (
                message.isStreaming && (
                  <span className="flex items-center gap-2 text-neutral-400">
                    <Loader2 size={14} className="animate-spin" />
                    Thinking...
                  </span>
                )
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="shrink-0 p-3 border-t border-neutral-200 dark:border-neutral-800">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your request..."
            rows={1}
            disabled={isLoading}
            className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 text-sm placeholder-neutral-400 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2 bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-lg transition-colors"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </form>
    </div>
  );
}
