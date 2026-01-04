import { useState } from 'react';
import type { McpCallToolResponse, McpReadResourceResponse } from '../../types/types';
import { McpResultViewer } from '../McpResultViewer';
import { JsonViewer } from '../viewers';

type ViewMode = 'pretty' | 'raw';

interface McpResponseViewerProps {
  toolResponse?: McpCallToolResponse;
  resourceResponse?: McpReadResourceResponse;
}

export function McpResponseViewer({ toolResponse, resourceResponse }: McpResponseViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('pretty');

  // Create a Blob from the raw response for the viewers
  const rawResponse = toolResponse || resourceResponse;
  const rawBlob = rawResponse 
    ? new Blob([JSON.stringify(rawResponse, null, 2)], { type: 'application/json' })
    : null;

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
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {viewMode === 'pretty' ? (
          <McpResultViewer 
            toolResponse={toolResponse} 
            resourceResponse={resourceResponse} 
          />
        ) : (
          rawBlob && <JsonViewer content={rawBlob} />
        )}
      </div>
    </div>
  );
}
