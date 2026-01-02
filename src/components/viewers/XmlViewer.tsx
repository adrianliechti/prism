import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

interface XmlViewerProps {
  content: Blob;
}

function usePrefersDarkMode() {
  const [prefersDark, setPrefersDark] = useState(() => 
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersDark;
}

export function XmlViewer({ content }: XmlViewerProps) {
  const [highlightedCode, setHighlightedCode] = useState<string>('');
  const prefersDark = usePrefersDarkMode();

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
        const text = await content.text();
        const code = formatXml(text);
        const html = await codeToHtml(code, {
          lang: 'xml',
          theme: prefersDark ? 'github-dark' : 'github-light',
        });
        setHighlightedCode(html);
      } catch {
        const text = await content.text();
        setHighlightedCode(`<pre>${formatXml(text)}</pre>`);
      }
    };
    highlight();
  }, [content, prefersDark]);

  return (
    <div 
      className="text-xs [&_pre]:bg-transparent! [&_pre]:p-0! [&_pre]:m-0! [&_pre]:overflow-visible! [&_code]:bg-transparent! [&_code]:block!"
      dangerouslySetInnerHTML={{ __html: highlightedCode }}
    />
  );
}
