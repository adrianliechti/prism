import type { Request, KeyValuePair, HttpRequest } from '../types/types';
import { resolveVariables } from '../utils/variables.ts';
import { missingAttachment } from './requestUtils.ts';
const defaultHttpOptions: HttpRequest['options'] = { insecure: false, redirect: true, timeout: 30000 };
const PROXY_INJECTED_HEADERS = new Set(['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-expose-headers', 'x-prism-status']);

export async function executeHttp(req: Request, signal: AbortSignal, onResponse: (request: Request) => void): Promise<Request> {
    const resolve = (text: string) => resolveVariables(text, req.variables);
    const resolvedUrl = resolve(req.url);
    const httpMethod = req.http?.method ?? 'GET';

    // Ordered header list so duplicate names are preserved (like curl)
    const headerPairs: Array<[string, string]> = (req.http?.headers ?? [])
      .filter((h: KeyValuePair) => h.enabled && h.key)
      .map((h: KeyValuePair) => [resolve(h.key), resolve(h.value)]);
    const hasHeaderPair = (name: string) =>
      headerPairs.some(([key]) => key.toLowerCase() === name.toLowerCase());
    const addHeaderIfMissing = (name: string, value: string) => {
      if (!hasHeaderPair(name)) headerPairs.push([name, value]);
    };

    const queryParams = new URLSearchParams();

    for (const p of (req.http?.query ?? []).filter((p: KeyValuePair) => p.enabled && p.key)) {
      queryParams.append(resolve(p.key), resolve(p.value));
    }

    // Build body
    const httpBody = req.http?.body ?? { type: 'none' as const };
    const missing = missingAttachment(httpBody);
    if (missing) throw new Error(missing);
    let body: string | FormData | Blob | undefined;
    let bodyForHistory = '';
    let useFormData = false;

    switch (httpBody.type) {
      case 'json': {
        body = resolve(httpBody.content);
        bodyForHistory = httpBody.content;
        addHeaderIfMissing('Content-Type', 'application/json');
        break;
      }
      case 'xml': {
        body = resolve(httpBody.content);
        bodyForHistory = httpBody.content;
        addHeaderIfMissing('Content-Type', 'application/xml');
        break;
      }
      case 'form-urlencoded': {
        const formParams = new URLSearchParams();
        httpBody.data.filter(f => f.enabled && f.key).forEach(f => formParams.append(resolve(f.key), resolve(f.value)));
        body = formParams.toString();
        bodyForHistory = formParams.toString();
        addHeaderIfMissing('Content-Type', 'application/x-www-form-urlencoded');
        break;
      }
      case 'form-data': {
        const formData = new FormData();
        const formDescription: string[] = [];
        httpBody.data.filter(f => f.enabled && f.key).forEach(f => {
          if (f.type === 'file' && f.file) {
            formData.append(resolve(f.key), f.file, f.fileName);
            formDescription.push(`${f.key}: [File: ${f.fileName}]`);
          } else if (f.type === 'text') {
            formData.append(resolve(f.key), resolve(f.value));
            formDescription.push(`${f.key}: ${f.value}`);
          }
        });
        body = formData;
        bodyForHistory = formDescription.join('\n');
        useFormData = true;
        break;
      }
      case 'binary':
        if (httpBody.file) {
          body = httpBody.file;
          bodyForHistory = `[Binary file: ${httpBody.fileName}]`;
          addHeaderIfMissing('Content-Type', (httpBody.file as File).type || 'application/octet-stream');
        }
        break;
      case 'raw':
        body = resolve(httpBody.content);
        bodyForHistory = httpBody.content;
        addHeaderIfMissing('Content-Type', 'text/plain');
        break;
    }

    // Options
    const options = req.http?.options ?? defaultHttpOptions;

    // Build proxy URL
    let targetUrl: URL;
    try {
      targetUrl = new URL(resolvedUrl);
    } catch {
      throw new Error('Invalid URL. Include the scheme, e.g. https://example.com');
    }
    let proxyUrl = '/proxy/' + targetUrl.protocol.slice(0, -1) + '/' + targetUrl.host + targetUrl.pathname;
    const queryString = queryParams.toString();
    if (queryString) proxyUrl += '?' + queryString;

    const headersForHistory: Record<string, string> = {};
    for (const [key, value] of headerPairs) {
      headersForHistory[key] = headersForHistory[key] !== undefined ? `${headersForHistory[key]}, ${value}` : value;
    }

    const clientRequest: HttpRequest = {
      method: httpMethod, url: req.url, headers: headersForHistory,
      query: Object.fromEntries(queryParams), body: bodyForHistory, options,
    };

    // Every user header is smuggled as X-Prism-Header-* and unwrapped by the
    // proxy: the browser can neither drop them (fetch's forbidden-header
    // list) nor mix them up with its own automatic headers.
    const fetchHeaders = new Headers();
    for (const [key, value] of headerPairs) {
      if (useFormData && key.toLowerCase() === 'content-type') continue; // browser sets the multipart boundary
      try {
        fetchHeaders.append(`x-prism-header-${key}`, value);
      } catch (err) {
        throw new Error(`Invalid header "${key}"`, { cause: err });
      }
    }
    if (options.insecure) fetchHeaders.set('X-Prism-Insecure', 'true');
    fetchHeaders.set('X-Prism-Redirect', options.redirect ? 'true' : 'false');
    fetchHeaders.set('X-Prism-Method', httpMethod);

    const startTime = performance.now();
    const response = await fetch(proxyUrl, {
      method: 'POST', headers: fetchHeaders, body, signal, cache: 'no-store', redirect: 'error',
    });

    // The proxy masks 3xx behind X-Prism-Status ("302 Found") when redirect
    // following is off, so the browser fetch doesn't chase Location itself.
    let statusCode = response.status;
    let statusText = response.statusText;
    const masked = response.headers.get('x-prism-status');
    if (masked) {
      const space = masked.indexOf(' ');
      const code = Number(space === -1 ? masked : masked.slice(0, space));
      if (code) {
        statusCode = code;
        statusText = space === -1 ? '' : masked.slice(space + 1);
      }
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === 'x-prism-set-cookie') {
        responseHeaders['set-cookie'] = (JSON.parse(atob(value)) as string[]).join('\n');
        return;
      }
      if (lower === 'x-prism-content-length') {
        responseHeaders['content-length'] = value;
        return;
      }
      if (PROXY_INJECTED_HEADERS.has(lower)) return;
      if (lower.startsWith('x-prism-upstream-')) {
        responseHeaders[lower.slice('x-prism-upstream-'.length)] = value;
        return;
      }
      responseHeaders[key] = value;
    });

    const chunks: Uint8Array<ArrayBuffer>[] = [];
    const contentType = responseHeaders['content-type'] || 'application/octet-stream';
    const snapshot = (streaming: boolean): Request => ({
      ...req,
      executionTime: Date.now(),
      http: {
        ...req.http!,
        request: clientRequest,
        response: { status: statusText || String(statusCode), statusCode, headers: responseHeaders,
          body: new Blob(chunks, { type: contentType }), duration: Math.round(performance.now() - startTime), streaming },
      },
    });
    onResponse(snapshot(true));
    let lastUpdate = 0;
    const reader = response.body?.getReader();
    try {
      if (reader) while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
        if (performance.now() - lastUpdate > 100 || chunks.length === 1) {
          onResponse(snapshot(true));
          lastUpdate = performance.now();
        }
      }
    } catch (error) {
      onResponse(snapshot(false));
      throw error;
    } finally { reader?.releaseLock(); }
    return snapshot(false);
}
