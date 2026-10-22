// Pure helpers for the OpenAI-compatible client: mode selection, input
// validation and Responses API request/response mapping.
import type { OpenAIBodyType, OpenAIChatInput, OpenAIRequestData } from '../types/types';

// Endpoint cues in precedence order, shared with wingman-chat's modelType().
// Realtime models and rerankers have no mode here but must match first: a live
// transcriber needs a WebSocket and a BGE reranker is not an embedder. Whole
// tokens only, so "clip" inside an unrelated deployment alias does not count.
const modelCues: [RegExp, OpenAIBodyType | undefined][] = [
  [/(?:^|[^a-z0-9])(?:realtime|sonic|live|native-audio)(?:$|[^a-z0-9])/, undefined],
  [/(?:^|[^a-z0-9])(?:rerank|reranker)(?:$|[^a-z0-9])/, undefined],
  [/(?:^|[^a-z0-9])(?:embedding|embeddings|embed|bge|clip|gte|minilm)(?:$|[^a-z0-9])/, 'embeddings'],
  [/(?:^|[^a-z0-9])(?:stt|transcribe|whisper)(?:$|[^a-z0-9])/, 'transcription'],
  [/(?:^|[^a-z0-9])(?:tts|eleven|elevenlabs|mai-voice|stable-audio|speech)(?:$|[^a-z0-9])/, 'audio'],
  [/(?:^|[^a-z0-9])(?:image|imagen|flux|dall-e|stable-diffusion|midjourney|nano-banana)(?:$|[^a-z0-9])/, 'image'],
];

// The mode a model is served by; undefined when none of the modes fits.
// Models without a cue are text models and go through the Responses API.
export function inferOpenAIBodyType(model: string): OpenAIBodyType | undefined {
  const normalized = model.toLowerCase().replaceAll('_', '-');
  const cue = modelCues.find(([pattern]) => pattern.test(normalized));
  return cue ? cue[1] : 'chat';
}

// Drafts saved before bodyType existed only carry the data of their mode.
export function getOpenAIBodyType(openai: OpenAIRequestData | undefined): OpenAIBodyType {
  if (openai?.bodyType) return openai.bodyType;
  if (openai?.chat) return 'chat';
  if (openai?.image) return 'image';
  if (openai?.audio) return 'audio';
  if (openai?.transcription) return 'transcription';
  if (openai?.embeddings) return 'embeddings';
  return 'chat';
}

export function isChatMessageEmpty(message: OpenAIChatInput): boolean {
  return message.content.every(c => c.type === 'text' ? !c.text.trim() : !c.data);
}

export function hasOpenAIInput(openai: OpenAIRequestData | undefined): boolean {
  switch (getOpenAIBodyType(openai)) {
    case 'chat': return (openai?.chat?.input ?? []).some(m => !isChatMessageEmpty(m));
    case 'image': return !!openai?.image?.prompt.trim();
    case 'audio': return !!openai?.audio?.text.trim();
    case 'transcription': return !!openai?.transcription?.file;
    case 'embeddings': return (openai?.embeddings?.input ?? []).some(i => i.text.trim());
  }
}

// Text-only messages are sent as plain strings: that is valid for every role,
// whereas content parts would have to be output_text for assistant messages.
export function buildResponsesInput(messages: OpenAIChatInput[]) {
  return messages.filter(m => !isChatMessageEmpty(m)).map(m => {
    const parts = m.content.filter(c => c.type === 'text' ? c.text.trim() : c.data);
    if (parts.every(c => c.type === 'text')) {
      return { role: m.role, content: parts.map(c => c.text).join('\n') };
    }
    return {
      role: m.role,
      content: parts.map(c => {
        if (c.type === 'text') return { type: 'input_text', text: c.text };
        if (c.data.startsWith('data:image/')) return { type: 'input_image', image_url: c.data };
        return { type: 'input_file', filename: c.name || 'file', file_data: c.data };
      }),
    };
  });
}

interface ResponsesOutputItem {
  type: string;
  content?: { type: string; text?: string; refusal?: string }[];
}

export function parseResponsesOutput(data: { output?: ResponsesOutputItem[] }): string {
  let text = '';
  for (const item of data.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type === 'output_text') text += content.text ?? '';
      else if (content.type === 'refusal') text += content.refusal ?? '';
    }
  }
  return text;
}
