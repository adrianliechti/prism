import { useMemo } from 'react';
import { highlighter } from '../highlight';

export type HighlightLanguage = 'json' | 'xml' | 'yaml' | 'text';

// TanStack Highlight ships no dedicated XML grammar; the HTML tokenizer
// handles generic XML markup.
const languageMap: Record<HighlightLanguage, string> = {
  json: 'json',
  xml: 'html',
  yaml: 'yaml',
  text: 'plaintext',
};

export function useHighlighter(code: string, language: HighlightLanguage) {
  return useMemo(() => {
    if (!code) return '';
    return highlighter.highlight(code, { lang: languageMap[language] }).html;
  }, [code, language]);
}

// Shared CSS classes for highlighted code containers
export const highlightedCodeClasses =
  'text-xs [&_pre]:bg-transparent! [&_pre]:p-0! [&_pre]:m-0! [&_pre]:overflow-visible! [&_code]:bg-transparent! [&_code]:block!';
