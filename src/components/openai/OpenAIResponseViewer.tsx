import { useMemo } from 'react';
import { useClient } from '../../context/useClient';
import { Markdown } from '../Markdown';

/**
 * Convert base64 string to Blob
 */
function base64ToBlob(base64: string, mimeType: string = 'image/png'): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

export function OpenAIResponseViewer() {
  const { request } = useClient();
  
  const response = request?.openai?.response;
  const result = response?.result;

  // Convert base64 image to object URL
  const imageUrl = useMemo(() => {
    if (!result || result.type !== 'image' || !result.image) return null;
    // Check if it's base64 (not a URL)
    if (!result.image.startsWith('http')) {
      const blob = base64ToBlob(result.image, 'image/png');
      return URL.createObjectURL(blob);
    }
    return result.image;
  }, [result]);

  // Convert base64 audio to object URL
  const audioUrl = useMemo(() => {
    if (!result || result.type !== 'audio' || !result.audio) return null;
    const blob = base64ToBlob(result.audio, 'audio/mpeg');
    return URL.createObjectURL(blob);
  }, [result]);

  if (!response) {
    return null;
  }

  // No result yet (shouldn't happen normally but handle it)
  if (!result) {
    return (
      <div className="text-sm text-neutral-500 dark:text-neutral-400">
        No response data
      </div>
    );
  }

  // Text response - render with markdown
  if (result.type === 'text') {
    return (
      <div className="h-full overflow-auto">
        <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-neutral-100 dark:prose-pre:bg-neutral-800 prose-pre:text-neutral-800 dark:prose-pre:text-neutral-200 prose-code:text-violet-600 dark:prose-code:text-violet-400 prose-code:before:content-none prose-code:after:content-none">
          <Markdown>{result.text}</Markdown>
        </div>
      </div>
    );
  }

  // Image response
  if (result.type === 'image') {
    if (!result.image) {
      return (
        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          No image data
        </div>
      );
    }

    return (
      <div className="h-full overflow-auto">
        <div className="flex items-center justify-center p-4">
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Generated image"
              className="max-w-full h-auto object-contain rounded-lg shadow-lg"
            />
          )}
        </div>
      </div>
    );
  }

  // Audio response
  if (result.type === 'audio') {
    if (!result.audio) {
      return (
        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          No audio data
        </div>
      );
    }

    return (
      <div className="h-full overflow-auto">
        <div className="flex flex-col items-center justify-center p-4 space-y-4">
          <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Generated Audio
          </div>
          {audioUrl && (
            <audio
              controls
              src={audioUrl}
              className="w-full max-w-md"
              preload="auto"
            >
              Your browser does not support the audio element.
            </audio>
          )}
          {audioUrl && (
            <a
              href={audioUrl}
              download="generated-audio.mp3"
              className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
            >
              Download Audio
            </a>
          )}
        </div>
      </div>
    );
  }

  // Transcription response
  if (result.type === 'transcription') {
    return (
      <div className="h-full overflow-auto">
        <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-neutral-100 dark:prose-pre:bg-neutral-800 prose-pre:text-neutral-800 dark:prose-pre:text-neutral-200 prose-code:text-violet-600 dark:prose-code:text-violet-400 prose-code:before:content-none prose-code:after:content-none">
          <div className="p-4">
            <div className="text-sm text-neutral-800 dark:text-neutral-100 whitespace-pre-wrap">
              {result.text}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Embeddings response
  if (result.type === 'embeddings') {
    return (
      <div className="h-full overflow-auto">
        <div className="p-4 space-y-3">
          {result.embeddings.map((embedding, index) => (
            <div key={index} className="space-y-1">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Input {index + 1}: {embedding.length} dimensions
              </div>
              <pre className="text-xs overflow-auto text-neutral-800 dark:text-neutral-200">
                {JSON.stringify(embedding, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm text-neutral-500 dark:text-neutral-400">
      Unknown response type
    </div>
  );
}
