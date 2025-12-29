interface TextViewerProps {
  content: string;
}

export function TextViewer({ content }: TextViewerProps) {
  return (
    <pre className="text-xs font-mono text-gray-200 whitespace-pre-wrap">
      {content}
    </pre>
  );
}
