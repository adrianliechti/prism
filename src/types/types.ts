import type { ClientRequest, ClientResponse } from './client';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

// Variable types for dynamic content in JSON bodies
export type VariableType = 'file_base64' | 'file_dataurl' | 'base64' | 'timestamp' | 'uuid' | 'random_string';

export interface Variable {
  id: string;
  type: VariableType;
  // Display name (e.g., filename for files, or label for other types)
  name: string;
  // For file_base64/file_dataurl/base64: base64-encoded content
  data?: string;
  // MIME type for file variables
  mimeType?: string;
}

export type RequestBody =
  | { type: 'none' }
  | { type: 'json'; content: string }
  | { type: 'form-urlencoded'; data: KeyValuePair[] }
  | { type: 'form-data'; data: FormDataField[] }
  | { type: 'raw'; content: string }
  | { type: 'binary'; file: File | null; fileName: string };

export interface KeyValuePair {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
}

export interface FormDataField {
  id: string;
  enabled: boolean;
  key: string;
  type: 'text' | 'file';
  value: string; // for text fields
  file: File | null; // for file fields
  fileName: string; // display name for file
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
  variables: Variable[];
  creationTime: number;
  executionTime: number | null;
  httpRequest: ClientRequest | null;
  httpResponse: ClientResponse | null;
  executing: boolean;
}
