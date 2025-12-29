interface TextViewerProps {
  content: string;
}

export function TextViewer({ content }: TextViewerProps) {
  return (
    <pre className="text-xs font-mono text-neutral-700 dark:text-neutral-200 whitespace-pre-wrap">
      {content}
    </pre>
  );
}
