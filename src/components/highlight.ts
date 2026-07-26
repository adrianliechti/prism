import { createHighlighter } from '@tanstack/highlight/core';
import { html } from '@tanstack/highlight/languages/html';
import { http } from '@tanstack/highlight/languages/http';
import { json } from '@tanstack/highlight/languages/json';
import { shell } from '@tanstack/highlight/languages/shell';
import { yaml } from '@tanstack/highlight/languages/yaml';
import { createTanStackMarkdownHighlighter } from '@tanstack/highlight/markdown';
import { createThemeBaseCss, createThemeRule } from '@tanstack/highlight/theme';
import { githubDarkTheme } from '@tanstack/highlight/themes/github-dark';
import { githubLightTheme } from '@tanstack/highlight/themes/github-light';

export const highlighter = createHighlighter({
  languages: [html, http, json, shell, yaml],
});

export const highlightMarkdownCode = createTanStackMarkdownHighlighter(highlighter);

// Response viewers follow the app color scheme via CSS variables, while
// markdown chat code blocks keep the always-dark styling of the chat design.
const themeCss = [
  createThemeRule(':root', githubLightTheme),
  `@media (prefers-color-scheme: dark) {\n${createThemeRule(':root', githubDarkTheme)}\n}`,
  createThemeRule('pre.tm-code', githubDarkTheme),
  createThemeBaseCss({ codeBlockSelector: 'pre.tm-code, pre.th-code' }),
].join('\n\n');

const style = document.createElement('style');
style.textContent = themeCss;
document.head.appendChild(style);
