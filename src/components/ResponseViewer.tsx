import { useClient } from '../context/useClient';
import { AlertCircle, SendHorizontal, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { HttpResponseViewer } from './http';
import { GrpcResponseViewer } from './grpc';
import { McpResponseViewer } from './mcp';
import type { McpCallToolResponse, McpReadResourceResponse } from '../lib/data';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

function getStatusColor(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return 'text-emerald-600 dark:text-emerald-400';
  if (statusCode >= 300 && statusCode < 400) return 'text-amber-600 dark:text-amber-400';
  if (statusCode >= 400 && statusCode < 500) return 'text-orange-600 dark:text-orange-400';
  if (statusCode >= 500) return 'text-red-600 dark:text-red-400';
  return 'text-neutral-600 dark:text-neutral-400';
}

function StatusBadge({ statusCode, status }: { statusCode: number; status: string }) {
  const colorClass = getStatusColor(statusCode);
  const isSuccess = statusCode >= 200 && statusCode < 300;
  const isError = statusCode >= 400;
  
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-100 dark:bg-white/5 ${colorClass}`}>
      {isSuccess && <CheckCircle2 size={14} />}
      {isError && <XCircle size={14} />}
      <span className="text-xs font-medium">{statusCode}</span>
      <span className="text-xs opacity-75">{status}</span>
    </div>
  );
}

export function ResponseViewer() {
  const { request } = useClient();

  const isLoading = request?.executing ?? false;
  const protocol = request?.protocol ?? 'rest';
  
  // Protocol-specific responses
  const httpResponse = request?.http?.response;
  const grpcResponse = request?.grpc?.response;
  const mcpResponse = request?.mcp?.response;
  const mcpError = request?.mcp?.response?.error;

  const response = httpResponse ?? (grpcResponse ? {
    status: grpcResponse.error || 'OK',
    statusCode: grpcResponse.error ? 0 : 200,
    headers: grpcResponse.metadata ?? {},
    body: new Blob([grpcResponse.body], { type: 'application/json' }),
    duration: grpcResponse.duration,
  } : undefined);

  const error = response?.error ?? mcpError;

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-50">
        <div className="relative mb-4">
          <div className="w-12 h-12 rounded-full border-2 border-zinc-100 dark:border-zinc-800"></div>
          <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin"></div>
        </div>
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-widest animate-pulse">Sending Request</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-500 dark:text-rose-400" />
          <div>
            <h3 className="font-semibold text-rose-500 dark:text-rose-400">Error</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Empty state - no response yet
  if (!response && !mcpResponse) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <SendHorizontal className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mb-4" />
        <p className="text-sm text-neutral-400 dark:text-neutral-500">Hit Send to see what happens</p>
      </div>
    );
  }

  // Render protocol-specific viewer
  const renderProtocolViewer = () => {
    switch (protocol) {
      case 'mcp':
        if (mcpResponse?.result) {
          // Determine if it's a tool or resource response based on response shape
          const isToolResponse = 'content' in mcpResponse.result;
          return (
            <McpResponseViewer 
              toolResponse={isToolResponse ? mcpResponse.result as McpCallToolResponse : undefined} 
              resourceResponse={!isToolResponse ? mcpResponse.result as McpReadResourceResponse : undefined} 
            />
          );
        }
        break;
      case 'grpc':
        if (response) {
          return <GrpcResponseViewer response={response} />;
        }
        break;
      case 'rest':
      default:
        if (response) {
          return <HttpResponseViewer response={response} />;
        }
        break;
    }
    return null;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Status Bar */}
      {(response || mcpResponse) && (
        <div className="flex items-center gap-3 mb-3 shrink-0">
          {response && (
            <>
              <StatusBadge statusCode={response.statusCode} status={response.status} />
              <div className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                <Clock size={12} />
                <span>{formatDuration(response.duration)}</span>
              </div>
              {response.body && (
                <div className="text-xs text-neutral-400 dark:text-neutral-500">
                  {(response.body.size / 1024).toFixed(2)} KB
                </div>
              )}
            </>
          )}
          {mcpResponse && (
            <div className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
              <Clock size={12} />
              <span>{formatDuration(mcpResponse.duration)}</span>
            </div>
          )}
        </div>
      )}

      {/* Protocol-specific viewer */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {renderProtocolViewer()}
      </div>
    </div>
  );
}
