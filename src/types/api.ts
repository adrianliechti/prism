export interface KeyValuePair {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
}

export type BodyType = 'none' | 'json' | 'form-urlencoded' | 'form-data' | 'raw';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export interface ProxyRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface ProxyResponse {
  statusCode: number;
  status: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

// For future history feature
export interface RequestHistoryEntry {
  id: string;
  timestamp: number;
  request: {
    method: HttpMethod;
    url: string;
    headers: KeyValuePair[];
    queryParams: KeyValuePair[];
    bodyType: BodyType;
    bodyContent: string;
    formData: KeyValuePair[];
  };
  response: ProxyResponse | null;
}
