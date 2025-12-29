interface TextViewerProps {
  content: string;
}

export function TextViewer({ content }: TextViewerProps) {
  return (
    <div className="overflow-hidden">
      <pre className="overflow-auto text-xs font-mono text-gray-200 max-h-[50vh] whitespace-pre-wrap">
        {content}
      </pre>
    </div>
  );
}
