import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

interface JSONViewerProps {
  content: string;
}

export function JSONViewer({ content }: JSONViewerProps) {
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
    <div className="overflow-hidden">
      <div 
        className="overflow-auto text-xs max-h-[50vh] [&_pre]:bg-transparent! [&_pre]:p-0! [&_pre]:m-0! [&_code]:bg-transparent!"
        dangerouslySetInnerHTML={{ __html: highlightedCode }}
      />
    </div>
  );
}
