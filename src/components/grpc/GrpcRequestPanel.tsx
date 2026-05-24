import { useState, useMemo } from 'react';
import { useClient } from '../../context/useClient';
import { KeyValueEditor, JsonEditor } from '../editors';
import { buildSchemaExample } from '../../utils/schemaExample';

type Tab = 'headers' | 'body';

const commonGrpcHeaders = [
  'grpc-timeout',
  'authorization',
  'x-request-id',
  'x-correlation-id',
];

export function GrpcRequestPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('body');
  const { request, setGrpcBody, setGrpcMetadata, setVariables } = useClient();

  const metadata = request?.grpc?.metadata ?? [];
  const bodyContent = request?.grpc?.body ?? '';
  const variables = request?.variables ?? [];
  const grpcMethodSchema = request?.grpc?.schema;

  const schemaSuggestion = useMemo(() => {
    try {
      return grpcMethodSchema ? buildSchemaExample(grpcMethodSchema) : undefined;
    } catch {
      return undefined;
    }
  }, [grpcMethodSchema]);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'body', label: 'Message' },
    { id: 'headers', label: 'Metadata', count: metadata.filter(h => h.key).length },
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
        {activeTab === 'body' && (
          <JsonEditor
            value={bodyContent}
            onChange={setGrpcBody}
            variables={variables}
            onVariablesChange={setVariables}
            placeholder={schemaSuggestion ? JSON.stringify(schemaSuggestion, null, 2) : '{\n  "field": "value"\n}'}
            action={schemaSuggestion !== undefined ? {
              label: 'Insert schema',
              onClick: () => setGrpcBody(JSON.stringify(schemaSuggestion, null, 2))
            } : undefined}
          />
        )}

        {activeTab === 'headers' && (
          <div className="space-y-2">
            <KeyValueEditor
              items={metadata}
              onChange={setGrpcMetadata}
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
