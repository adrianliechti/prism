import type { Variable } from '../types/types';

export interface ResolveOptions {
  /** Placeholder text for missing data (default: empty string) */
  missingDataPlaceholder?: string;
}

/**
 * Resolve variable markers in a string with their actual values.
 * Markers are in the format {{type:id}}
 */
export function resolveVariables(
  content: string,
  variables: Variable[],
  options: ResolveOptions = {}
): string {
  const { missingDataPlaceholder = '' } = options;

  let resolved = content;
  const variableRegex = /\{\{(\w+):([^}]+)\}\}/g;
  let match;

  while ((match = variableRegex.exec(content)) !== null) {
    const [fullMatch, varType, varId] = match;
    const variable = variables.find(v => v.type === varType && v.id === varId);
    let replacement = '';

    switch (varType) {
      case 'file_base64':
        replacement = variable?.data || missingDataPlaceholder;
        break;
      case 'base64':
        // Encode the text to base64
        if (variable?.data) {
          replacement = btoa(variable.data);
        } else {
          replacement = missingDataPlaceholder;
        }
        break;
      case 'file_dataurl':
        if (variable?.data && variable?.mimeType) {
          replacement = `data:${variable.mimeType};base64,${variable.data}`;
        } else if (variable?.data) {
          replacement = `data:application/octet-stream;base64,${variable.data}`;
        } else {
          replacement = missingDataPlaceholder;
        }
        break;
      case 'timestamp':
        replacement = String(Date.now());
        break;
      case 'uuid':
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          replacement = crypto.randomUUID();
        } else {
          // Fallback for environments without crypto.randomUUID
          replacement = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          });
        }
        break;
      case 'random_string':
        replacement = Math.random().toString(36).substring(2, 18);
        break;
      default:
        replacement = fullMatch;
    }

    resolved = resolved.replace(fullMatch, replacement);
  }

  return resolved;
}
