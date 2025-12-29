interface BinaryViewerProps {
  content: string;
}

export function BinaryViewer({ content }: BinaryViewerProps) {
  const size = new Blob([content]).size;
  
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="flex flex-col items-center justify-center p-12 bg-neutral-100 dark:bg-white/5 rounded-lg border border-neutral-200 dark:border-white/10">
      <div className="text-center space-y-2">
        <div className="text-neutral-500 dark:text-neutral-400 text-sm">Binary content</div>
        <div className="text-2xl font-semibold text-neutral-700 dark:text-neutral-200">{formatBytes(size)}</div>
        <div className="text-xs text-neutral-400 dark:text-neutral-500">Cannot preview binary data</div>
      </div>
    </div>
  );
}
