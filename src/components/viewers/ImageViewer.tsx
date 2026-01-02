import { useMemo } from 'react';

interface ImageViewerProps {
  content: Blob;
}

export function ImageViewer({ content }: ImageViewerProps) {
  // Create object URL from Blob
  const dataUrl = useMemo(() => URL.createObjectURL(content), [content]);

  return (
    <div className="h-full">
      <img
        src={dataUrl}
        alt="Response"
        className="max-w-full max-h-full object-contain"
      />
    </div>
  );
}
