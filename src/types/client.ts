// API request (stored in history for reference)
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

// API response (stored in history)
export interface ClientResponse {
  status: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  duration: number;
  error?: string;
}
