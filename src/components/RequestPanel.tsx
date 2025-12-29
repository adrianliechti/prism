import { UrlBar } from './UrlBar';
import { RequestTabs } from './RequestTabs';
import { ResponseViewer } from './ResponseViewer';
import { useApiClient } from '../context/useApiClient';

export function RequestPanel() {
  const { request, newRequest } = useApiClient();

  if (!request) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        No active request
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* URL Bar */}
      <div className="pl-2 pr-3 py-2 border-b border-white/5 flex items-center gap-2">
        <div className="flex-1">
          <UrlBar />
        </div>
        <button
          onClick={newRequest}
          className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-gray-400 hover:text-gray-200"
          title="New request"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Request Configuration */}
      <div className="pl-2 pr-3 py-2 border-b border-white/5 overflow-visible">
        <RequestTabs />
      </div>

      {/* Response */}
      <div className="flex-1 pl-2 pr-3 py-2 overflow-auto min-h-0">
        <h2 className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-2">Response</h2>
        <ResponseViewer />
      </div>
    </div>
  );
}
