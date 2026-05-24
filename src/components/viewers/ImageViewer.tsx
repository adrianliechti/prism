import { useEffect, useMemo } from 'react';

interface ImageViewerProps {
  content: Blob;
}

export function ImageViewer({ content }: ImageViewerProps) {
  const dataUrl = useMemo(() => URL.createObjectURL(content), [content]);

  useEffect(() => {
    return () => URL.revokeObjectURL(dataUrl);
  }, [dataUrl]);

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
