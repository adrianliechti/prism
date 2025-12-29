import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

interface YamlViewerProps {
  content: string;
}

export function YamlViewer({ content }: YamlViewerProps) {
  const [highlightedCode, setHighlightedCode] = useState<string>('');

  useEffect(() => {
    const highlight = async () => {
      try {
        const html = await codeToHtml(content, {
          lang: 'yaml',
          theme: 'github-dark',
        });
        setHighlightedCode(html);
      } catch {
        setHighlightedCode(`<pre>${content}</pre>`);
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
