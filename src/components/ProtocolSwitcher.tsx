import { useState, useRef, useEffect } from 'react';
import { Globe, Server, Plug, ChevronDown } from 'lucide-react';
import { useClient } from '../context/useClient';
import type { Protocol } from '../types/types';

const protocols: { value: Protocol; label: string; icon: typeof Globe }[] = [
  { value: 'rest', label: 'HTTP', icon: Globe },
  { value: 'grpc', label: 'gRPC', icon: Server },
  { value: 'mcp', label: 'MCP', icon: Plug },
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
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors text-neutral-600 dark:text-neutral-400"
        title={currentProtocol.label}
      >
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium">{currentProtocol.label}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-white/10 rounded-md shadow-lg z-50 min-w-28">
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
                    ? 'bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-white/5'
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
