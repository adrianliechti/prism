import { useApiClient } from '../context/useApiClient';
import { MethodSelector } from './MethodSelector';
import { PanelRightClose } from 'lucide-react';

export function UrlBar() {
  const { request, setUrl, executeRequest, sidebarCollapsed, toggleSidebar } = useApiClient();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeRequest();
  };

  const url = request?.url ?? '';
  const isLoading = request?.isLoading ?? false;

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      {sidebarCollapsed && (
        <button
          type="button"
          onClick={toggleSidebar}
          className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-gray-400 hover:text-gray-200"
          title="Show sidebar"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      )}
      <MethodSelector />
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Enter request URL"
        className="flex-1 px-3 py-1.5 bg-transparent text-gray-100 text-sm placeholder-gray-600 focus:outline-none"
      />
      <button
        type="submit"
        disabled={isLoading || !url}
        className="p-1.5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition-colors text-gray-400 hover:text-gray-200"
        title="Send request"
      >
        {isLoading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        )}
      </button>
    </form>
  );
}
