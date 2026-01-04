import { useClient } from '../context/useClient';
import { RequestBarActions } from '../context/RequestBarPortal';
import { Sparkles } from 'lucide-react';
import { getConfig } from '../config';

export function SharedRequestActions() {
  const { request, executeRequest, aiPanelOpen, toggleAiPanel } = useClient();

  const hasAiModel = Boolean(getConfig().ai?.model);
  const isLoading = request?.executing ?? false;
  const protocol = request?.protocol ?? 'rest';
  const url = request?.url ?? '';

  // Parse grpc:// URL into parts
  const parseGrpcUrl = (grpcUrl: string): { host: string; service: string; method: string } => {
    const match = grpcUrl.match(/^grpc:\/\/([^/]*)(?:\/([^/]*)(?:\/([^/]*))?)?$/);
    if (match) {
      return { host: match[1] || '', service: match[2] || '', method: match[3] || '' };
    }
    return { host: '', service: '', method: '' };
  };

  const { host: grpcHost, service: grpcService, method: grpcMethod } = parseGrpcUrl(url);

  const mcpHasToolOrResource = !!request?.mcp?.tool || !!request?.mcp?.resource;

  // Check if we can execute
  const canExecute = protocol === 'rest'
    ? url.length > 0
    : protocol === 'mcp'
      ? url.length > 0 && mcpHasToolOrResource
      : grpcHost.length > 0 && grpcService.length > 0 && grpcMethod.length > 0;

  const handleSubmit = () => {
    executeRequest();
  };

  return (
    <RequestBarActions>
      <button
        type="button"
        onClick={handleSubmit}
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
      {hasAiModel && (
        <button
          type="button"
          onClick={toggleAiPanel}
          className={`p-1.5 hover:bg-neutral-100 dark:hover:bg-white/10 rounded-md transition-colors ${
            aiPanelOpen
              ? 'text-amber-500 hover:text-amber-600'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
          }`}
          title="AI Assistant"
        >
          <Sparkles className="w-4 h-4" />
        </button>
      )}
    </RequestBarActions>
  );
}
