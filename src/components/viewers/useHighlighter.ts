import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

export function usePrefersDarkMode() {
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

export type HighlightLanguage = 'json' | 'xml' | 'yaml' | 'text';

export function useHighlighter(code: string, language: HighlightLanguage) {
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const prefersDark = usePrefersDarkMode();

  useEffect(() => {
    let cancelled = false;

    const highlight = async () => {
      if (!code) {
        if (!cancelled) setHighlightedHtml('');
        return;
      }

      try {
        if (language === 'text') {
          // Plain text - just escape HTML and wrap in pre
          const escaped = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          if (!cancelled) setHighlightedHtml(`<pre><code>${escaped}</code></pre>`);
          return;
        }

        const html = await codeToHtml(code, {
          lang: language,
          theme: prefersDark ? 'github-dark' : 'github-light',
        });
        if (!cancelled) setHighlightedHtml(html);
      } catch {
        // Fallback to plain text on error
        const escaped = code
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        if (!cancelled) setHighlightedHtml(`<pre><code>${escaped}</code></pre>`);
      }
    };

    highlight();

    return () => {
      cancelled = true;
    };
  }, [code, language, prefersDark]);

  return highlightedHtml;
}

// Shared CSS classes for highlighted code containers
export const highlightedCodeClasses = 
  'text-xs [&_pre]:bg-transparent! [&_pre]:p-0! [&_pre]:m-0! [&_pre]:overflow-visible! [&_code]:bg-transparent! [&_code]:block!';
