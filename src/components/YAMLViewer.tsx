import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

interface YAMLViewerProps {
  content: string;
}

export function YAMLViewer({ content }: YAMLViewerProps) {
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
    <div className="overflow-hidden">
      <div 
        className="overflow-auto text-xs max-h-[50vh] [&_pre]:bg-transparent! [&_pre]:p-0! [&_pre]:m-0! [&_code]:bg-transparent!"
        dangerouslySetInnerHTML={{ __html: highlightedCode }}
      />
    </div>
  );
}
