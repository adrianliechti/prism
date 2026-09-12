import { useMemo, useState } from 'react';
import { useClient } from '../context/useClient';
import type { HttpMethod, Request } from '../types/types';
import { PanelRightOpen, Trash2, X, Loader2 } from 'lucide-react';
import { requestLabel } from '../lib/requestUtils';

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-green-600 dark:text-green-400',
  POST: 'text-yellow-600 dark:text-yellow-400',
  PUT: 'text-blue-600 dark:text-blue-400',
  PATCH: 'text-purple-600 dark:text-purple-400',
  DELETE: 'text-red-600 dark:text-red-400',
  OPTIONS: 'text-neutral-500 dark:text-neutral-400',
  HEAD: 'text-neutral-500 dark:text-neutral-400',
};

function getHostname(entry: Request): string {
  try {
    return new URL(entry.url).hostname;
  } catch {
    return 'Other';
  }
}

function getDisplayPath(entry: Request): string {
  // For MCP, show tool or resource name
  if (entry.protocol === 'mcp') {
    if (entry.mcp?.tool?.name) {
      return entry.mcp.tool.name;
    }
    if (entry.mcp?.resource?.uri) {
      return entry.mcp.resource.uri;
    }
    return 'MCP Request';
  }
  // For OpenAI, show model as subtitle
  if (entry.protocol === 'openai') {
    return entry.openai?.model || 'No model';
  }
  // For gRPC, show just the method name (last part of path)
  if (entry.protocol === 'grpc') {
    try {
      const url = new URL(entry.url);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        return parts[parts.length - 1]; // Return just the method name
      }
    } catch {
      // Fall through
    }
    return entry.url;
  }
  try {
    const url = new URL(entry.url);
    return url.pathname + url.search;
  } catch {
    return entry.url;
  }
}

function getDisplayMethod(entry: Request): string {
  if (entry.protocol === 'grpc') {
    return 'gRPC';
  }
  if (entry.protocol === 'mcp') {
    return 'MCP';
  }
  if (entry.protocol === 'openai') {
    return 'OpenAI';
  }
  return entry.http?.method ?? 'GET';
}

function getMethodColor(entry: Request): string {
  if (entry.protocol === 'grpc') {
    return 'text-cyan-600 dark:text-cyan-400';
  }
  if (entry.protocol === 'mcp') {
    return 'text-violet-600 dark:text-violet-400';
  }
  if (entry.protocol === 'openai') {
    return 'text-purple-600 dark:text-purple-400';
  }
  return methodColors[entry.http?.method ?? 'GET'];
}

interface HostGroup {
  hostname: string;
  entries: Request[];
  latestTimestamp: number;
}

function groupByHostname(history: Request[]): HostGroup[] {
  const groups = new Map<string, Request[]>();
  
  for (const entry of history) {
    const hostname = getHostname(entry);
    const existing = groups.get(hostname) || [];
    existing.push(entry);
    groups.set(hostname, existing);
  }
  
  // Convert to array and sort groups by most recent entry
  return Array.from(groups.entries())
    .map(([hostname, entries]) => ({
      hostname,
      entries,
      latestTimestamp: Math.max(...entries.map(e => e.executionTime ?? 0)),
    }))
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp);
}

export function Sidebar() {
  const { request, drafts, history, executingIds, sidebarCollapsed, selectRequest, deleteRequest,
    loadFromHistory, deleteHistoryEntry, clearHistory, toggleSidebar } = useClient();
  const [view, setView] = useState<'requests' | 'history'>('requests');
  const entries = view === 'requests' ? drafts : history;
  const grouped = useMemo(() => groupByHostname(entries), [entries]);
  if (sidebarCollapsed) return null;
  return (
    <aside className="w-60 shrink-0 bg-white dark:bg-[#1a1a1a]/60 border border-neutral-200 dark:border-white/8 rounded-xl flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        <h1 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Prism</h1>
        <div className="flex items-center gap-1">
          {view === 'history' && history.length > 0 && <button onClick={clearHistory} className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-white/5" title="Clear history"><Trash2 className="w-4 h-4 text-neutral-500" /></button>}
          <button onClick={toggleSidebar} className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-white/5" title="Hide sidebar"><PanelRightOpen className="w-4 h-4 text-neutral-500" /></button>
        </div>
      </div>
      <div role="tablist" aria-label="Saved requests and history" className="flex px-2 gap-1">
        {(['requests', 'history'] as const).map(tab => <button key={tab} role="tab" aria-selected={view === tab} onClick={() => setView(tab)}
          className={`flex-1 py-1.5 rounded text-xs ${view === tab ? 'bg-neutral-100 dark:bg-white/10 font-medium' : 'text-neutral-500'}`}>
          {tab === 'requests' ? 'Requests' : 'History'}
        </button>)}
      </div>
      <div className="flex-1 overflow-y-auto px-2 pt-2 pb-3">
        {grouped.length === 0 && <p className="px-2 py-6 text-center text-xs text-neutral-400">{view === 'requests' ? 'No saved requests yet' : 'No history yet'}</p>}
        {grouped.map(group => <div key={group.hostname} className="mb-3">
          <div className="px-2 py-1 text-[10px] text-neutral-400 uppercase truncate">{group.hostname}</div>
          {group.entries.map(entry => <div key={entry.id} className={`group flex items-center rounded-md ${view === 'requests' && entry.id === request.id ? 'bg-neutral-100 dark:bg-white/10' : 'hover:bg-neutral-50 dark:hover:bg-white/5'}`}>
            <button aria-current={view === 'requests' && entry.id === request.id ? 'page' : undefined}
              onClick={() => { if (view === 'requests') selectRequest(entry.id); else loadFromHistory(entry); }}
              className="flex-1 min-w-0 flex items-center gap-2 px-2 py-2 text-left" title={entry.url || 'Untitled request'}>
              {executingIds.includes(entry.id) ? <Loader2 className="w-3 h-3 animate-spin shrink-0" /> : <span className={`text-[10px] font-semibold shrink-0 ${getMethodColor(entry)}`}>{getDisplayMethod(entry)}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs">{view === 'requests' ? requestLabel(entry) : getDisplayPath(entry)}</span>
                {view === 'history' && entry.executionTime && <time className="block mt-0.5 text-[10px] text-neutral-400" dateTime={new Date(entry.executionTime).toISOString()}>{new Date(entry.executionTime).toLocaleString()}</time>}
              </span>
            </button>
            <button onClick={() => { if (view === 'requests') void deleteRequest(entry.id); else void deleteHistoryEntry(entry.id); }}
              title={view === 'requests' ? 'Delete saved request' : 'Delete history entry'}
              className="p-1 mr-1 text-neutral-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 focus:opacity-100"><X className="w-3 h-3" /></button>
          </div>)}
        </div>)}
      </div>
    </aside>
  );
}
