import { useState } from 'react';
import { useApiClient } from '../context/ApiClientContext';

type ViewMode = 'pretty' | 'raw';

function getStatusColor(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return 'bg-green-100 text-green-800';
  if (statusCode >= 300 && statusCode < 400) return 'bg-yellow-100 text-yellow-800';
  if (statusCode >= 400 && statusCode < 500) return 'bg-orange-100 text-orange-800';
  if (statusCode >= 500) return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-800';
}

function formatJson(str: string): string {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}

function isJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ResponseViewer() {
  const { response, isLoading, error } = useApiClient();
  const [viewMode, setViewMode] = useState<ViewMode>('pretty');
  const [showHeaders, setShowHeaders] = useState(false);

  if (isLoading) {
    return (
      <div className="border border-gray-300 rounded-lg p-8 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Sending request...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-300 rounded-lg p-4 bg-red-50">
        <div className="flex items-center gap-2 text-red-700">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">Error:</span>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="border border-gray-300 rounded-lg p-8 flex items-center justify-center text-gray-500">
        <p>Enter a URL and click Send to see the response</p>
      </div>
    );
  }

  const bodySize = new Blob([response.body]).size;
  const bodyIsJson = isJson(response.body);

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-300">
        <div className="flex items-center gap-4">
          <span className={`px-2 py-1 rounded text-sm font-semibold ${getStatusColor(response.statusCode)}`}>
            {response.statusCode > 0 ? response.status : 'Error'}
          </span>
          <span className="text-sm text-gray-600">
            <span className="font-medium">{response.duration}</span> ms
          </span>
          <span className="text-sm text-gray-600">
            <span className="font-medium">{formatBytes(bodySize)}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHeaders(!showHeaders)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              showHeaders ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Headers ({Object.keys(response.headers).length})
          </button>
          {bodyIsJson && (
            <div className="flex rounded overflow-hidden border border-gray-300">
              <button
                onClick={() => setViewMode('pretty')}
                className={`px-3 py-1 text-sm ${
                  viewMode === 'pretty' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Pretty
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`px-3 py-1 text-sm ${
                  viewMode === 'raw' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Raw
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Headers Section */}
      {showHeaders && (
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-300">
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(response.headers).map(([key, value]) => (
                <tr key={key}>
                  <td className="py-1 pr-4 font-medium text-gray-700 whitespace-nowrap">{key}</td>
                  <td className="py-1 text-gray-600 break-all">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Body */}
      <div className="p-4 max-h-96 overflow-auto">
        <pre className="font-mono text-sm whitespace-pre-wrap break-all">
          {viewMode === 'pretty' && bodyIsJson ? formatJson(response.body) : response.body}
        </pre>
      </div>
    </div>
  );
}
