import { useState } from 'react';
import { useClient } from '../context/useClient';
import { AlertCircle, Loader2 } from 'lucide-react';
import { JsonViewer } from './JsonViewer';
import { XmlViewer } from './XmlViewer';
import { YamlViewer } from './YamlViewer';
import { TextViewer } from './TextViewer';
import { BinaryViewer } from './BinaryViewer';

type ViewMode = 'pretty' | 'raw';
type ContentType = 'json' | 'xml' | 'yaml' | 'text' | 'binary';

function isJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

// Check if the content appears to be binary by looking for non-printable characters
function looksLikeBinary(str: string): boolean {
  if (!str || str.length === 0) return false;
  
  // Sample the first 8KB for performance
  const sample = str.slice(0, 8192);
  let nonPrintable = 0;
  
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    // Allow common whitespace (tab, newline, carriage return) and printable ASCII
    // Also allow extended UTF-8 characters (> 127)
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      nonPrintable++;
    }
    // Check for null bytes - strong indicator of binary
    if (code === 0) {
      return true;
    }
  }
  
  // If more than 10% non-printable characters, likely binary
  return nonPrintable / sample.length > 0.1;
}

// Known binary MIME types
const BINARY_MIME_PATTERNS = [
  'image/',
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

function detectContentType(body: string, headers: Record<string, string>): ContentType {
  const contentType = headers['content-type']?.toLowerCase() || '';
  
  // Check for known binary content types first
  if (BINARY_MIME_PATTERNS.some(pattern => contentType.includes(pattern))) {
    return 'binary';
  }
  
  // Check for known text content types
  const isKnownText = TEXT_MIME_PATTERNS.some(pattern => contentType.includes(pattern));
  
  // If not a known text type, check content for binary data
  if (!isKnownText && looksLikeBinary(body)) {
    return 'binary';
  }
  
  // Now detect specific text formats
  if (contentType.includes('json') || contentType.endsWith('+json') || isJson(body)) {
    return 'json';
  }
  
  if (contentType.includes('xml') || contentType.endsWith('+xml')) {
    return 'xml';
  }
  
  // Check content for XML if header doesn't indicate it
  const trimmedBody = body.trim();
  if (trimmedBody.startsWith('<?xml') || (trimmedBody.startsWith('<') && trimmedBody.includes('</') && !trimmedBody.startsWith('<!'))) {
    return 'xml';
  }
  
  if (contentType.includes('yaml') || contentType.includes('yml')) {
    return 'yaml';
  }
  
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
      <div className="flex items-center justify-center p-12">
        <p className="text-sm text-neutral-400 dark:text-neutral-500">Enter a URL and click Send to see the response</p>
      </div>
    );
  }

  const contentType = detectContentType(response.body, response.headers);

  const renderContent = () => {
    if (viewMode === 'raw') {
      return <TextViewer content={response.body} />;
    }

    switch (contentType) {
      case 'json':
        return <JsonViewer content={response.body} />;
      case 'xml':
        return <XmlViewer content={response.body} />;
      case 'yaml':
        return <YamlViewer content={response.body} />;
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
        {contentType !== 'binary' && (
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
