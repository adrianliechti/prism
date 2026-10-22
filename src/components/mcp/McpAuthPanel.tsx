import { useEffect, useState } from 'react';
import { useClient } from '../../context/useClient';
import { mcpAuth, type McpAuthStatus } from '../../lib/mcpAuth';
import { kvToRecord } from '../../utils/format';
import { resolveVariables } from '../../utils/variables';
import { noAutoCorrectProps } from '../../utils/inputProps';
import { ExternalLink, RefreshCw, Shield, ShieldCheck } from 'lucide-react';

const inputClass = 'w-full px-2 py-1 bg-white dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded text-xs text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors';
const buttonClass = 'text-[11px] px-2 py-0.5 rounded bg-neutral-200 hover:bg-neutral-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-neutral-700 dark:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const statusLabels: Record<McpAuthStatus['status'], string> = {
  none: 'Not authorized',
  pending: 'Waiting for you to approve access in the browser…',
  authorized: 'Authorized',
  not_required: 'This server did not ask for authorization',
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

export function McpAuthPanel() {
  const { request, setMcpOAuth } = useClient();
  const [status, setStatus] = useState<McpAuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const url = request?.url ?? '';
  const oauth = request?.mcp?.oauth ?? {};
  const pending = status?.status === 'pending';

  // Re-check once the URL settles, and poll while the browser flow is pending
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const load = () => mcpAuth('GET', url, undefined, controller.signal).then(
      next => { setStatus(next); setError(null); },
      err => { if (!controller.signal.aborted) setError(errorMessage(err)); },
    );
    const timer = pending ? window.setInterval(load, 1500) : window.setTimeout(load, 400);
    return () => {
      if (pending) window.clearInterval(timer);
      else window.clearTimeout(timer);
      controller.abort();
    };
  }, [url, pending]);

  const authorize = async () => {
    setBusy(true);
    setError(null);
    try {
      const headers = kvToRecord(request.mcp?.headers ?? [], v => resolveVariables(v, request.variables));
      const next = await mcpAuth('POST', url, { headers, clientId: oauth.clientId || undefined, clientSecret: oauth.clientSecret || undefined });
      setStatus(next);
      // The desktop app opens this in the system browser; the link below covers blocked popups
      if (next.authorizationUrl) window.open(next.authorizationUrl, '_blank', 'noopener');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await mcpAuth('DELETE', url));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!url) {
    return (
      <div className="py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">
        Enter an MCP server URL to authorize.
      </div>
    );
  }

  const shownError = error ?? status?.error;

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-2 px-1.5">
        {pending ? (
          <RefreshCw className="w-3.5 h-3.5 shrink-0 text-violet-500 animate-spin" />
        ) : status?.status === 'authorized' ? (
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
        ) : (
          <Shield className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
        )}
        <span className="text-neutral-700 dark:text-neutral-300">{status ? statusLabels[status.status] : 'Checking…'}</span>
        {pending && status?.authorizationUrl && (
          <a href={status.authorizationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 hover:underline">
            Open page <ExternalLink className="w-3 h-3" />
          </a>
        )}
        <div className="flex-1" />
        <button type="button" onClick={authorize} disabled={busy} className={buttonClass}>
          {status?.status === 'authorized' || pending ? 'Authorize again' : 'Authorize'}
        </button>
        {status?.status === 'authorized' && (
          <button type="button" onClick={signOut} disabled={busy} className={buttonClass}>
            Sign out
          </button>
        )}
      </div>

      {shownError && (
        <div className="px-1.5 text-red-500 dark:text-red-400 break-words">{shownError}</div>
      )}

      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 px-1.5">
        <label htmlFor="mcp-oauth-client-id" className="text-neutral-500 dark:text-neutral-400">Client ID</label>
        <input
          id="mcp-oauth-client-id"
          {...noAutoCorrectProps}
          value={oauth.clientId ?? ''}
          onChange={(e) => setMcpOAuth({ ...oauth, clientId: e.target.value })}
          placeholder="Optional; leave empty to register Prism automatically"
          className={inputClass}
        />
        <label htmlFor="mcp-oauth-client-secret" className="text-neutral-500 dark:text-neutral-400">Client secret</label>
        <input
          id="mcp-oauth-client-secret"
          type="password"
          value={oauth.clientSecret ?? ''}
          onChange={(e) => setMcpOAuth({ ...oauth, clientSecret: e.target.value })}
          placeholder="Optional; only for confidential clients"
          className={inputClass}
        />
        <span className="text-neutral-500 dark:text-neutral-400">Redirect URI</span>
        <code className="px-2 py-1 text-neutral-600 dark:text-neutral-300 select-all">{status?.redirectUrl ?? ''}</code>
      </div>
    </div>
  );
}
