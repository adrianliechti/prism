import { useState, useEffect, useMemo } from 'react';
import { useClient } from '../../context/useClient';
import { KeyValueEditor } from '../KeyValueEditor';
import { JsonEditor } from '../JsonEditor';

type Tab = 'headers' | 'body';

const commonGrpcHeaders = [
  'grpc-timeout',
  'authorization',
  'x-request-id',
  'x-correlation-id',
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

export function GrpcRequestPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('body');
  const { request, setHeaders, setBody, setVariables } = useClient();

  const headers = request?.headers ?? [];
  const body = request?.body ?? { type: 'json' as const, content: '' };
  const variables = request?.variables ?? [];
  const grpcMethodSchema = request?.grpcMethodSchema;

  const schemaSuggestion = useMemo(() => {
    try {
      return grpcMethodSchema ? buildSchemaExample(grpcMethodSchema) : undefined;
    } catch {
      return undefined;
    }
  }, [grpcMethodSchema]);

  // Force JSON body type for gRPC
  useEffect(() => {
    if (body.type !== 'json') {
      setBody({ type: 'json', content: '' });
    }
  }, [body.type, setBody]);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'body', label: 'Message' },
    { id: 'headers', label: 'Metadata', count: headers.filter(h => h.key).length },
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
        {activeTab === 'body' && body.type === 'json' && (
          <JsonEditor
            value={body.content}
            onChange={(content) => setBody({ type: 'json', content })}
            variables={variables}
            onVariablesChange={setVariables}
            placeholder={schemaSuggestion ? JSON.stringify(schemaSuggestion, null, 2) : '{\n  "field": "value"\n}'}
            action={schemaSuggestion !== undefined ? {
              label: 'Insert schema',
              onClick: () => setBody({ type: 'json', content: JSON.stringify(schemaSuggestion, null, 2) })
            } : undefined}
          />
        )}

        {activeTab === 'headers' && (
          <div className="space-y-2">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              gRPC metadata (sent as headers)
            </p>
            <KeyValueEditor
              items={headers}
              onChange={setHeaders}
              keyPlaceholder="Key"
              valuePlaceholder="Value"
              keySuggestions={commonGrpcHeaders}
            />
          </div>
        )}
      </div>
    </div>
  );
}
