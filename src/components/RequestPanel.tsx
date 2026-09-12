import { useClient } from '../context/useClient';
import { useRequestBarPortal } from '../context/requestBarPortalContext';
import { ProtocolSwitcher } from './ProtocolSwitcher';
import { SharedRequestActions } from './SharedRequestActions';
import { HttpRequestBar, HttpRequestPanel } from './http';
import { GrpcRequestBar, GrpcRequestPanel } from './grpc';
import { McpRequestBar, McpRequestPanel } from './mcp';
import { OpenAIRequestBar, OpenAIRequestPanel } from './openai';
import { ResponseViewer } from './ResponseViewer';
import { PanelRightClose, Plus } from 'lucide-react';
import { useRef, useState } from 'react';

export function RequestPanel() {
  const { request, newRequest, sidebarCollapsed, toggleSidebar, setName, storageError, retrySave } = useClient();
  const { setPortalTarget } = useRequestBarPortal();
  const split = useRef<HTMLDivElement>(null);
  const [requestHeight, setRequestHeight] = useState(38);

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
      <div className="flex items-center gap-3 px-3 py-1 shrink-0">
        <input aria-label="Request name" value={request.name} onChange={e => setName(e.target.value)} placeholder="Request name"
          className="min-w-0 flex-1 bg-transparent text-xs font-medium py-1 focus:outline-none" />
      </div>
      {storageError && <div role="alert" className="flex items-center gap-2 px-3 py-2 text-xs bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 shrink-0">
        <span className="flex-1">{storageError}</span><button onClick={retrySave} className="underline">Retry save</button>
      </div>}
      {/* URL Bar */}
      <div className="pl-2 pr-3 py-2 border-b border-neutral-200 dark:border-white/5 flex items-center gap-2 shrink-0">
        {sidebarCollapsed && (
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

        <div className="flex-1 flex items-center min-w-0">
          {protocol === 'rest' && <HttpRequestBar />}
          {protocol === 'grpc' && <GrpcRequestBar />}
          {protocol === 'mcp' && <McpRequestBar />}
          {protocol === 'openai' && <OpenAIRequestBar />}
        </div>

        {/* Portal target for shared actions (Send, AI) */}
        <div ref={setPortalTarget} className="flex items-center gap-1" />
        <SharedRequestActions />

        <button
          onClick={newRequest}
          className="p-1.5 hover:bg-neutral-100 dark:hover:bg-white/10 rounded-md transition-colors text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          title="New request"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div ref={split} className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Each pane scrolls independently; long tables cannot push out the response. */}
      <div style={{ flexBasis: `${requestHeight}%` }} className="pl-2 pr-3 py-2 overflow-auto shrink-0 min-h-20">
        {protocol === 'rest' && <HttpRequestPanel />}
        {protocol === 'grpc' && <GrpcRequestPanel />}
        {protocol === 'mcp' && <McpRequestPanel />}
        {protocol === 'openai' && <OpenAIRequestPanel />}
      </div>
      <div role="separator" aria-label="Resize request and response" aria-orientation="horizontal" tabIndex={0}
        aria-valuemin={15} aria-valuemax={75} aria-valuenow={Math.round(requestHeight)}
        className="h-2 shrink-0 cursor-row-resize border-y border-neutral-200 dark:border-white/10 hover:bg-neutral-200 dark:hover:bg-white/10 focus:bg-neutral-200 dark:focus:bg-white/10 outline-none touch-none"
        onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
        onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId) && split.current) { const bounds = split.current.getBoundingClientRect(); setRequestHeight(Math.max(15, Math.min(75, (e.clientY - bounds.top) / bounds.height * 100))); } }}
        onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)}
        onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setRequestHeight(value => Math.max(15, Math.min(75, value + (e.key === 'ArrowUp' ? -5 : 5)))); } }} />

      {/* Response */}
      <div role="region" aria-label="Response" className="flex-1 pl-2 pr-3 py-2 flex flex-col min-h-0 overflow-hidden">
        {(request.http?.response || request.grpc?.response || request.mcp?.response || request.openai?.response) && (
          <h2 className="text-[10px] font-medium text-neutral-500 dark:text-neutral-300 uppercase tracking-wider mb-2 shrink-0">Response</h2>
        )}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ResponseViewer />
        </div>
      </div>
      </div>
    </div>
  );
}
