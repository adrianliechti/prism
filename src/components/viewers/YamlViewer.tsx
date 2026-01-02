import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

interface YamlViewerProps {
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

export function YamlViewer({ content }: YamlViewerProps) {
  const [highlightedCode, setHighlightedCode] = useState<string>('');
  const prefersDark = usePrefersDarkMode();

  useEffect(() => {
    const highlight = async () => {
      try {
        const text = await content.text();
        const html = await codeToHtml(text, {
          lang: 'yaml',
          theme: prefersDark ? 'github-dark' : 'github-light',
        });
        setHighlightedCode(html);
      } catch {
        const text = await content.text();
        setHighlightedCode(`<pre>${text}</pre>`);
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
