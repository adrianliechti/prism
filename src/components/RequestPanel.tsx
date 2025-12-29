import { UrlBar } from './UrlBar';
import { RequestTabs } from './RequestTabs';
import { ResponseViewer } from './ResponseViewer';
import { useClient } from '../context/useClient';

export function RequestPanel() {
  const { request, newRequest } = useClient();

  if (!request) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-400 dark:text-neutral-500">
        No active request
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* URL Bar */}
      <div className="pl-2 pr-3 py-2 border-b border-neutral-200 dark:border-white/5 flex items-center gap-2 shrink-0">
        <div className="flex-1">
          <UrlBar />
        </div>
        <button
          onClick={newRequest}
          className="p-1.5 hover:bg-neutral-100 dark:hover:bg-white/10 rounded-md transition-colors text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          title="New request"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Request Configuration */}
      <div className="pl-2 pr-3 py-2 border-b border-neutral-200 dark:border-white/5 overflow-visible shrink-0">
        <RequestTabs />
      </div>

      {/* Response */}
      <div className="flex-1 pl-2 pr-3 py-2 flex flex-col min-h-0 overflow-hidden">
        <h2 className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-2 shrink-0">Response</h2>
        <div className="flex-1 min-h-0 overflow-hidden">
          <ResponseViewer />
        </div>
      </div>
    </div>
  );
}
