export interface KeyValuePair {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
}

export type BodyType = 'none' | 'json' | 'form-urlencoded' | 'form-data' | 'raw';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

// API request (sent to backend)
export interface ApiRequest {
  method: string;
  url: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
  options: {
    insecure: boolean;
    redirect: boolean;
  };
}

// API response (from backend)
export interface ApiResponse {
  status: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

// Request tab state (UI)
export interface RequestTab {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: KeyValuePair[];
  query: KeyValuePair[];
  bodyType: BodyType;
  bodyContent: string;
  formData: KeyValuePair[];
  insecure: boolean;
  redirect: boolean;
  response: ApiResponse | null;
  isLoading: boolean;
  error: string | null;
}

// History entry
export interface HistoryEntry {
  id: string;
  timestamp: number;
  method: HttpMethod;
  url: string;
  statusCode: number | null;
  duration: number | null;
  request: Pick<RequestTab, 'headers' | 'query' | 'bodyType' | 'bodyContent' | 'formData' | 'insecure' | 'redirect'>;
  response: ApiResponse | null;
}
