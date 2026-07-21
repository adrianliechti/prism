import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, FileText, Search, RefreshCw } from 'lucide-react';
import { useClient } from '../context/useClient';
import type { McpFeature } from '../types/types';

interface FeatureItemProps {
  feature: McpFeature;
  type: 'tool' | 'resource';
  isSelected: boolean;
  onSelect: () => void;
}

// Annotation hints are display-only; the spec says clients must treat them as
// untrusted, so they are never used to gate behavior.
function annotationHints(feature: McpFeature): string[] {
  const annotations = feature.annotations;
  if (!annotations) return [];
  const hints: string[] = [];
  if (annotations.readOnlyHint) hints.push('read-only');
  if (annotations.destructiveHint) hints.push('destructive');
  if (annotations.idempotentHint) hints.push('idempotent');
  if (annotations.openWorldHint) hints.push('open-world');
  return hints;
}

function FeatureItem({ feature, type, isSelected, onSelect }: FeatureItemProps) {
  const [expanded, setExpanded] = useState(false);
  const hasInputSchema = feature.schema && Object.keys(feature.schema).length > 0;
  const hasDetails = hasInputSchema || feature.outputSchema;
  // Spec display precedence: title, then annotations.title, then name
  const displayName = feature.title || feature.annotations?.title || feature.name;
  const hints = annotationHints(feature);

  return (
    <div className={`border rounded-md ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-neutral-200 dark:border-white/10'}`}>
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-white/5"
        onClick={onSelect}
      >
        {type === 'tool' ? (
          <Wrench className="w-4 h-4 text-amber-500 shrink-0" />
        ) : (
          <FileText className="w-4 h-4 text-blue-500 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-medium text-sm truncate" title={feature.name}>{displayName}</span>
            {hints.map((hint) => (
              <span key={hint} className="px-1.5 py-px text-[10px] rounded-full bg-neutral-100 dark:bg-white/10 text-neutral-500 dark:text-neutral-400 shrink-0">
                {hint}
              </span>
            ))}
          </div>
          {feature.description && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {feature.description}
            </div>
          )}
        </div>
        {hasDetails && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-1 hover:bg-neutral-200 dark:hover:bg-white/10 rounded"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
      {expanded && hasDetails && (
        <div className="px-3 pb-2 border-t border-neutral-200 dark:border-white/10">
          {hasInputSchema && (
            <>
              <div className="text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mt-2">Input schema</div>
              <pre className="text-xs bg-neutral-100 dark:bg-black/20 p-2 rounded mt-1 overflow-auto max-h-48">
                {JSON.stringify(feature.schema, null, 2)}
              </pre>
            </>
          )}
          {feature.outputSchema && (
            <>
              <div className="text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mt-2">Output schema</div>
              <pre className="text-xs bg-neutral-100 dark:bg-black/20 p-2 rounded mt-1 overflow-auto max-h-48">
                {JSON.stringify(feature.outputSchema, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function McpFeatureBrowser({ onSelected }: { onSelected?: () => void }) {
  const { request, discoverMcpFeatures, setMcpTool, setMcpResource } = useClient();
  const [activeTab, setActiveTab] = useState<'tools' | 'resources'>('tools');
  const [features, setFeatures] = useState<{ tools: McpFeature[]; resources: McpFeature[]; error?: string } | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [filter, setFilter] = useState('');

  const tools = features?.tools || [];
  const resources = features?.resources || [];
  const normalizedFilter = filter.trim().toLowerCase();
  const filteredTools = normalizedFilter
    ? tools.filter((tool) => `${tool.name} ${tool.title ?? ''} ${tool.description ?? ''}`.toLowerCase().includes(normalizedFilter))
    : tools;
  const filteredResources = normalizedFilter
    ? resources.filter((resource) => `${resource.name} ${resource.title ?? ''} ${resource.uri ?? ''} ${resource.description ?? ''}`.toLowerCase().includes(normalizedFilter))
    : resources;
  const error = features?.error;
  const hasFeatures = tools.length > 0 || resources.length > 0;

  const handleDiscover = async () => {
    setIsDiscovering(true);
    try {
      const result = await discoverMcpFeatures();
      if (result) {
        setFeatures(result);
      }
    } finally {
      setIsDiscovering(false);
    }
  };

  if (!features) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          Enter an MCP server URL and discover its features
        </p>
        <button
          onClick={handleDiscover}
          disabled={!request.url || isDiscovering}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Search className="w-4 h-4" />
          Discover
        </button>
      </div>
    );
  }

  if (error && !hasFeatures) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-red-500 dark:text-red-400 mb-4">
          {error}
        </p>
        <button
          onClick={handleDiscover}
          disabled={!request.url || isDiscovering}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-white/10 shrink-0">
        <button
          onClick={() => setActiveTab('tools')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'tools'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          <Wrench className="w-4 h-4" />
          Tools ({tools.length})
        </button>
        <button
          onClick={() => setActiveTab('resources')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'resources'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          Resources ({resources.length})
        </button>
        <div className="flex-1" />
        <button
          onClick={handleDiscover}
          disabled={isDiscovering}
          className="p-2 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 disabled:opacity-40"
          title="Refresh features"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {error && (
        <div className="px-3 py-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/40 shrink-0">
          {error}
        </div>
      )}
      <div className="p-2 border-b border-neutral-200 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-md">
          <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter features"
            className="flex-1 min-w-0 bg-transparent text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Feature list */}
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {activeTab === 'tools' && (
          <>
            {filteredTools.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-4">
                {tools.length === 0 ? 'No tools available' : 'No matching tools'}
              </p>
            ) : (
              filteredTools.map((tool: McpFeature) => (
                <FeatureItem
                  key={tool.name}
                  feature={tool}
                  type="tool"
                  isSelected={request.mcp?.tool?.name === tool.name}
                  onSelect={() => {
                    setMcpTool({ name: tool.name, arguments: '{}', schema: tool.schema });
                    onSelected?.();
                  }}
                />
              ))
            )}
          </>
        )}
        {activeTab === 'resources' && (
          <>
            {filteredResources.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-4">
                {resources.length === 0 ? 'No resources available' : 'No matching resources'}
              </p>
            ) : (
              filteredResources.map((resource: McpFeature) => (
                <FeatureItem
                  key={resource.uri ?? resource.name}
                  feature={resource}
                  type="resource"
                  isSelected={request.mcp?.resource?.uri === resource.uri}
                  onSelect={() => {
                    if (!resource.uri) return;
                    setMcpResource({ uri: resource.uri });
                    onSelected?.();
                  }}
                />
              ))
            )}
          </>
        )}
      </div>

      {/* Selected info */}
      {(request.mcp?.tool || request.mcp?.resource) && (
        <div className="border-t border-neutral-200 dark:border-white/10 p-2 shrink-0">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Selected: {request.mcp?.tool ? `Tool: ${request.mcp.tool.name}` : `Resource: ${request.mcp?.resource?.uri}`}
          </div>
        </div>
      )}
    </div>
  );
}
