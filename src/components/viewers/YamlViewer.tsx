import { useEffect, useState } from 'react';
import { useHighlighter, highlightedCodeClasses } from './useHighlighter';
import { decodeBlobText } from '../../utils/format';

interface YamlViewerProps {
  content: Blob;
}

export function YamlViewer({ content }: YamlViewerProps) {
  const [code, setCode] = useState('');

  useEffect(() => {
    let cancelled = false;
    decodeBlobText(content).then((text) => {
      if (!cancelled) setCode(text);
    });
    return () => { cancelled = true; };
  }, [content]);

  const highlightedHtml = useHighlighter(code, 'yaml');

  return (
    <div 
      className={highlightedCodeClasses}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
    />
  );
}
