import { useEffect, useMemo } from 'react';
import { useClient } from '../../context/useClient';
import { JsonEditor } from '../JsonEditor';

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
      if (format === 'date-time') return new Date().toISOString();
      if (format === 'date') return new Date().toISOString().slice(0, 10);
      if (format === 'email') return 'user@example.com';
      if (format === 'uuid') return '00000000-0000-4000-8000-000000000000';
      return 'string';
    }
    default:
      return {};
  }
}

export function McpRequestPanel() {
  const { request, setBody, setVariables } = useClient();

  const body = request?.body ?? { type: 'json' as const, content: '' };
  const variables = request?.variables ?? [];
  const mcpFeatures = request?.mcpFeatures;
  const selectedTool = request?.mcpSelectedTool;
  const selectedResource = request?.mcpSelectedResource;

  // Force JSON body type for MCP
  useEffect(() => {
    if (body.type !== 'json') {
      setBody({ type: 'json', content: '' });
    }
  }, [body.type, setBody]);

  const selectedToolSchema = useMemo(() => {
    if (!selectedTool) return undefined;
    return mcpFeatures?.tools.find((t) => t.name === selectedTool)?.schema;
  }, [mcpFeatures?.tools, selectedTool]);

  const schemaSuggestion = useMemo(() => {
    try {
      return selectedToolSchema ? buildSchemaExample(selectedToolSchema) : undefined;
    } catch {
      return undefined;
    }
  }, [selectedToolSchema]);

  return (
    <div className="border border-neutral-200 dark:border-white/10 rounded-md bg-white/60 dark:bg-white/5 h-80">
      <div className="h-full p-3">
        {selectedTool && body.type === 'json' ? (
          <div className="h-full">
            <JsonEditor
              value={body.content}
              onChange={(content) => setBody({ type: 'json', content })}
              variables={variables}
              onVariablesChange={setVariables}
              placeholder={schemaSuggestion ? JSON.stringify(schemaSuggestion, null, 2) : '{\n  "key": "value"\n}'}
              action={schemaSuggestion !== undefined ? {
                label: 'Insert schema',
                onClick: () => setBody({ type: 'json', content: JSON.stringify(schemaSuggestion, null, 2) })
              } : undefined}
            />
          </div>
        ) : selectedResource ? (
          <div className="h-full flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-300 text-center px-4">
            Resources are read-only; no arguments required.
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400 text-center px-4">
            Select a tool or resource from the URL bar.
          </div>
        )}
      </div>
    </div>
  );
}
