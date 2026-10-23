import { useState, useRef, useEffect } from 'react';
import { Globe, Server, Plug, Sparkles, ChevronDown } from 'lucide-react';
import { useClient } from '../context/useClient';
import type { Protocol } from '../types/types';

const protocols: { value: Protocol; label: string; icon: typeof Globe }[] = [
  { value: 'rest', label: 'HTTP', icon: Globe },
  { value: 'grpc', label: 'gRPC', icon: Server },
  { value: 'mcp', label: 'MCP', icon: Plug },
  { value: 'openai', label: 'OpenAI', icon: Sparkles },
];

export function ProtocolSwitcher() {
  const { request, setProtocol } = useClient();
  const protocol = request?.protocol ?? 'rest';
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentProtocol = protocols.find(p => p.value === protocol) ?? protocols[0];
  const Icon = currentProtocol.icon;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="window-no-drag relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 h-8 rounded-md hover:bg-bg-hover transition-colors text-fg-muted hover:text-fg"
        title={currentProtocol.label}
      >
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium">{currentProtocol.label}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 py-1 bg-bg-elevated border border-border rounded-md shadow-lg z-50 min-w-28">
          {protocols.map((p) => {
            const PIcon = p.icon;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => {
                  setProtocol(p.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                  protocol === p.value
                    ? 'bg-bg-active text-fg'
                    : 'text-fg-muted hover:bg-bg-hover hover:text-fg'
                }`}
              >
                <PIcon className="w-4 h-4" />
                {p.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
