import { useState } from 'react';
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
  const [viewMode, setViewMode] = useState<'pretty' | 'raw'>('pretty');
  const [showHeaders, setShowHeaders] = useState(false);

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
              viewMode={viewMode}
            />
          );
        }
        break;
      case 'grpc':
        if (response) {
          return (
            <GrpcResponseViewer 
              response={response}
              viewMode={viewMode}
            />
          );
        }
        break;
      case 'rest':
      default:
        if (response) {
          return (
            <HttpResponseViewer 
              response={response}
              viewMode={viewMode}
            />
          );
        }
        break;
    }
    return null;
  };

  // Detect content type for showing appropriate controls
  const contentType = response?.headers?.['content-type']?.toLowerCase() || '';
  const isBinaryOrImage = contentType.includes('image/') || 
    contentType.includes('video/') || 
    contentType.includes('audio/') ||
    contentType.includes('application/pdf') ||
    contentType.includes('application/octet-stream');
  const showViewModeToggle = !isBinaryOrImage; // Show for all protocols including MCP
  const showHeadersToggle = protocol !== 'mcp' && response;

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
            <>
              <StatusBadge statusCode={200} status="OK" />
              <div className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                <Clock size={12} />
                <span>{formatDuration(mcpResponse.duration)}</span>
              </div>
            </>
          )}
          
          {/* View Mode Toggle */}
          <div className="flex-1" />
          {showViewModeToggle && (
            <div className="flex items-center gap-0.5 text-xs">
              <button
                onClick={() => setViewMode('pretty')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  viewMode === 'pretty'
                    ? 'text-neutral-700 dark:text-neutral-200 font-medium'
                    : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'
                }`}
              >
                Pretty
              </button>
              <span className="text-neutral-300 dark:text-neutral-600">|</span>
              <button
                onClick={() => setViewMode('raw')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  viewMode === 'raw'
                    ? 'text-neutral-700 dark:text-neutral-200 font-medium'
                    : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'
                }`}
              >
                Raw
              </button>
            </div>
          )}
          {showHeadersToggle && (
            <button
              onClick={() => setShowHeaders(!showHeaders)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                showHeaders
                  ? 'text-neutral-700 dark:text-neutral-200 font-medium'
                  : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'
              }`}
            >
              {protocol === 'grpc' ? 'Metadata' : 'Headers'} ({Object.keys(response.headers).length})
            </button>
          )}
        </div>
      )}

      {/* Split Panel Layout - Body and Headers */}
      <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
        {/* Main Content */}
        <div className={`min-h-0 overflow-hidden transition-all ${
          showHeaders ? 'flex-2' : 'flex-1'
        }`}>
          {renderProtocolViewer()}
        </div>
        
        {/* Headers/Metadata Panel - Right Side */}
        {showHeaders && response && (
          <div className="flex-1 min-w-75 max-w-125 flex flex-col border-l border-neutral-200 dark:border-white/10 pl-3">
            <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">
              {protocol === 'grpc' ? 'Metadata' : 'Headers'} ({Object.keys(response.headers).length})
            </div>
            <div className="flex-1 overflow-auto">
              <div className="space-y-2">
                {Object.entries(response.headers).map(([key, value]) => (
                  <div key={key} className="text-xs">
                    <div className="font-mono text-neutral-600 dark:text-neutral-400 mb-0.5">{key}</div>
                    <div className="font-mono text-neutral-700 dark:text-neutral-200 break-all">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
