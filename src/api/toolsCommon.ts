// Shared utilities for protocol-specific tools
import { z } from 'zod';
import type { KeyValuePair } from '../types/types';
import { generateId } from '../lib/data';

export const MAX_BODY_SIZE = 10 * 1024; // 10KB

// Pretty-print a JSON string; returns null if the string is not valid JSON
export function tryFormatJson(str: string): string | null {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return null;
  }
}

// Truncate body content if too large
export function truncateBody(body: string | undefined | null): string {
  if (!body) return '(empty)';
  if (body.length <= MAX_BODY_SIZE) return body;
  return body.slice(0, MAX_BODY_SIZE) + '\n...[TRUNCATED]';
}

// Common Zod schemas
export const emptySchema = z.object({});

export const setUrlSchema = z.object({
  url: z.string().describe('The full URL for the request'),
});

export const keyValueArraySchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
        enabled: z.boolean().optional().describe('Whether the entry is active (default: true)'),
      }),
    )
    .describe('The key/value entries. Example: [{"key": "Content-Type", "value": "application/json"}]'),
});

export type KeyValueItems = z.infer<typeof keyValueArraySchema>['items'];

export function toKeyValuePairs(items: KeyValueItems): KeyValuePair[] {
  return items.map((item) => ({
    id: generateId(),
    key: item.key,
    value: item.value,
    enabled: item.enabled !== false,
  }));
}

// Adapter config type
export interface AdapterConfig {
  id: string;
  name: string;
  placeholder: string;
}
