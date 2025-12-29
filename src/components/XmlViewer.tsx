import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

interface XmlViewerProps {
  content: string;
}

export function XmlViewer({ content }: XmlViewerProps) {
  const [highlightedCode, setHighlightedCode] = useState<string>('');

  const formatXml = (xml: string): string => {
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
  };

  useEffect(() => {
    const highlight = async () => {
      try {
        const code = formatXml(content);
        const html = await codeToHtml(code, {
          lang: 'xml',
          theme: 'github-dark',
        });
        setHighlightedCode(html);
      } catch {
        setHighlightedCode(`<pre>${formatXml(content)}</pre>`);
      }
    };
    highlight();
  }, [content]);

  return (
    <div 
      className="text-xs [&_pre]:bg-transparent! [&_pre]:p-0! [&_pre]:m-0! [&_pre]:overflow-visible! [&_code]:bg-transparent! [&_code]:block!"
      dangerouslySetInnerHTML={{ __html: highlightedCode }}
    />
  );
}
