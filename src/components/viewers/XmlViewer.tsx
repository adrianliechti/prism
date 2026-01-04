import { useEffect, useState } from 'react';
import { useHighlighter, highlightedCodeClasses } from './useHighlighter';

interface XmlViewerProps {
  content: Blob;
}

function formatXml(xml: string): string {
  try {
    const PADDING = '  ';
    const reg = /(>)(<)(\/*)/g;
    const formatted = xml.replace(reg, '$1\n$2$3');
    let pad = 0;
    
    return formatted.split('\n').map((node) => {
      let indent = 0;
      if (node.match(/.+<\/\w[^>]*>$/)) {
        indent = 0;
      } else if (node.match(/^<\/\w/) && pad > 0) {
        pad -= 1;
      } else if (node.match(/^<\w[^>]*[^/]>.*$/)) {
        indent = 1;
      } else {
        indent = 0;
      }
      
      const padding = PADDING.repeat(pad);
      pad += indent;
      
      return padding + node;
    }).join('\n');
  } catch {
    return xml;
  }
}

export function XmlViewer({ content }: XmlViewerProps) {
  const [code, setCode] = useState('');

  useEffect(() => {
    let cancelled = false;
    content.text().then((text) => {
      if (!cancelled) setCode(formatXml(text));
    });
    return () => { cancelled = true; };
  }, [content]);

  const highlightedHtml = useHighlighter(code, 'xml');

  return (
    <div 
      className={highlightedCodeClasses}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
    />
  );
}
