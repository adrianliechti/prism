import { useClient } from '../../context/useClient';
import { JsonEditor } from '../JsonEditor';

export function McpRequestPanel() {
  const { request, setMcpTool, setVariables } = useClient();

  const variables = request?.variables ?? [];
  const toolArgs = request?.mcp?.tool?.arguments ?? '{}';
  const selectedTool = request?.mcp?.tool;
  const selectedResource = request?.mcp?.resource;

  return (
    <div className="border border-neutral-200 dark:border-white/10 rounded-md bg-white/60 dark:bg-white/5 h-80">
      <div className="h-full p-3">
        {selectedTool ? (
          <div className="h-full">
            <JsonEditor
              value={toolArgs}
              onChange={(content) => setMcpTool({ name: selectedTool.name, arguments: content })}
              variables={variables}
              onVariablesChange={setVariables}
              placeholder={'{\n  "key": "value"\n}'}
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
