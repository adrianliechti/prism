import type { HttpResponse } from '../../types/types';
import {
  JsonViewer,
  XmlViewer,
  YamlViewer,
  TextViewer,
  BinaryViewer,
  ImageViewer,
  EventStreamViewer,
} from '../viewers';

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

interface HttpResponseViewerProps {
  response: HttpResponse;
  viewMode?: ViewMode;
}

export function HttpResponseViewer({ response, viewMode = 'pretty' }: HttpResponseViewerProps) {
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
      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto">
        {renderContent()}
      </div>
    </div>
  );
}
