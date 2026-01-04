import type { McpCallToolResponse, McpReadResourceResponse, McpContent, McpResourceContent } from '../types/types';

interface McpResultViewerProps {
  toolResponse?: McpCallToolResponse;
  resourceResponse?: McpReadResourceResponse;
}

function ContentBlock({ content }: { content: McpContent }) {
  if (content.type === 'text') {
    return (
      <div className="bg-neutral-50 dark:bg-black/20 rounded p-3">
        <pre className="text-sm whitespace-pre-wrap break-words font-mono">
          {content.text}
        </pre>
      </div>
    );
  }

  if (content.type === 'image' && content.data) {
    const src = content.data.startsWith('data:') 
      ? content.data 
      : `data:${content.mimeType || 'image/png'};base64,${content.data}`;
    return (
      <div className="bg-neutral-50 dark:bg-black/20 rounded p-3">
        <img 
          src={src} 
          alt="MCP Image Response" 
          className="max-w-full h-auto rounded"
        />
      </div>
    );
  }

  if (content.type === 'audio' && content.data) {
    const src = content.data.startsWith('data:')
      ? content.data
      : `data:${content.mimeType || 'audio/wav'};base64,${content.data}`;
    return (
      <div className="bg-neutral-50 dark:bg-black/20 rounded p-3">
        <audio controls className="w-full">
          <source src={src} type={content.mimeType || 'audio/wav'} />
          Your browser does not support the audio element.
        </audio>
      </div>
    );
  }

  return (
    <div className="bg-neutral-50 dark:bg-black/20 rounded p-3 text-sm text-neutral-500">
      Unknown content type: {content.type}
    </div>
  );
}

function ResourceContentBlock({ content }: { content: McpResourceContent }) {
  if (content.text) {
    // Try to detect if it's JSON
    let displayContent = content.text;
    try {
      const parsed = JSON.parse(content.text);
      displayContent = JSON.stringify(parsed, null, 2);
    } catch {
      // Not JSON, display as-is
    }

    return (
      <div className="bg-neutral-50 dark:bg-black/20 rounded p-3">
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
          {content.uri}
          {content.mimeType && <span className="ml-2">({content.mimeType})</span>}
        </div>
        <pre className="text-sm whitespace-pre-wrap break-words font-mono overflow-auto max-h-96">
          {displayContent}
        </pre>
      </div>
    );
  }

  if (content.blob) {
    const mimeType = content.mimeType || 'application/octet-stream';
    
    // Handle images
    if (mimeType.startsWith('image/')) {
      const src = `data:${mimeType};base64,${content.blob}`;
      return (
        <div className="bg-neutral-50 dark:bg-black/20 rounded p-3">
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            {content.uri} ({mimeType})
          </div>
          <img 
            src={src} 
            alt={content.uri} 
            className="max-w-full h-auto rounded"
          />
        </div>
      );
    }

    // Handle audio
    if (mimeType.startsWith('audio/')) {
      const src = `data:${mimeType};base64,${content.blob}`;
      return (
        <div className="bg-neutral-50 dark:bg-black/20 rounded p-3">
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            {content.uri} ({mimeType})
          </div>
          <audio controls className="w-full">
            <source src={src} type={mimeType} />
          </audio>
        </div>
      );
    }

    // Generic binary
    return (
      <div className="bg-neutral-50 dark:bg-black/20 rounded p-3">
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
          {content.uri} ({mimeType})
        </div>
        <div className="text-sm text-neutral-600 dark:text-neutral-300">
          Binary content ({Math.round(content.blob.length * 0.75)} bytes)
        </div>
      </div>
    );
  }

  return (
    <div className="bg-neutral-50 dark:bg-black/20 rounded p-3 text-sm text-neutral-500">
      Empty resource: {content.uri}
    </div>
  );
}

export function McpResultViewer({ toolResponse, resourceResponse }: McpResultViewerProps) {
  if (toolResponse) {
    return (
      <div className="space-y-3">
        {toolResponse.isError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-red-700 dark:text-red-400 text-sm">
            Tool returned an error
          </div>
        )}
        {toolResponse.content.map((content, index) => (
          <ContentBlock key={index} content={content} />
        ))}
        {toolResponse.content.length === 0 && (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            No content returned
          </div>
        )}
      </div>
    );
  }

  if (resourceResponse) {
    return (
      <div className="space-y-3">
        {resourceResponse.contents.map((content, index) => (
          <ResourceContentBlock key={index} content={content} />
        ))}
        {resourceResponse.contents.length === 0 && (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            No content returned
          </div>
        )}
      </div>
    );
  }

  return null;
}
