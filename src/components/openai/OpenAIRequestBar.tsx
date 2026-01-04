import { useState, useRef, useEffect, useCallback } from 'react';
import { useClient } from '../../context/useClient';
import { ChevronDown, Cpu, RefreshCw } from 'lucide-react';

export function OpenAIRequestBar() {
  const { request, setUrl, setOpenAIModel } = useClient();

  const url = request?.url ?? '';
  const model = request?.openai?.model ?? '';

  const [models, setModels] = useState<string[]>([]);

  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!modelMenuOpen) return;
    const handler = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelMenuOpen]);

  const fetchModels = useCallback(async () => {
    if (!url) return;

    setLoading(true);
    setError(null);

    try {
      // Normalize URL - remove trailing slash
      const baseUrl = url.replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/v1/models`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const modelIds: string[] = (data.data || []).map((m: { id: string }) => m.id).sort();
      
      setModels(modelIds);
      
      // Auto-select first model if none selected
      if (!model && modelIds.length > 0) {
        setOpenAIModel(modelIds[0]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch models';
      setError(message);
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [url, model, setOpenAIModel]);

  // Fetch models when URL changes (debounced)
  useEffect(() => {
    if (!url) return;

    const timeoutId = setTimeout(() => {
      fetchModels();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenModelMenu = () => {
    setModelMenuOpen(true);
  };

  const handleSelectModel = (selectedModel: string) => {
    setOpenAIModel(selectedModel);
    setModelMenuOpen(false);
  };

  // Calculate input width based on content
  const urlInputSize = Math.max(12, url.length || 20);

  return (
    <div className="flex items-center flex-1 min-w-0">
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="OpenAI base URL"
        size={urlInputSize}
        className="min-w-24 max-w-full px-2 py-1.5 bg-transparent text-neutral-800 dark:text-neutral-100 text-sm placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none"
      />

      <span className="text-neutral-300 dark:text-neutral-600 shrink-0">/</span>

      {/* Model selector */}
      <div className="relative shrink-0" ref={modelMenuRef}>
        <button
          type="button"
          onClick={handleOpenModelMenu}
          disabled={!url}
          className="h-8 px-2 flex items-center gap-2 text-sm transition hover:bg-neutral-50 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed rounded"
        >
          <Cpu className={`w-4 h-4 shrink-0 ${model ? 'text-violet-500' : 'text-neutral-400'}`} />
          <span className={`text-sm whitespace-nowrap ${model ? 'text-neutral-800 dark:text-neutral-100' : 'text-neutral-400 dark:text-neutral-500'}`}>
            {model || 'Select model'}
          </span>
          {loading ? (
            <RefreshCw className="w-3.5 h-3.5 text-neutral-400 shrink-0 animate-spin" />
          ) : (
            <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`} />
          )}
        </button>

        {modelMenuOpen && (
          <div className="absolute left-0 z-50 mt-2 w-64 max-h-80 bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-lg shadow-xl overflow-hidden">
            <div className="p-2 border-b border-neutral-200 dark:border-white/10 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Models ({models.length})
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fetchModels();
                }}
                disabled={loading}
                className="p-1 hover:bg-neutral-100 dark:hover:bg-white/10 rounded transition-colors disabled:opacity-50"
                title="Refresh models"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-neutral-400 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="overflow-y-auto max-h-64">
              {error ? (
                <div className="p-3 text-sm text-red-500 dark:text-red-400">
                  {error}
                </div>
              ) : models.length === 0 ? (
                <div className="p-3 text-sm text-neutral-400 dark:text-neutral-500">
                  {loading ? 'Loading models...' : 'No models available'}
                </div>
              ) : (
                models.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleSelectModel(m)}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                      model === m
                        ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300'
                        : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/5'
                    }`}
                  >
                    {m}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
