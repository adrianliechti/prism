import type { ClientRequest, ClientResponse } from './client';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export type RequestBody =
  | { type: 'none' }
  | { type: 'json'; content: string }
  | { type: 'form-urlencoded'; data: KeyValuePair[] }
  | { type: 'form-data'; data: KeyValuePair[] }
  | { type: 'raw'; content: string };

export interface KeyValuePair {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
}

// Request data (editable) with execution state
export interface Request {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  query: KeyValuePair[];
  headers: KeyValuePair[];
  body: RequestBody;
  creationTime: number;
  executionTime: number | null;
  httpRequest: ClientRequest | null;
  httpResponse: ClientResponse | null;
  executing: boolean;
}
