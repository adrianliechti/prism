import { useState, useRef, useEffect } from 'react';
import { useClient } from '../../context/useClient';
import { ChevronDown, Loader2, Box, Zap } from 'lucide-react';

interface MethodReflection {
  name: string;
  schema?: Record<string, unknown>;
}

interface ServiceReflection {
  name: string;
  methods: MethodReflection[];
}

interface GrpcReflectResponse {
  services: ServiceReflection[];
}

// Cache for reflection data
let reflectionCache: { host: string; data: GrpcReflectResponse } | null = null;

async function fetchReflection(host: string): Promise<GrpcReflectResponse> {
  if (reflectionCache?.host === host) {
    return reflectionCache.data;
  }
  const response = await fetch(`/proxy/grpc/${host}`);
  if (!response.ok) throw new Error('Failed to fetch services');
  const data: GrpcReflectResponse = await response.json();
  reflectionCache = { host, data };
  return data;
}

function GrpcSelector({
  value,
  onChange,
  placeholder,
  label,
  fetchOptions,
  disabled,
  icon,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  fetchOptions: () => Promise<string[]>;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchOptions();
      setOptions(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
      setOptions([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className="h-8 px-2 flex items-center gap-2 text-sm transition hover:bg-neutral-50 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed rounded"
      >
        {icon}
        <span className={`text-sm whitespace-nowrap ${value ? 'text-neutral-800 dark:text-neutral-100' : 'text-neutral-400 dark:text-neutral-500'}`}>
          {value || placeholder}
        </span>
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400 shrink-0" />
        ) : (
          <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-48 max-w-md bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="max-h-64 overflow-y-auto p-1">
            {isLoading && (
              <div className="px-3 py-4 text-center text-sm text-neutral-500">
                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                Loading...
              </div>
            )}
            {error && (
              <div className="px-3 py-3 text-sm text-red-500">{error}</div>
            )}
            {!isLoading && !error && options.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-neutral-500">
                No {label.toLowerCase()} available
              </div>
            )}
            {!isLoading && !error && options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm rounded-md transition-colors ${
                  opt === value
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/5'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function GrpcRequestBar() {
  const { request, setUrl, setGrpcMethodSchema } = useClient();
  const url = request?.url ?? '';

  // Parse grpc:// URL into parts
  const parseGrpcUrl = (grpcUrl: string): { host: string; service: string; method: string } => {
    const match = grpcUrl.match(/^grpc:\/\/([^/]*)(?:\/([^/]*)(?:\/([^/]*))?)?$/);
    if (match) {
      return { host: match[1] || '', service: match[2] || '', method: match[3] || '' };
    }
    return { host: '', service: '', method: '' };
  };

  // Build grpc:// URL from parts
  const buildGrpcUrl = (host: string, service: string, method: string): string => {
    if (!host) return 'grpc://';
    if (!service) return `grpc://${host}`;
    if (!method) return `grpc://${host}/${service}`;
    return `grpc://${host}/${service}/${method}`;
  };

  const { host: grpcHost, service: grpcService, method: grpcMethod } = parseGrpcUrl(url);

  const setGrpcHost = (host: string) => {
    setUrl(buildGrpcUrl(host, '', ''));
    setGrpcMethodSchema(undefined);
  };
  const setGrpcService = (service: string) => {
    setUrl(buildGrpcUrl(grpcHost, service, ''));
    setGrpcMethodSchema(undefined);
  };
  const setGrpcMethod = async (method: string) => {
    setUrl(buildGrpcUrl(grpcHost, grpcService, method));
    // Fetch and store the schema
    try {
      const data = await fetchReflection(grpcHost);
      const service = data.services.find(s => s.name === grpcService);
      const methodData = service?.methods.find(m => m.name === method);
      if (methodData?.schema) {
        setGrpcMethodSchema(methodData.schema);
      } else {
        setGrpcMethodSchema(undefined);
      }
    } catch {
      setGrpcMethodSchema(undefined);
    }
  };

  // Fetch services for current host
  const fetchServices = async (): Promise<string[]> => {
    if (!grpcHost) return [];
    const data = await fetchReflection(grpcHost);
    return data.services.map(s => s.name);
  };

  // Fetch methods for current service
  const fetchMethods = async (): Promise<string[]> => {
    if (!grpcHost || !grpcService) return [];
    const data = await fetchReflection(grpcHost);
    const service = data.services.find(s => s.name === grpcService);
    return service?.methods.map(m => m.name) ?? [];
  };

  // Calculate input width based on content
  const hostInputSize = Math.max(8, grpcHost.length || 9);

  return (
    <div className="flex items-center flex-1 min-w-0">
      {/* Host input */}
      <input
        type="text"
        value={grpcHost}
        onChange={(e) => setGrpcHost(e.target.value)}
        placeholder="host:port"
        size={hostInputSize}
        className="min-w-20 max-w-full px-2 py-1.5 text-sm bg-transparent text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none"
      />

      <span className="text-neutral-300 dark:text-neutral-600 shrink-0">/</span>

      {/* Service selector */}
      <GrpcSelector
        value={grpcService}
        onChange={setGrpcService}
        placeholder="Select service"
        label="Service"
        fetchOptions={fetchServices}
        disabled={!grpcHost}
        icon={<Box className={`w-4 h-4 shrink-0 ${grpcService ? 'text-purple-500' : 'text-neutral-400'}`} />}
      />

      <span className="text-neutral-300 dark:text-neutral-600">/</span>

      {/* Method selector */}
      <GrpcSelector
        value={grpcMethod}
        onChange={setGrpcMethod}
        placeholder="Select method"
        label="Method"
        fetchOptions={fetchMethods}
        disabled={!grpcHost || !grpcService}
        icon={<Zap className={`w-4 h-4 shrink-0 ${grpcMethod ? 'text-amber-500' : 'text-neutral-400'}`} />}
      />
    </div>
  );
}
