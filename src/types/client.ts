// API request (sent to backend)
export interface ClientRequest {
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
export interface ClientResponse {
  status: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  duration: number;
  error?: string;
}
