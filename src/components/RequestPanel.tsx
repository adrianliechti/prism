import { useClient } from '../context/useClient';
import { useRequestBarPortal } from '../context/RequestBarPortal';
import { ProtocolSwitcher } from './ProtocolSwitcher';
import { SharedRequestActions } from './SharedRequestActions';
import { HttpRequestBar, HttpRequestPanel } from './http';
import { GrpcRequestBar, GrpcRequestPanel } from './grpc';
import { McpRequestBar, McpRequestPanel } from './mcp';
import { ResponseViewer } from './ResponseViewer';
import { PanelRightClose } from 'lucide-react';

export function RequestPanel() {
  const { request, newRequest, sidebarCollapsed, toggleSidebar, history } = useClient();
  const { setPortalTarget } = useRequestBarPortal();

  if (!request) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-400 dark:text-neutral-500">
        No active request
      </div>
    );
  }

  const protocol = request.protocol ?? 'rest';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* URL Bar */}
      <div className="pl-2 pr-3 py-2 border-b border-neutral-200 dark:border-white/5 flex items-center gap-2 shrink-0">
        {sidebarCollapsed && history.length > 0 && (
          <button
            type="button"
            onClick={toggleSidebar}
            className="p-1.5 hover:bg-neutral-100 dark:hover:bg-white/10 rounded-md transition-colors text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            title="Show sidebar"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        )}

        <ProtocolSwitcher />

        <div className="flex-1 flex items-center">
          {protocol === 'rest' && <HttpRequestBar />}
          {protocol === 'grpc' && <GrpcRequestBar />}
          {protocol === 'mcp' && <McpRequestBar />}
        </div>

        {/* Portal target for shared actions (Send, AI) */}
        <div ref={setPortalTarget} className="flex items-center gap-1" />
        <SharedRequestActions />

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
        {protocol === 'rest' && <HttpRequestPanel />}
        {protocol === 'grpc' && <GrpcRequestPanel />}
        {protocol === 'mcp' && <McpRequestPanel />}
      </div>

      {/* Response */}
      <div className="flex-1 pl-2 pr-3 py-2 flex flex-col min-h-0 overflow-hidden">
        {(request.http?.response || request.grpc?.response || request.mcp?.response) && (
          <h2 className="text-[10px] font-medium text-neutral-500 dark:text-neutral-300 uppercase tracking-wider mb-2 shrink-0">Response</h2>
        )}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ResponseViewer />
        </div>
      </div>
    </div>
  );
}
