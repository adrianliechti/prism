import { useMemo } from 'react';
import { useApiClient } from '../context/useApiClient';
import type { HttpMethod, HistoryEntry } from '../types/api';
import { PanelRightOpen, Trash2 } from 'lucide-react';

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-green-400',
  POST: 'text-yellow-400',
  PUT: 'text-blue-400',
  PATCH: 'text-purple-400',
  DELETE: 'text-red-400',
  OPTIONS: 'text-gray-400',
  HEAD: 'text-gray-400',
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
  if (!statusCode) return 'bg-gray-500';
  if (statusCode >= 200 && statusCode < 300) return 'bg-green-500';
  if (statusCode >= 300 && statusCode < 400) return 'bg-yellow-500';
  if (statusCode >= 400 && statusCode < 500) return 'bg-orange-500';
  return 'bg-red-500';
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'Other';
  }
}

interface HostGroup {
  hostname: string;
  entries: HistoryEntry[];
  latestTimestamp: number;
}

function groupByHostname(history: HistoryEntry[]): HostGroup[] {
  const groups = new Map<string, HistoryEntry[]>();
  
  for (const entry of history) {
    const hostname = getHostname(entry.url);
    const existing = groups.get(hostname) || [];
    existing.push(entry);
    groups.set(hostname, existing);
  }
  
  // Convert to array and sort groups by most recent entry
  return Array.from(groups.entries())
    .map(([hostname, entries]) => ({
      hostname,
      entries,
      latestTimestamp: Math.max(...entries.map(e => e.timestamp)),
    }))
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp);
}

export function Sidebar() {
  const { history, sidebarCollapsed, loadFromHistory, deleteHistoryEntry, clearHistory, toggleSidebar } = useApiClient();
  
  const groupedHistory = useMemo(() => groupByHostname(history), [history]);

  if (sidebarCollapsed) {
    return null;
  }

  return (
    <aside className="w-64 bg-[#1a1a1a]/60 backdrop-blur-xl border border-white/8 rounded-xl flex flex-col overflow-hidden shadow-2xl">
      {/* Sidebar Header */}
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        <h1 className="text-sm font-semibold text-gray-200 pl-0.5">Prism</h1>
        <div className="flex items-center gap-1">
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              title="Clear history"
            >
              <Trash2 className="w-4 h-4 text-gray-400" />
            </button>
          )}
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            title="Hide sidebar"
          >
            <PanelRightOpen className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto px-2">
        {history.length === 0 ? (
          <div className="px-2 py-8 text-center text-gray-600 text-xs">
            No history yet
          </div>
        ) : (
          <div className="space-y-3 pb-2">
            {groupedHistory.map((group) => (
              <div key={group.hostname}>
                <div className="px-2 py-1 text-[10px] font-medium text-gray-500 uppercase tracking-wider truncate" title={group.hostname}>
                  {group.hostname}
                </div>
                <div className="space-y-0.5">
                  {group.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="group flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                      onClick={() => loadFromHistory(entry)}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(entry.statusCode)}`}
                      />
                      <span className={`text-[10px] font-semibold w-7 shrink-0 ${methodColors[entry.method]}`}>
                        {entry.method.slice(0, 3)}
                      </span>
                      <span className="text-xs text-gray-400 truncate flex-1" title={entry.url}>
                        {(() => {
                          try {
                            const url = new URL(entry.url);
                            return url.pathname + url.search;
                          } catch {
                            return entry.url;
                          }
                        })()}
                      </span>
                      <div className="flex items-center justify-end text-[10px] text-gray-600 shrink-0 w-12 h-5">
                        <span className="group-hover:hidden">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteHistoryEntry(entry.id);
                          }}
                          className="hidden group-hover:inline-flex items-center justify-center w-5 h-5 hover:bg-white/8 rounded transition-colors"
                          title="Delete"
                        >
                          <svg className="w-3 h-3 text-gray-500 hover:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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


