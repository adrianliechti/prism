import { useState, useRef, useEffect } from 'react';
import { useClient } from '../context/useClient';
import { MethodSelector } from './MethodSelector';
import { PanelRightClose, ChevronDown, Loader2 } from 'lucide-react';

interface MethodReflection {
  name: string;
}

interface ServiceReflection {
  name: string;
  methods: MethodReflection[];
}

interface GrpcReflectResponse {
  services: ServiceReflection[];
}

function GrpcCombobox({
  value,
  onChange,
  placeholder,
  fetchOptions,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  fetchOptions: () => Promise<string[]>;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpen = async () => {
    if (disabled) return;
    setIsOpen(true);
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOptions();
      setOptions(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(value.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <div className="flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleOpen}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 min-w-0 px-2 py-1.5 bg-transparent text-neutral-800 dark:text-neutral-100 text-sm placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleOpen}
          disabled={disabled}
          className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-white/10 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-neutral-500">Loading...</div>
          )}
          {error && (
            <div className="px-3 py-2 text-xs text-red-500">{error}</div>
          )}
          {!loading && !error && filteredOptions.length === 0 && (
            <div className="px-3 py-2 text-xs text-neutral-500">
              {options.length === 0 ? 'No options available' : 'No matches'}
            </div>
          )}
          {!loading && !error && filteredOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setIsOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function UrlBar() {
  const {
    request,
    setUrl,
    setGrpcHost,
    setGrpcService,
    setGrpcMethod,
    executeRequest,
    sidebarCollapsed,
    toggleSidebar,
    history,
  } = useClient();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeRequest();
  };

  const protocol = request?.protocol ?? 'rest';
  const url = request?.url ?? '';
  const grpcHost = request?.grpcHost ?? '';
  const grpcService = request?.grpcService ?? '';
  const grpcMethod = request?.grpcMethod ?? '';
  const isLoading = request?.executing ?? false;

  // Check if we can execute
  const canExecute = protocol === 'rest'
    ? url.length > 0
    : grpcHost.length > 0 && grpcService.length > 0 && grpcMethod.length > 0;

  // Fetch services for current host
  const fetchServices = async (): Promise<string[]> => {
    if (!grpcHost) return [];
    const response = await fetch(`/proxy/grpc/${grpcHost}`);
    if (!response.ok) throw new Error('Failed to fetch services');
    const data: GrpcReflectResponse = await response.json();
    return data.services.map(s => s.name);
  };

  // Fetch methods for current service
  const fetchMethods = async (): Promise<string[]> => {
    if (!grpcHost || !grpcService) return [];
    const response = await fetch(`/proxy/grpc/${grpcHost}`);
    if (!response.ok) throw new Error('Failed to fetch methods');
    const data: GrpcReflectResponse = await response.json();
    const service = data.services.find(s => s.name === grpcService);
    return service?.methods.map(m => m.name) ?? [];
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      {sidebarCollapsed && history.length > 0 && (
        <button
          type="button"
          onClick={toggleSidebar}
          className="p-1.5 hover:bg-neutral-100 dark:hover:bg-white/10 rounded-md transition-colors text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          title="Show sidebar"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      )}
      <MethodSelector />
      
      {protocol === 'rest' ? (
        /* REST: Single URL input */
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter request URL"
          className="flex-1 px-3 py-1.5 bg-transparent text-neutral-800 dark:text-neutral-100 text-sm placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none"
        />
      ) : (
        /* gRPC: host / service / method */
        <div className="flex-1 flex items-center gap-0 min-w-0">
          <input
            type="text"
            value={grpcHost}
            onChange={(e) => setGrpcHost(e.target.value)}
            placeholder="host:port"
            className="w-32 shrink-0 px-2 py-1.5 bg-transparent text-neutral-800 dark:text-neutral-100 text-sm placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none"
          />
          <span className="text-neutral-300 dark:text-neutral-600 px-1">/</span>
          <GrpcCombobox
            value={grpcService}
            onChange={setGrpcService}
            placeholder="service"
            fetchOptions={fetchServices}
            disabled={!grpcHost}
          />
          <span className="text-neutral-300 dark:text-neutral-600 px-1">/</span>
          <GrpcCombobox
            value={grpcMethod}
            onChange={setGrpcMethod}
            placeholder="method"
            fetchOptions={fetchMethods}
            disabled={!grpcHost || !grpcService}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading || !canExecute}
        className="p-1.5 hover:bg-neutral-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition-colors text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        title="Send request"
      >
        {isLoading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        )}
      </button>
    </form>
  );
}
