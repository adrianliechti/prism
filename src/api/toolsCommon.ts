// Shared utilities for protocol-specific tools
import { z } from 'zod';

export const MAX_BODY_SIZE = 10 * 1024; // 10KB

// Format JSON string with pretty printing
export function formatJson(str: string): string {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
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
  items: z.string().describe('JSON array of objects with "key", "value", and optional "enabled" (default true) properties. Example: [{"key": "Content-Type", "value": "application/json"}]'),
});

// Adapter config type
export interface AdapterConfig {
  id: string;
  name: string;
  placeholder: string;
}
