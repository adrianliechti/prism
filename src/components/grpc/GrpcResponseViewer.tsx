import type { HttpResponse } from '../../types/types';
import { JsonViewer, TextViewer } from '../viewers';

type ViewMode = 'pretty' | 'raw';

interface GrpcResponseViewerProps {
  response: HttpResponse;
  viewMode?: ViewMode;
}

export function GrpcResponseViewer({ response, viewMode = 'pretty' }: GrpcResponseViewerProps) {

  return (
    <div className="h-full flex flex-col overflow-hidden">
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
