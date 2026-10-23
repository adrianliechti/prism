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
import { getConfig } from '../config';

export function RequestPanel() {
  const { request, newRequest, sidebarCollapsed, toggleSidebar, setName, storageError, retrySave, aiPanelOpen } = useClient();
  const { setPortalTarget } = useRequestBarPortal();
  const split = useRef<HTMLDivElement>(null);
  const [requestHeight, setRequestHeight] = useState(38);

  if (!request) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-dim">
        No active request
      </div>
    );
  }

  const protocol = request.protocol ?? 'rest';

  // The name row is the window's toolbar: it takes the top-left corner while the
  // sidebar is hidden, and the top-right corner while the assistant is closed.
  const chatOpen = aiPanelOpen && !!getConfig().ai?.model;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div
        className={`app-toolbar gap-1 ${sidebarCollapsed ? 'window-controls-start' : ''} ${
          chatOpen ? '' : 'window-controls-end'
        }`}
      >
        {sidebarCollapsed && (
          <button type="button" onClick={toggleSidebar} className="toolbar-button -ml-2" title="Show sidebar">
            <PanelRightClose className="w-4 h-4" />
          </button>
        )}
        {/* The name sizes to its text so the rest of the row still drags the window. */}
        <label className="inline-grid min-w-0 max-w-[60%] text-[15px] font-semibold text-fg">
          <span aria-hidden="true" className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre">
            {request.name || 'Request name'}
          </span>
          <input aria-label="Request name" value={request.name} onChange={e => setName(e.target.value)} placeholder="Request name"
            className="col-start-1 row-start-1 min-w-0 bg-transparent placeholder:text-fg-dim focus:outline-none" />
        </label>
        <div className="flex-1 self-stretch" />
        <button type="button" onClick={newRequest} className="toolbar-button" title="New request">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {storageError && <div role="alert" className="flex items-center gap-2 px-3 py-2 text-xs bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 shrink-0">
        <span className="flex-1">{storageError}</span><button onClick={retrySave} className="underline">Retry save</button>
      </div>}
      {/* URL Bar */}
      <div className="pl-4 pr-3 py-2 border-b border-border-subtle flex items-center gap-2 shrink-0">
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

      </div>

      <div ref={split} className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Each pane scrolls independently; long tables cannot push out the response. */}
      <div style={{ flexBasis: `${requestHeight}%` }} className="pl-5 pr-3 py-2 overflow-auto shrink-0 min-h-20">
        {protocol === 'rest' && <HttpRequestPanel />}
        {protocol === 'grpc' && <GrpcRequestPanel />}
        {protocol === 'mcp' && <McpRequestPanel />}
        {protocol === 'openai' && <OpenAIRequestPanel />}
      </div>
      <div role="separator" aria-label="Resize request and response" aria-orientation="horizontal" tabIndex={0}
        aria-valuemin={15} aria-valuemax={75} aria-valuenow={Math.round(requestHeight)}
        className="h-2 shrink-0 cursor-row-resize border-y border-border-subtle hover:bg-bg-hover focus:bg-bg-hover outline-none touch-none"
        onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
        onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId) && split.current) { const bounds = split.current.getBoundingClientRect(); setRequestHeight(Math.max(15, Math.min(75, (e.clientY - bounds.top) / bounds.height * 100))); } }}
        onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)}
        onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setRequestHeight(value => Math.max(15, Math.min(75, value + (e.key === 'ArrowUp' ? -5 : 5)))); } }} />

      {/* Response */}
      <div role="region" aria-label="Response" className="flex-1 pl-5 pr-3 py-2 flex flex-col min-h-0 overflow-hidden">
        {(request.http?.response || request.grpc?.response || request.mcp?.response || request.openai?.response) && (
          <h2 className="text-[11px] font-semibold text-fg-dim mb-2 shrink-0">Response</h2>
        )}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ResponseViewer />
        </div>
      </div>
      </div>
    </div>
  );
}
