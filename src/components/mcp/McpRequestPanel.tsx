import { useState, useMemo } from 'react';
import { useClient } from '../../context/useClient';
import { JsonEditor, KeyValueEditor } from '../editors';

type Tab = 'headers' | 'body';

const commonMcpHeaders = [
  'Authorization',
  'X-API-Key',
  'X-Request-ID',
];

// Build a lightweight example object from a JSON schema (best-effort)
function buildSchemaExample(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return {};
  const s = schema as Record<string, unknown>;

  const resolvedType = Array.isArray(s.type) ? s.type[0] : s.type;
  const type = resolvedType || (s.properties ? 'object' : s.items ? 'array' : undefined);

  if (type === 'object') {
    const result: Record<string, unknown> = {};
    const props = (s.properties || {}) as Record<string, unknown>;
    Object.keys(props).forEach((key) => {
      result[key] = buildSchemaExample(props[key]);
    });
    return result;
  }

  if (type === 'array') {
    const itemSchema = s.items || { type: 'string' };
    return [buildSchemaExample(itemSchema)];
  }

  const enumVal = s.enum as unknown[] | undefined;
  if (enumVal && enumVal.length > 0) return enumVal[0];

  switch (type) {
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    case 'string': {
      const format = s.format as string | undefined;
      if (format === 'byte') return '';
      return 'string';
    }
    default:
      return {};
  }
}

export function McpRequestPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('body');
  const { request, setMcpTool, setMcpHeaders, setVariables } = useClient();

  const variables = request?.variables ?? [];
  const headers = request?.mcp?.headers ?? [];
  const toolArgs = request?.mcp?.tool?.arguments ?? '{}';
  const selectedTool = request?.mcp?.tool;
  const selectedResource = request?.mcp?.resource;
  const toolSchema = selectedTool?.schema;

  const schemaSuggestion = useMemo(() => {
    try {
      return toolSchema ? buildSchemaExample(toolSchema) : undefined;
    } catch {
      return undefined;
    }
  }, [toolSchema]);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'headers', label: 'Headers', count: headers.filter(h => h.key).length },
    { id: 'body', label: 'Payload' },
  ];

  return (
    <div className="space-y-3">
      {/* Tab Headers */}
      <div className="flex items-center gap-2">
        <div role="tablist" className="inline-flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              onClick={() => setActiveTab(tab.id)}
              className={`px-2 py-1 text-[11px] font-medium rounded-md transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-white/10 text-neutral-800 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[9px] bg-neutral-200 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'headers' && (
          <KeyValueEditor
            items={headers}
            onChange={setMcpHeaders}
            keyPlaceholder="Header"
            valuePlaceholder="Value"
            keySuggestions={commonMcpHeaders}
          />
        )}

        {activeTab === 'body' && (
          selectedTool ? (
            <JsonEditor
              value={toolArgs}
              onChange={(content) => setMcpTool({ name: selectedTool.name, arguments: content, schema: selectedTool.schema })}
              variables={variables}
              onVariablesChange={setVariables}
              placeholder={schemaSuggestion ? JSON.stringify(schemaSuggestion, null, 2) : '{\n  "key": "value"\n}'}
              action={schemaSuggestion !== undefined ? {
                label: 'Fill with schema',
                onClick: () => setMcpTool({ name: selectedTool.name, arguments: JSON.stringify(schemaSuggestion, null, 2), schema: selectedTool.schema })
              } : undefined}
            />
          ) : selectedResource ? (
            <div className="py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">
              Resources are read-only; no arguments required.
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">
              Select a tool or resource from the URL bar.
            </div>
          )
        )}
      </div>
    </div>
  );
}
