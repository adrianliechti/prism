// macOS applies system text substitution (smart quotes/dashes, autocorrect)
// inside editable web content — Safari always did, Firefox since version 133.
// Spread onto inputs/textareas/contenteditables holding technical text.
export const noAutoCorrectProps = {
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
} as const;
