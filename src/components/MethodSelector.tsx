import { useApiClient } from '../context/ApiClientContext';
import type { HttpMethod } from '../types/api';

const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-green-600',
  POST: 'text-yellow-600',
  PUT: 'text-blue-600',
  PATCH: 'text-purple-600',
  DELETE: 'text-red-600',
  OPTIONS: 'text-gray-600',
  HEAD: 'text-gray-600',
};

export function MethodSelector() {
  const { method, setMethod } = useApiClient();

  return (
    <select
      value={method}
      onChange={(e) => setMethod(e.target.value as HttpMethod)}
      className={`px-3 py-2 bg-gray-100 border border-gray-300 rounded-l-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${methodColors[method]}`}
    >
      {methods.map((m) => (
        <option key={m} value={m} className={methodColors[m]}>
          {m}
        </option>
      ))}
    </select>
  );
}
