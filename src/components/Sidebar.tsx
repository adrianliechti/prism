import { useMemo } from 'react';
import { useClient } from '../context/useClient';
import type { HttpMethod, Request } from '../types/types';
import { PanelRightOpen, Trash2 } from 'lucide-react';

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-green-600 dark:text-green-400',
  POST: 'text-yellow-600 dark:text-yellow-400',
  PUT: 'text-blue-600 dark:text-blue-400',
  PATCH: 'text-purple-600 dark:text-purple-400',
  DELETE: 'text-red-600 dark:text-red-400',
  OPTIONS: 'text-neutral-500 dark:text-neutral-400',
  HEAD: 'text-neutral-500 dark:text-neutral-400',
};

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getStatusColor(statusCode: number | null): string {
  if (!statusCode) return 'bg-neutral-500';
  if (statusCode >= 200 && statusCode < 300) return 'bg-green-500';
  if (statusCode >= 300 && statusCode < 400) return 'bg-yellow-500';
  if (statusCode >= 400 && statusCode < 500) return 'bg-orange-500';
  return 'bg-red-500';
}

function getHostname(entry: Request): string {
  try {
    return new URL(entry.url).hostname;
  } catch {
    return 'Other';
  }
}

function getDisplayPath(entry: Request): string {
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
  return entry.http?.method ?? 'GET';
}

function getMethodColor(entry: Request): string {
  if (entry.protocol === 'grpc') {
    return 'text-cyan-600 dark:text-cyan-400';
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
  const { history, sidebarCollapsed, loadFromHistory, deleteHistoryEntry, clearHistory, toggleSidebar } = useClient();
  
  const groupedHistory = useMemo(() => groupByHostname(history), [history]);

  // Hide sidebar completely when no history
  if (history.length === 0 || sidebarCollapsed) {
    return null;
  }

  return (
    <aside className="w-64 bg-white dark:bg-[#1a1a1a]/60 dark:backdrop-blur-xl border border-neutral-200 dark:border-white/8 rounded-xl flex flex-col overflow-hidden dark:shadow-2xl">
      {/* Sidebar Header */}
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        <h1 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 pl-0.5">Prism</h1>
        <div className="flex items-center gap-1">
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
              title="Clear history"
            >
              <Trash2 className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
            </button>
          )}
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
            title="Hide sidebar"
          >
            <PanelRightOpen className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
          </button>
        </div>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto px-2">
        {history.length === 0 ? (
          <div className="px-2 py-8 text-center text-neutral-400 dark:text-neutral-600 text-xs">
            No history yet
          </div>
        ) : (
          <div className="space-y-3 pb-2">
            {groupedHistory.map((group) => (
              <div key={group.hostname}>
                <div className="px-2 py-1 text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider truncate" title={group.hostname}>
                  {group.hostname}
                </div>
                <div className="space-y-0.5">
                  {group.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="group flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer transition-colors"
                      onClick={() => loadFromHistory(entry)}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(
                          entry.http?.response?.statusCode ?? 
                          (entry.grpc?.response?.error ? 0 : entry.grpc?.response ? 200 : null) ??
                          (entry.mcp?.response?.error ? 0 : entry.mcp?.response ? 200 : null)
                        )}`}
                      />
                      <span className={`text-[10px] font-semibold shrink-0 ${getMethodColor(entry)}`}>
                        {getDisplayMethod(entry)}
                      </span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate flex-1" title={entry.url}>
                        {getDisplayPath(entry)}
                      </span>
                      <div className="flex items-center justify-end text-[10px] text-neutral-400 dark:text-neutral-600 shrink-0 w-12 h-5">
                        <span className="group-hover:hidden">
                          {formatTimestamp(entry.executionTime ?? entry.creationTime)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteHistoryEntry(entry.id);
                          }}
                          className="hidden group-hover:inline-flex items-center justify-center w-5 h-5 hover:bg-neutral-200 dark:hover:bg-white/8 rounded transition-colors"
                          title="Delete"
                        >
                          <svg className="w-3 h-3 text-neutral-400 dark:text-neutral-500 hover:text-rose-500 dark:hover:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}


