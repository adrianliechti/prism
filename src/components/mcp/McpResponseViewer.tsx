import type { McpCallToolResponse, McpReadResourceResponse } from '../../types/types';
import { McpResultViewer } from '../McpResultViewer';
import { JsonViewer } from '../viewers';

type ViewMode = 'pretty' | 'raw';

interface McpResponseViewerProps {
  toolResponse?: McpCallToolResponse;
  resourceResponse?: McpReadResourceResponse;
  viewMode?: ViewMode;
}

export function McpResponseViewer({ toolResponse, resourceResponse, viewMode = 'pretty' }: McpResponseViewerProps) {

  // Create a Blob from the raw response for the viewers
  const rawResponse = toolResponse || resourceResponse;
  const rawBlob = rawResponse 
    ? new Blob([JSON.stringify(rawResponse, null, 2)], { type: 'application/json' })
    : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
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
