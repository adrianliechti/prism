import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

interface JsonViewerProps {
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

export function JsonViewer({ content }: JsonViewerProps) {
  const [highlightedCode, setHighlightedCode] = useState<string>('');
  const prefersDark = usePrefersDarkMode();

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
        const text = await content.text();
        const code = formatJson(text);
        const html = await codeToHtml(code, {
          lang: 'json',
          theme: prefersDark ? 'github-dark' : 'github-light',
        });
        setHighlightedCode(html);
      } catch {
        const text = await content.text();
        setHighlightedCode(`<pre>${formatJson(text)}</pre>`);
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
