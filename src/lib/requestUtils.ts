import type { KeyValuePair, Request, RequestBody } from '../types/types';

export function queryFromUrl(url: string, previous: KeyValuePair[] = []): KeyValuePair[] {
  const question = url.split('#')[0].indexOf('?');
  const search = question < 0 ? '' : url.split('#')[0].slice(question + 1);
  const unused = [...previous];
  const pairs = Array.from(new URLSearchParams(search), ([key, value]) => {
    const index = unused.findIndex(p => p.enabled && p.key === key && p.value === value);
    const old = index < 0 ? undefined : unused.splice(index, 1)[0];
    return { id: old?.id ?? crypto.randomUUID(), enabled: true, key, value };
  });
  return [...pairs, ...unused.filter(p => !p.enabled), { id: crypto.randomUUID(), enabled: true, key: '', value: '' }];
}

export function urlWithQuery(url: string, pairs: KeyValuePair[]): string {
  const hashIndex = url.indexOf('#');
  const hash = hashIndex < 0 ? '' : url.slice(hashIndex);
  const base = (hashIndex < 0 ? url : url.slice(0, hashIndex)).split('?')[0];
  const params = new URLSearchParams();
  for (const pair of pairs) if (pair.enabled && pair.key) params.append(pair.key, pair.value);
  // Keep variable markers editable and resolvable before URL encoding at send.
  const query = params.toString().replace(/%7B%7B(.*?)%7D%7D/gi, match => decodeURIComponent(match));
  return base + (query ? '?' + query : '') + hash;
}

export function normalizeRequest(req: Request): Request {
  if (!req.http || req.http.queryInUrl) return req;
  // Legacy requests stored URL parameters separately from table parameters.
  const query = [...queryFromUrl(req.url).filter(p => p.key), ...req.http.query];
  return { ...req, url: urlWithQuery(req.url, query), http: { ...req.http, query, queryInUrl: true } };
}

export function missingAttachment(body: RequestBody): string | undefined {
  if (body.type === 'binary' && !body.file) return body.fileName ? `Reattach ${body.fileName} before sending.` : 'Select a file before sending.';
  if (body.type === 'form-data') {
    const missing = body.data.find(f => f.enabled && f.key && f.type === 'file' && !f.file);
    if (missing) return `Reattach ${missing.fileName || missing.key} before sending.`;
  }
}

export function requestLabel(req: Request): string {
  if (req.name && req.name !== 'New Request') return req.name;
  if (!req.url) return 'Untitled request';
  try { const url = new URL(req.url); return url.pathname === '/' ? url.host : url.pathname; }
  catch { return req.url; }
}
