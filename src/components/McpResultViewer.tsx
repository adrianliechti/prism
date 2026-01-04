import { useState } from 'react';
import { AlertCircle, FileText, Image, Music, Link2, Type, ChevronDown, ChevronRight } from 'lucide-react';
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
      case 'resource_link': return <Link2 size={12} />;
      default: return <FileText size={12} />;
    }
  };
  
  const label = language && language !== 'text' ? language.toUpperCase() : type.charAt(0).toUpperCase() + type.slice(1);
  
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300">
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
      <div 
        className={highlightedCodeClasses}
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
    </div>
  );
}

// Content card with collapsible design
function ContentCard({ content, index, isError }: { content: McpContent; index: number; isError?: boolean }) {
  const [expanded, setExpanded] = useState(true);
  
  const getContentInfo = () => {
    if (content.type === 'text') {
      const language = detectTextLanguage(content.text || '');
      return { type: 'text', language, label: language !== 'text' ? language.toUpperCase() : 'Text' };
    }
    if (content.type === 'image') {
      return { type: 'image', label: 'Image', detail: content.mimeType };
    }
    if (content.type === 'audio') {
      return { type: 'audio', label: 'Audio', detail: content.mimeType };
    }
    if (content.type === 'resource') {
      return { type: 'resource', label: 'Resource', detail: content.resource?.uri };
    }
    if (content.type === 'resource_link') {
      return { type: 'resource_link', label: 'Resource Link', detail: content.uri };
    }
    return { type: 'unknown', label: 'Unknown' };
  };

  const info = getContentInfo();
  
  return (
    <div className={`border rounded-lg overflow-hidden ${
      isError 
        ? 'border-red-200 dark:border-red-800/50' 
        : 'border-neutral-200 dark:border-white/10'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 px-3 py-2 transition-colors ${
          isError
            ? 'bg-red-50/50 dark:bg-red-900/10 hover:bg-red-100/50 dark:hover:bg-red-900/20'
            : 'bg-neutral-50 dark:bg-white/5 hover:bg-neutral-100 dark:hover:bg-white/10'
        }`}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-neutral-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-neutral-400" />
        )}
        <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
          #{index + 1}
        </span>
        <TypeBadge type={info.type} language={info.language} />
        {info.detail && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate">
            {info.detail}
          </span>
        )}
      </button>
      {expanded && (
        <div className="p-3 bg-white dark:bg-transparent">
          {content.type === 'text' && content.text && (
            <HighlightedText text={content.text} />
          )}
          {content.type === 'image' && content.data && (
            <img 
              src={content.data.startsWith('data:') ? content.data : `data:${content.mimeType || 'image/png'};base64,${content.data}`}
              alt="MCP Image Response" 
              className="max-w-full h-auto rounded"
            />
          )}
          {content.type === 'audio' && content.data && (
            <audio controls className="w-full">
              <source 
                src={content.data.startsWith('data:') ? content.data : `data:${content.mimeType || 'audio/wav'};base64,${content.data}`}
                type={content.mimeType || 'audio/wav'} 
              />
            </audio>
          )}
          {content.type === 'resource' && content.resource && (
            <div className="space-y-2">
              {content.resource.text && <HighlightedText text={content.resource.text} />}
              {content.resource.blob && content.resource.mimeType?.startsWith('image/') && (
                <img 
                  src={`data:${content.resource.mimeType};base64,${content.resource.blob}`}
                  alt={content.resource.uri}
                  className="max-w-full h-auto rounded"
                />
              )}
              {content.resource.blob && content.resource.mimeType?.startsWith('audio/') && (
                <audio controls className="w-full">
                  <source src={`data:${content.resource.mimeType};base64,${content.resource.blob}`} type={content.resource.mimeType} />
                </audio>
              )}
              {content.resource.blob && !content.resource.mimeType?.startsWith('image/') && !content.resource.mimeType?.startsWith('audio/') && (
                <div className="text-sm text-neutral-600 dark:text-neutral-300">
                  Binary content ({Math.round(content.resource.blob.length * 0.75)} bytes)
                </div>
              )}
            </div>
          )}
          {content.type === 'resource_link' && (
            <div className="space-y-2">
              {content.name && (
                <div className="font-medium text-neutral-900 dark:text-white">
                  {content.name}
                </div>
              )}
              {content.description && (
                <div className="text-sm text-neutral-600 dark:text-neutral-300">
                  {content.description}
                </div>
              )}
              {content.uri && (
                <div className="flex items-center gap-2 text-sm">
                  <Link2 size={14} className="text-neutral-400 shrink-0" />
                  <a 
                    href={content.uri} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="font-mono text-blue-600 dark:text-blue-400 hover:underline break-all"
                  >
                    {content.uri}
                  </a>
                </div>
              )}
              {content.mimeType && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                  {content.mimeType}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Resource content card for resource responses
function ResourceContentCard({ content, index }: { content: McpResourceContent; index: number }) {
  const [expanded, setExpanded] = useState(true);
  
  const getContentInfo = () => {
    if (content.text) {
      const language = detectTextLanguage(content.text);
      return { label: language !== 'text' ? language.toUpperCase() : 'Text', language };
    }
    if (content.blob && content.mimeType?.startsWith('image/')) {
      return { label: 'Image', detail: content.mimeType };
    }
    if (content.blob && content.mimeType?.startsWith('audio/')) {
      return { label: 'Audio', detail: content.mimeType };
    }
    return { label: 'Binary', detail: content.mimeType };
  };

  const info = getContentInfo();
  
  return (
    <div className="border border-neutral-200 dark:border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-neutral-50 dark:bg-white/5 hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-neutral-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-neutral-400" />
        )}
        <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
          #{index + 1}
        </span>
        <TypeBadge type="resource" language={info.language} />
        <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate" title={content.uri}>
          {content.uri}
        </span>
      </button>
      {expanded && (
        <div className="p-3 bg-white dark:bg-transparent">
          {content.text && <HighlightedText text={content.text} />}
          {content.blob && content.mimeType?.startsWith('image/') && (
            <img 
              src={`data:${content.mimeType};base64,${content.blob}`}
              alt={content.uri}
              className="max-w-full h-auto rounded"
            />
          )}
          {content.blob && content.mimeType?.startsWith('audio/') && (
            <audio controls className="w-full">
              <source src={`data:${content.mimeType};base64,${content.blob}`} type={content.mimeType} />
            </audio>
          )}
          {content.blob && !content.mimeType?.startsWith('image/') && !content.mimeType?.startsWith('audio/') && (
            <div className="text-sm text-neutral-600 dark:text-neutral-300">
              Binary content ({Math.round(content.blob.length * 0.75)} bytes)
            </div>
          )}
          {!content.text && !content.blob && (
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              Empty resource
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function McpResultViewer({ toolResponse, resourceResponse }: McpResultViewerProps) {
  if (toolResponse) {
    const hasError = toolResponse.isError;
    const contentCount = toolResponse.content.length;
    
    return (
      <div className="space-y-2">
        {hasError && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 mb-3">
            <AlertCircle className="text-red-500 dark:text-red-400 shrink-0" size={18} />
            <span className="text-red-700 dark:text-red-400 text-sm font-medium">
              Tool returned an error
            </span>
          </div>
        )}
        {contentCount > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {contentCount} item{contentCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        {toolResponse.content.map((content, index) => (
          <ContentCard key={index} content={content} index={index} isError={hasError} />
        ))}
        {contentCount === 0 && (
          <div className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-4">
            No content returned
          </div>
        )}
      </div>
    );
  }

  if (resourceResponse) {
    const contentCount = resourceResponse.contents.length;
    
    return (
      <div className="space-y-2">
        {contentCount > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {contentCount} resource{contentCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        {resourceResponse.contents.map((content, index) => (
          <ResourceContentCard key={index} content={content} index={index} />
        ))}
        {contentCount === 0 && (
          <div className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-4">
            No content returned
          </div>
        )}
      </div>
    );
  }

  return null;
}
