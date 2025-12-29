import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

interface JsonViewerProps {
  content: string;
}

export function JsonViewer({ content }: JsonViewerProps) {
  const [highlightedCode, setHighlightedCode] = useState<string>('');

  const formatJson = (str: string): string => {
    try {
      const parsed = JSON.parse(str);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return str;
    }
  };

  useEffect(() => {
    const highlight = async () => {
      try {
        const code = formatJson(content);
        const html = await codeToHtml(code, {
          lang: 'json',
          theme: 'github-dark',
        });
        setHighlightedCode(html);
      } catch {
        setHighlightedCode(`<pre>${formatJson(content)}</pre>`);
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
