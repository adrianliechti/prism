import { useEffect, useState } from 'react';
import { useHighlighter, highlightedCodeClasses } from './useHighlighter';
import { decodeBlobText } from '../../utils/format';

interface JsonViewerProps {
  content: Blob;
}

function formatJson(str: string): string {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}

export function JsonViewer({ content }: JsonViewerProps) {
  const [code, setCode] = useState('');

  useEffect(() => {
    let cancelled = false;
    decodeBlobText(content).then((text) => {
      if (!cancelled) setCode(formatJson(text));
    });
    return () => { cancelled = true; };
  }, [content]);

  const highlightedHtml = useHighlighter(code, 'json');

  return (
    <div 
      className={highlightedCodeClasses}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
    />
  );
}
