import type { Variable } from '../types/types';

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

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

  return content.replace(/\{\{(\w+):([^}]+)\}\}/g, (fullMatch, varType, varId) => {
    const variable = variables.find(v => v.type === varType && v.id === varId);

    switch (varType) {
      case 'file_base64':
        return variable?.data || missingDataPlaceholder;
      case 'base64':
        // Encode the text to base64 (UTF-8 safe; btoa alone throws on non-Latin1)
        return variable?.data ? encodeBase64(variable.data) : missingDataPlaceholder;
      case 'file_dataurl':
        if (variable?.data && variable?.mimeType) {
          return `data:${variable.mimeType};base64,${variable.data}`;
        }
        if (variable?.data) {
          return `data:application/octet-stream;base64,${variable.data}`;
        }
        return missingDataPlaceholder;
      case 'timestamp':
        return String(Date.now());
      case 'uuid':
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          return crypto.randomUUID();
        }
        // Fallback for environments without crypto.randomUUID
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
      case 'random_string':
        return Math.random().toString(36).substring(2, 18);
      default:
        return fullMatch;
    }
  });
}
