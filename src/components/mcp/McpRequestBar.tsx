import { useState, useRef, useEffect } from 'react';
import { useClient } from '../../context/useClient';
import { ChevronDown, Wrench, FileText } from 'lucide-react';
import { McpFeatureBrowser } from '../McpFeatureBrowser';

export function McpRequestBar() {
  const { request, setUrl } = useClient();

  const url = request?.url ?? '';
  const selectedTool = request?.mcp?.tool?.name;
  const selectedResource = request?.mcp?.resource?.uri;

  const [featureMenuOpen, setFeatureMenuOpen] = useState(false);
  const featureMenuRef = useRef<HTMLDivElement | null>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!featureMenuOpen) return;
    const handler = (event: MouseEvent) => {
      if (featureMenuRef.current && !featureMenuRef.current.contains(event.target as Node)) {
        setFeatureMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [featureMenuOpen]);

  const handleOpenFeatureMenu = () => {
    setFeatureMenuOpen(true);
  };

  const featureLabel = selectedTool
    ? selectedTool
    : selectedResource
      ? selectedResource
      : 'Select feature';

  // Calculate input width based on content
  const urlInputSize = Math.max(12, url.length || 14);

  return (
    <div className="flex items-center flex-1 min-w-0">
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="MCP server URL"
        size={urlInputSize}
        className="min-w-24 max-w-full px-2 py-1.5 bg-transparent text-neutral-800 dark:text-neutral-100 text-sm placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none"
      />

      <span className="text-neutral-300 dark:text-neutral-600 shrink-0">/</span>

      {/* Feature selector */}
      <div className="relative shrink-0" ref={featureMenuRef}>
        <button
          type="button"
          onClick={handleOpenFeatureMenu}
          disabled={!url}
          className="h-8 px-2 flex items-center gap-2 text-sm transition hover:bg-neutral-50 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed rounded"
        >
          {selectedTool ? (
            <Wrench className="w-4 h-4 text-amber-500 shrink-0" />
          ) : selectedResource ? (
            <FileText className="w-4 h-4 text-blue-500 shrink-0" />
          ) : (
            <Wrench className="w-4 h-4 text-neutral-400 shrink-0" />
          )}
          <span className={`text-sm whitespace-nowrap ${selectedTool || selectedResource ? 'text-neutral-800 dark:text-neutral-100' : 'text-neutral-400 dark:text-neutral-500'}`}>
            {featureLabel}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform ${featureMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {featureMenuOpen && (
          <div className="absolute left-0 z-50 mt-2 w-[min(640px,calc(100vw-4rem))] max-h-[70vh] bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-lg shadow-xl overflow-hidden">
            <div className="h-105">
              <McpFeatureBrowser onSelected={() => setFeatureMenuOpen(false)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
