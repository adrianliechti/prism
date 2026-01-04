import { AlertCircle, FileText, Image, Music, Link2, Type } from 'lucide-react';
import type { McpCallToolResponse, McpReadResourceResponse, McpContent, McpResourceContent } from '../types/types';
import { useHighlighter, highlightedCodeClasses, type HighlightLanguage } from './viewers';

interface McpResultViewerProps {
  toolResponse?: McpCallToolResponse;
  resourceResponse?: McpReadResourceResponse;
}

// Detect content type from text for syntax highlighting
function detectTextLanguage(text: string): HighlightLanguage {
  const trimmed = text.trim();
  
  // Try JSON first
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }
  
  // Try XML
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    // Basic XML detection - has opening and closing tags
    if (/<\w+[^>]*>[\s\S]*<\/\w+>/.test(trimmed) || /<\w+[^>]*\/>/.test(trimmed)) {
      return 'xml';
    }
  }
  
  return 'text';
}

// Format JSON for display
function formatJson(str: string): string {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}

// Format XML for display
function formatXml(xml: string): string {
  try {
    const PADDING = '  ';
    const reg = /(>)(<)(\/*)/g;
    const formatted = xml.replace(reg, '$1\n$2$3');
    let pad = 0;
    
    return formatted.split('\n').map((node) => {
      let indent = 0;
      if (node.match(/.+<\/\w[^>]*>$/)) {
        indent = 0;
      } else if (node.match(/^<\/\w/) && pad > 0) {
        pad -= 1;
      } else if (node.match(/^<\w[^>]*[^/]>.*$/)) {
        indent = 1;
      } else {
        indent = 0;
      }
      
      const padding = PADDING.repeat(pad);
      pad += indent;
      
      return padding + node;
    }).join('\n');
  } catch {
    return xml;
  }
}

// Badge component for content type labels
function TypeBadge({ type, language }: { type: string; language?: HighlightLanguage }) {
  const getIcon = () => {
    switch (type) {
      case 'text': return <Type size={12} />;
      case 'image': return <Image size={12} />;
      case 'audio': return <Music size={12} />;
      case 'resource': return <Link2 size={12} />;
      default: return <FileText size={12} />;
    }
  };
  
  const label = language && language !== 'text' ? language.toUpperCase() : type.charAt(0).toUpperCase() + type.slice(1);
  
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
      {getIcon()}
      {label}
    </span>
  );
}

// Highlighted text content component
function HighlightedText({ text, className = '' }: { text: string; className?: string }) {
  const language = detectTextLanguage(text);
  const formattedText = language === 'json' ? formatJson(text) : language === 'xml' ? formatXml(text) : text;
  const highlightedHtml = useHighlighter(formattedText, language);
  
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <TypeBadge type="text" language={language} />
      </div>
      <div 
        className={highlightedCodeClasses}
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
    </div>
  );
}

// Content block for tool responses
function ContentBlock({ content, isError }: { content: McpContent; isError?: boolean }) {
  const blockClasses = isError
    ? 'bg-red-50/50 dark:bg-red-900/10 rounded-lg p-4 border border-red-200 dark:border-red-800/50'
    : 'bg-neutral-50 dark:bg-black/20 rounded-lg p-4';

  if (content.type === 'text' && content.text) {
    return (
      <div className={blockClasses}>
        <HighlightedText text={content.text} />
      </div>
    );
  }

  if (content.type === 'image' && content.data) {
    const src = content.data.startsWith('data:') 
      ? content.data 
      : `data:${content.mimeType || 'image/png'};base64,${content.data}`;
    return (
      <div className={blockClasses}>
        <div className="flex items-center justify-between mb-3">
          <TypeBadge type="image" />
          {content.mimeType && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{content.mimeType}</span>
          )}
        </div>
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
      <div className={blockClasses}>
        <div className="flex items-center justify-between mb-3">
          <TypeBadge type="audio" />
          {content.mimeType && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{content.mimeType}</span>
          )}
        </div>
        <audio controls className="w-full">
          <source src={src} type={content.mimeType || 'audio/wav'} />
          Your browser does not support the audio element.
        </audio>
      </div>
    );
  }

  if (content.type === 'resource' && content.resource) {
    const { uri, text, blob, mimeType } = content.resource;
    return (
      <div className={blockClasses}>
        <div className="flex items-center justify-between mb-3">
          <TypeBadge type="resource" />
          <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate max-w-xs" title={uri}>
            {uri}
          </span>
        </div>
        {text && <HighlightedText text={text} />}
        {blob && mimeType?.startsWith('image/') && (
          <img 
            src={`data:${mimeType};base64,${blob}`} 
            alt={uri} 
            className="max-w-full h-auto rounded mt-2"
          />
        )}
        {blob && mimeType?.startsWith('audio/') && (
          <audio controls className="w-full mt-2">
            <source src={`data:${mimeType};base64,${blob}`} type={mimeType} />
          </audio>
        )}
        {blob && !mimeType?.startsWith('image/') && !mimeType?.startsWith('audio/') && (
          <div className="text-sm text-neutral-600 dark:text-neutral-300 mt-2">
            Binary content ({Math.round(blob.length * 0.75)} bytes)
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${blockClasses} text-sm text-neutral-500`}>
      Unknown content type: {content.type}
    </div>
  );
}

// Resource content block for resource responses
function ResourceContentBlock({ content }: { content: McpResourceContent }) {
  const blockClasses = 'bg-neutral-50 dark:bg-black/20 rounded-lg p-4';

  if (content.text) {
    return (
      <div className={blockClasses}>
        <div className="flex items-center justify-between mb-3">
          <TypeBadge type="resource" />
          <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate max-w-xs" title={content.uri}>
            {content.uri}
          </span>
        </div>
        <HighlightedText text={content.text} />
      </div>
    );
  }

  if (content.blob) {
    const mimeType = content.mimeType || 'application/octet-stream';
    
    // Handle images
    if (mimeType.startsWith('image/')) {
      const src = `data:${mimeType};base64,${content.blob}`;
      return (
        <div className={blockClasses}>
          <div className="flex items-center justify-between mb-3">
            <TypeBadge type="image" />
            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate max-w-xs" title={content.uri}>
              {content.uri}
            </span>
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
        <div className={blockClasses}>
          <div className="flex items-center justify-between mb-3">
            <TypeBadge type="audio" />
            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate max-w-xs" title={content.uri}>
              {content.uri}
            </span>
          </div>
          <audio controls className="w-full">
            <source src={src} type={mimeType} />
          </audio>
        </div>
      );
    }

    // Generic binary
    return (
      <div className={blockClasses}>
        <div className="flex items-center justify-between mb-3">
          <TypeBadge type="resource" />
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {mimeType}
          </span>
        </div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono mb-2">
          {content.uri}
        </div>
        <div className="text-sm text-neutral-600 dark:text-neutral-300">
          Binary content ({Math.round(content.blob.length * 0.75)} bytes)
        </div>
      </div>
    );
  }

  return (
    <div className={`${blockClasses} text-sm text-neutral-500`}>
      Empty resource: {content.uri}
    </div>
  );
}

export function McpResultViewer({ toolResponse, resourceResponse }: McpResultViewerProps) {
  if (toolResponse) {
    const hasError = toolResponse.isError;
    
    return (
      <div className="space-y-3">
        {hasError && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
            <AlertCircle className="text-red-500 dark:text-red-400 shrink-0" size={18} />
            <span className="text-red-700 dark:text-red-400 text-sm font-medium">
              Tool returned an error
            </span>
          </div>
        )}
        {toolResponse.content.map((content, index) => (
          <ContentBlock key={index} content={content} isError={hasError} />
        ))}
        {toolResponse.content.length === 0 && (
          <div className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-4">
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
          <div className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-4">
            No content returned
          </div>
        )}
      </div>
    );
  }

  return null;
}
