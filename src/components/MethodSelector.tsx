import { useClient } from '../context/useClient';
import type { HttpMethod } from '../types/types';

const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-emerald-600 dark:text-emerald-400',
  POST: 'text-amber-600 dark:text-amber-400',
  PUT: 'text-blue-600 dark:text-blue-400',
  PATCH: 'text-purple-600 dark:text-purple-400',
  DELETE: 'text-rose-600 dark:text-rose-400',
  OPTIONS: 'text-neutral-500 dark:text-neutral-400',
  HEAD: 'text-neutral-500 dark:text-neutral-400',
};

export function MethodSelector() {
  const { request, setMethod } = useClient();
  const method = request?.method ?? 'GET';

  return (
    <select
      value={method}
      onChange={(e) => setMethod(e.target.value as HttpMethod)}
      className={`px-2 py-1 bg-transparent font-semibold text-xs focus:outline-none cursor-pointer ${methodColors[method]}`}
    >
      {methods.map((m) => (
        <option key={m} value={m} className="bg-white dark:bg-[#1a1a1a]">
          {m}
        </option>
      ))}
    </select>
  );
}
