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

function FeatureItem({ feature, type, isSelected, onSelect }: FeatureItemProps) {
  const [expanded, setExpanded] = useState(false);
  const hasSchema = feature.schema && Object.keys(feature.schema).length > 0;

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
          <div className="font-medium text-sm truncate">{feature.name}</div>
          {feature.description && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {feature.description}
            </div>
          )}
        </div>
        {hasSchema && (
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
      {expanded && hasSchema && (
        <div className="px-3 pb-2 border-t border-neutral-200 dark:border-white/10">
          <pre className="text-xs bg-neutral-100 dark:bg-black/20 p-2 rounded mt-2 overflow-auto max-h-48">
            {JSON.stringify(feature.schema, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function McpFeatureBrowser({ onSelected }: { onSelected?: () => void }) {
  const { request, discoverMcpFeatures, setMcpSelectedTool, setMcpSelectedResource } = useClient();
  const [activeTab, setActiveTab] = useState<'tools' | 'resources'>('tools');

  const features = request.mcpFeatures;
  const tools = features?.tools || [];
  const resources = features?.resources || [];
  const error = features?.error;

  const handleDiscover = () => {
    discoverMcpFeatures();
  };

  if (!features) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          Enter an MCP server URL and discover its features
        </p>
        <button
          onClick={handleDiscover}
          disabled={!request.url || request.executing}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Search className="w-4 h-4" />
          Discover
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-red-500 dark:text-red-400 mb-4">
          {error}
        </p>
        <button
          onClick={handleDiscover}
          disabled={!request.url || request.executing}
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
          disabled={request.executing}
          className="p-2 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 disabled:opacity-40"
          title="Refresh features"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Feature list */}
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {activeTab === 'tools' && (
          <>
            {tools.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-4">
                No tools available
              </p>
            ) : (
              tools.map((tool) => (
                <FeatureItem
                  key={tool.name}
                  feature={tool}
                  type="tool"
                  isSelected={request.mcpSelectedTool === tool.name}
                  onSelect={() => {
                    setMcpSelectedTool(tool.name);
                    onSelected?.();
                  }}
                />
              ))
            )}
          </>
        )}
        {activeTab === 'resources' && (
          <>
            {resources.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-4">
                No resources available
              </p>
            ) : (
              resources.map((resource) => (
                <FeatureItem
                  key={resource.name}
                  feature={resource}
                  type="resource"
                  isSelected={request.mcpSelectedResource === resource.name}
                  onSelect={() => {
                    setMcpSelectedResource(resource.name);
                    onSelected?.();
                  }}
                />
              ))
            )}
          </>
        )}
      </div>

      {/* Selected info */}
      {(request.mcpSelectedTool || request.mcpSelectedResource) && (
        <div className="border-t border-neutral-200 dark:border-white/10 p-2 shrink-0">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Selected: {request.mcpSelectedTool ? `Tool: ${request.mcpSelectedTool}` : `Resource: ${request.mcpSelectedResource}`}
          </div>
        </div>
      )}
    </div>
  );
}
