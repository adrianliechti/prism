export function getStatusBadge(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (statusCode >= 300 && statusCode < 400) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  if (statusCode >= 400 && statusCode < 500) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  if (statusCode >= 500) return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
