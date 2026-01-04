import { useRef } from 'react';
import { Upload, FileText, X } from 'lucide-react';

interface BinaryUploaderProps {
  file: File | null;
  fileName: string;
  onFileChange: (file: File | null, fileName: string) => void;
}

export function BinaryUploader({ file, fileName, onFileChange }: BinaryUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File | null) => {
    onFileChange(selectedFile, selectedFile?.name ?? '');
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const getFileTypeIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('gzip')) return '📦';
    if (mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('text')) return '📝';
    return '📎';
  };

  return (
    <div className="space-y-3">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
        className="hidden"
      />

      {!file ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-neutral-300 dark:border-white/20 rounded-lg cursor-pointer hover:border-neutral-400 dark:hover:border-white/30 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors"
        >
          <Upload className="w-8 h-8 text-neutral-400 dark:text-neutral-500 mb-2" />
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-1">
            Click to select a file
          </p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            or drag and drop
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 bg-neutral-100 dark:bg-white/5 rounded-lg border border-neutral-200 dark:border-white/10">
          <div className="flex items-center justify-center w-10 h-10 bg-white dark:bg-white/10 rounded-lg text-xl">
            {getFileTypeIcon(file.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">
                {fileName}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {formatFileSize(file.size)}
              </span>
              <span className="text-xs text-neutral-400 dark:text-neutral-500">•</span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                {file.type || 'application/octet-stream'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2 py-1 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-white/10 rounded transition-colors"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => onFileChange(null, '')}
              className="p-1 text-neutral-400 dark:text-neutral-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-neutral-200 dark:hover:bg-white/10 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        The file will be sent as the raw request body. Content-Type will be set automatically based on the file type.
      </p>
    </div>
  );
}
