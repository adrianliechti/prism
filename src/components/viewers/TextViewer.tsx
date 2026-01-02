import { useState, useEffect } from 'react';

interface TextViewerProps {
  content: Blob;
}

export function TextViewer({ content }: TextViewerProps) {
  const [text, setText] = useState<string>('');

  useEffect(() => {
    content.text().then(setText);
  }, [content]);

  return (
    <pre className="text-xs font-mono text-neutral-700 dark:text-neutral-200 whitespace-pre-wrap">
      {text}
    </pre>
  );
}
