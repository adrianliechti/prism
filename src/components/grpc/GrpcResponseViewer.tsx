import { useState } from 'react';
import type { HttpResponse } from '../../types/types';
import { JsonViewer, TextViewer } from '../viewers';

type ViewMode = 'pretty' | 'raw';

interface GrpcResponseViewerProps {
  response: HttpResponse;
}

export function GrpcResponseViewer({ response }: GrpcResponseViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('pretty');
  const [showMetadata, setShowMetadata] = useState(false);

  // gRPC responses are always JSON (protobuf serialized to JSON)
  const hasMetadata = Object.keys(response.headers).length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* View Controls */}
      <div className="flex gap-2 shrink-0 mb-3">
        <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-white/5 rounded-lg">
          <button
            onClick={() => setViewMode('pretty')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'pretty'
                ? 'bg-white dark:bg-white/10 text-neutral-800 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
          >
            Pretty
          </button>
          <button
            onClick={() => setViewMode('raw')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'raw'
                ? 'bg-white dark:bg-white/10 text-neutral-800 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
          >
            Raw
          </button>
        </div>
        {hasMetadata && (
          <button
            onClick={() => setShowMetadata(!showMetadata)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              showMetadata
                ? 'bg-white dark:bg-white/10 text-neutral-800 dark:text-neutral-100 shadow-sm'
                : 'bg-neutral-100 dark:bg-white/5 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
          >
            Metadata ({Object.keys(response.headers).length})
          </button>
        )}
      </div>

      {/* Metadata Table */}
      {showMetadata && hasMetadata && (
        <div className="bg-neutral-100 dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/10 overflow-hidden shrink-0 mb-3">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-white/10">
                <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400">Key</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400">Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(response.headers).map(([key, value]) => (
                <tr key={key} className="border-b border-neutral-100 dark:border-white/5 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-neutral-600 dark:text-neutral-300">{key}</td>
                  <td className="px-4 py-2 font-mono text-xs text-neutral-500 dark:text-neutral-400">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Body - Always JSON for gRPC */}
      <div className="flex-1 min-h-0 overflow-auto">
        {viewMode === 'pretty' ? (
          <JsonViewer content={response.body} />
        ) : (
          <TextViewer content={response.body} />
        )}
      </div>
    </div>
  );
}
