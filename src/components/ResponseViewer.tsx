import { useState } from 'react';
import { useClient } from '../context/useClient';
import { AlertCircle, Loader2, SendHorizontal } from 'lucide-react';
import {
  JsonViewer,
  XmlViewer,
  YamlViewer,
  TextViewer,
  BinaryViewer,
  ImageViewer,
  EventStreamViewer,
} from './viewers';

type ViewMode = 'pretty' | 'raw';
type ContentType = 'json' | 'xml' | 'yaml' | 'text' | 'binary' | 'image' | 'sse';

// Known binary MIME types
const BINARY_MIME_PATTERNS = [
  'video/',
  'audio/',
  'application/pdf',
  'application/octet-stream',
  'application/zip',
  'application/gzip',
  'application/x-tar',
  'application/x-rar',
  'application/x-7z',
  'application/vnd.ms-',
  'application/vnd.openxmlformats',
  'application/x-executable',
  'application/x-sharedlib',
  'application/x-mach-binary',
  'application/wasm',
  'font/',
];

// Known image MIME types
const IMAGE_MIME_PATTERNS = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/x-icon',
  'image/ico',
  'image/avif',
  'image/apng',
];

// Known text MIME types (even without 'text/' prefix)
const TEXT_MIME_PATTERNS = [
  'text/',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/ecmascript',
  'application/x-javascript',
  'application/ld+json',
  'application/manifest+json',
  'application/schema+json',
  'application/x-www-form-urlencoded',
  'application/xhtml+xml',
  'application/rss+xml',
  'application/atom+xml',
  'application/soap+xml',
  'application/x-yaml',
  'application/yaml',
  '+json',
  '+xml',
];

function detectContentType(headers: Record<string, string>): ContentType {
  const contentType = headers['content-type']?.toLowerCase() || '';
  
  // Check for SSE (Server-Sent Events)
  if (contentType.includes('text/event-stream')) {
    return 'sse';
  }
  
  // Check for image types first
  if (IMAGE_MIME_PATTERNS.some(pattern => contentType.includes(pattern))) {
    return 'image';
  }
  
  // Check for known binary content types
  if (BINARY_MIME_PATTERNS.some(pattern => contentType.includes(pattern))) {
    return 'binary';
  }
  
  // Now detect specific text formats
  if (contentType.includes('json') || contentType.endsWith('+json')) {
    return 'json';
  }
  
  if (contentType.includes('xml') || contentType.endsWith('+xml')) {
    return 'xml';
  }
  
  if (contentType.includes('yaml') || contentType.includes('yml')) {
    return 'yaml';
  }
  
  // Check for known text content types
  if (TEXT_MIME_PATTERNS.some(pattern => contentType.includes(pattern))) {
    return 'text';
  }
  
  // Default to text for unknown types
  return 'text';
}

export function ResponseViewer() {
  const { request } = useClient();
  const [viewMode, setViewMode] = useState<ViewMode>('pretty');
  const [showHeaders, setShowHeaders] = useState(false);

  const response = request?.httpResponse;
  const isLoading = request?.executing ?? false;
  const error = response?.error;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500 dark:text-blue-400" />
          <span className="text-sm text-neutral-500 dark:text-neutral-400">Sending request...</span>
        </div>
      </div>
    );
  }

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

  if (!response) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <SendHorizontal className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mb-4" />
        <p className="text-sm text-neutral-400 dark:text-neutral-500">Hit Send to see what happens</p>
      </div>
    );
  }

  const contentType = detectContentType(response.headers);

  const renderContent = () => {
    if (viewMode === 'raw' && contentType !== 'image' && contentType !== 'binary') {
      return <TextViewer content={response.body} />;
    }

    switch (contentType) {
      case 'json':
        return <JsonViewer content={response.body} />;
      case 'xml':
        return <XmlViewer content={response.body} />;
      case 'yaml':
        return <YamlViewer content={response.body} />;
      case 'sse':
        return <EventStreamViewer content={response.body} />;
      case 'image':
        return <ImageViewer content={response.body} />;
      case 'binary':
        return <BinaryViewer content={response.body} />;
      case 'text':
      default:
        return <TextViewer content={response.body} />;
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* View Controls */}
      <div className="flex gap-2 shrink-0 mb-4">
        {contentType !== 'binary' && contentType !== 'image' && (
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
        )}
        <button
          onClick={() => setShowHeaders(!showHeaders)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
            showHeaders
              ? 'bg-white dark:bg-white/10 text-neutral-800 dark:text-neutral-100 shadow-sm'
              : 'bg-neutral-100 dark:bg-white/5 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
          }`}
        >
          Headers ({Object.keys(response.headers).length})
        </button>
      </div>

      {/* Headers Table */}
      {showHeaders && (
        <div className="bg-neutral-100 dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/10 overflow-hidden shrink-0 mb-4">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-white/10">
                <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400">Header</th>
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

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto">
        {renderContent()}
      </div>
    </div>
  );
}
