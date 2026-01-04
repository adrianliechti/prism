// OpenAI protocol tools for AI chat integration
import { toolDefinition } from '@tanstack/ai';
import { clientTools } from '@tanstack/ai-client';
import { z } from 'zod';
import type { Request, OpenAIChatInput, OpenAIEmbeddingsInput, OpenAIBodyType, OpenAIImageFile } from '../../types/types';
import { generateId } from '../../lib/data';
import { truncateBody, emptySchema, setUrlSchema, type AdapterConfig } from '../../api/toolsCommon';

// OpenAI-specific setters interface
export interface OpenAISetters {
  setUrl: (url: string) => void;
  setOpenAIModel: (model: string) => void;
  setOpenAIBodyType: (bodyType: OpenAIBodyType) => void;
  setOpenAIChatInput: (input: OpenAIChatInput[]) => void;
  setOpenAIImagePrompt: (prompt: string) => void;
  setOpenAIImageFiles: (images: OpenAIImageFile[]) => void;
  setOpenAIAudioText: (text: string) => void;
  setOpenAIAudioVoice: (voice: string) => void;
  setOpenAIEmbeddingsInput: (input: OpenAIEmbeddingsInput[]) => void;
}

// Environment for OpenAI tools
export interface OpenAIToolsEnvironment {
  request: Request;
  setters: OpenAISetters;
}

// Determine the active body type from request data
function getActiveBodyType(request: Request): OpenAIBodyType {
  const openai = request.openai;
  if (!openai) return 'chat';
  if (openai.chat) return 'chat';
  if (openai.image) return 'image';
  if (openai.audio) return 'audio';
  if (openai.transcription) return 'transcription';
  if (openai.embeddings) return 'embeddings';
  return 'chat';
}

// Format request for AI context
function formatRequestForAI(request: Request): Record<string, unknown> {
  const openai = request.openai;
  const bodyType = getActiveBodyType(request);
  
  const base = {
    url: request.url,
    model: openai?.model || '',
    bodyType,
  };

  switch (bodyType) {
    case 'chat':
      return {
        ...base,
        chat: {
          messages: openai?.chat?.input.map(m => ({
            role: m.role,
            content: m.content.map(c => c.type === 'text' ? c.text : `[File: ${c.name || 'attachment'}]`).join(''),
          })) || [],
        },
      };
    case 'image':
      return {
        ...base,
        image: {
          prompt: openai?.image?.prompt || '',
          imageCount: openai?.image?.images?.length || 0,
        },
      };
    case 'audio':
      return {
        ...base,
        audio: {
          text: openai?.audio?.text || '',
          voice: openai?.audio?.voice || 'alloy',
        },
      };
    case 'transcription':
      return {
        ...base,
        transcription: {
          hasFile: !!openai?.transcription?.file,
        },
      };
    case 'embeddings':
      return {
        ...base,
        embeddings: {
          inputs: openai?.embeddings?.input.map(i => i.text) || [],
        },
      };
    default:
      return base;
  }
}

// Format response for AI context
function formatResponseForAI(request: Request): Record<string, unknown> | null {
  const response = request.openai?.response;
  if (!response) return null;

  const result = response.result;
  if (!result) return { error: response.error, duration: response.duration };

  switch (result.type) {
    case 'text':
      return {
        type: 'text',
        content: truncateBody(result.text),
        duration: response.duration,
      };
    case 'image':
      return {
        type: 'image',
        hasImage: !!result.image,
        duration: response.duration,
      };
    case 'audio':
      return {
        type: 'audio',
        hasAudio: !!result.audio,
        duration: response.duration,
      };
    case 'transcription':
      return {
        type: 'transcription',
        text: truncateBody(result.text),
        duration: response.duration,
      };
    case 'embeddings':
      return {
        type: 'embeddings',
        embeddingCount: result.embeddings.length,
        dimensions: result.embeddings[0]?.length || 0,
        duration: response.duration,
      };
    default:
      return { duration: response.duration };
  }
}

// Zod schemas for OpenAI-specific tools
const setModelSchema = z.object({
  model: z.string().describe('The OpenAI model name (e.g., gpt-4o, gpt-4o-mini, dall-e-3, tts-1, whisper-1, text-embedding-3-small)'),
});

const setBodyTypeSchema = z.object({
  bodyType: z.enum(['chat', 'image', 'audio', 'transcription', 'embeddings']).describe('The type of OpenAI request: chat (completions), image (generation), audio (TTS), transcription (STT), or embeddings'),
});

const setChatMessagesSchema = z.object({
  messages: z.string().describe('JSON array of chat messages. Each message has "role" (system|user|assistant) and "content" (string). Example: [{"role": "user", "content": "Hello"}]'),
});

const setImagePromptSchema = z.object({
  prompt: z.string().describe('The prompt for image generation'),
});

const setAudioSchema = z.object({
  text: z.string().describe('The text to convert to speech'),
  voice: z.string().optional().describe('The voice to use (alloy, echo, fable, onyx, nova, shimmer). Default: alloy'),
});

const setEmbeddingsInputSchema = z.object({
  inputs: z.string().describe('JSON array of strings to embed. Example: ["Hello world", "How are you?"]'),
});

// Tool definitions
const getRequestDef = toolDefinition({
  name: 'get_request',
  description: 'Get the current OpenAI request configuration including URL, model, body type, and type-specific data',
  inputSchema: emptySchema,
});

const getResponseDef = toolDefinition({
  name: 'get_response',
  description: 'Get the response from the last executed OpenAI request',
  inputSchema: emptySchema,
});

const setUrlDef = toolDefinition({
  name: 'set_url',
  description: 'Set the OpenAI API base URL (e.g., https://api.openai.com/v1 or a compatible endpoint)',
  inputSchema: setUrlSchema,
});

const setModelDef = toolDefinition({
  name: 'set_model',
  description: 'Set the OpenAI model to use',
  inputSchema: setModelSchema,
});

const setBodyTypeDef = toolDefinition({
  name: 'set_body_type',
  description: 'Set the type of OpenAI request (chat, image, audio, transcription, embeddings)',
  inputSchema: setBodyTypeSchema,
});

const setChatMessagesDef = toolDefinition({
  name: 'set_chat_messages',
  description: 'Set the chat messages for a chat completion request',
  inputSchema: setChatMessagesSchema,
});

const setImagePromptDef = toolDefinition({
  name: 'set_image_prompt',
  description: 'Set the prompt for image generation',
  inputSchema: setImagePromptSchema,
});

const setAudioDef = toolDefinition({
  name: 'set_audio',
  description: 'Set the text and voice for text-to-speech',
  inputSchema: setAudioSchema,
});

const setEmbeddingsInputDef = toolDefinition({
  name: 'set_embeddings_input',
  description: 'Set the input texts for embeddings generation',
  inputSchema: setEmbeddingsInputSchema,
});

// Type aliases for tool inputs
type SetUrlInput = z.infer<typeof setUrlSchema>;
type SetModelInput = z.infer<typeof setModelSchema>;
type SetBodyTypeInput = z.infer<typeof setBodyTypeSchema>;
type SetChatMessagesInput = z.infer<typeof setChatMessagesSchema>;
type SetImagePromptInput = z.infer<typeof setImagePromptSchema>;
type SetAudioInput = z.infer<typeof setAudioSchema>;
type SetEmbeddingsInputInput = z.infer<typeof setEmbeddingsInputSchema>;

// Create OpenAI tools
export function createTools(environment: OpenAIToolsEnvironment) {
  const { request, setters } = environment;

  const getRequest = getRequestDef.client(async () => {
    return formatRequestForAI(request);
  });

  const getResponse = getResponseDef.client(async () => {
    const response = formatResponseForAI(request);
    return response || { error: 'No response available. Execute the request first.' };
  });

  const setUrl = setUrlDef.client(async (args: unknown) => {
    const input = args as SetUrlInput;
    setters.setUrl(input.url);
    return { success: true, url: input.url };
  });

  const setModel = setModelDef.client(async (args: unknown) => {
    const input = args as SetModelInput;
    setters.setOpenAIModel(input.model);
    return { success: true, model: input.model };
  });

  const setBodyType = setBodyTypeDef.client(async (args: unknown) => {
    const input = args as SetBodyTypeInput;
    setters.setOpenAIBodyType(input.bodyType);
    return { success: true, bodyType: input.bodyType };
  });

  const setChatMessages = setChatMessagesDef.client(async (args: unknown) => {
    const input = args as SetChatMessagesInput;
    try {
      const messages: OpenAIChatInput[] = JSON.parse(input.messages).map((m: { role: 'system' | 'user' | 'assistant'; content: string }) => ({
        id: generateId(),
        role: m.role,
        content: [{ type: 'text' as const, text: m.content }],
      }));
      setters.setOpenAIChatInput(messages);
      return { success: true, messageCount: messages.length };
    } catch (e) {
      return { success: false, error: `Invalid JSON for messages: ${e instanceof Error ? e.message : 'parse error'}` };
    }
  });

  const setImagePrompt = setImagePromptDef.client(async (args: unknown) => {
    const input = args as SetImagePromptInput;
    setters.setOpenAIImagePrompt(input.prompt);
    return { success: true };
  });

  const setAudio = setAudioDef.client(async (args: unknown) => {
    const input = args as SetAudioInput;
    setters.setOpenAIAudioText(input.text);
    if (input.voice) {
      setters.setOpenAIAudioVoice(input.voice);
    }
    return { success: true, voice: input.voice || 'alloy' };
  });

  const setEmbeddingsInput = setEmbeddingsInputDef.client(async (args: unknown) => {
    const input = args as SetEmbeddingsInputInput;
    try {
      const texts: string[] = JSON.parse(input.inputs);
      const embeddings: OpenAIEmbeddingsInput[] = texts.map(text => ({
        id: generateId(),
        text,
      }));
      setters.setOpenAIEmbeddingsInput(embeddings);
      return { success: true, inputCount: embeddings.length };
    } catch (e) {
      return { success: false, error: `Invalid JSON for inputs: ${e instanceof Error ? e.message : 'parse error'}` };
    }
  });

  return clientTools(
    getRequest,
    getResponse,
    setUrl,
    setModel,
    setBodyType,
    setChatMessages,
    setImagePrompt,
    setAudio,
    setEmbeddingsInput
  );
}

// OpenAI-specific system instructions
export function getInstructions(): string {
  return `You are an AI assistant embedded in an OpenAI API client. You have tools that directly modify the request form visible to the user in real-time.

IMPORTANT: When you use tools like set_url, set_model, set_body_type, set_chat_messages, etc., the changes appear immediately in the user's request panel. You are actively editing their request—not just describing what to do.

Your capabilities:
- View the current OpenAI request configuration (URL, model, body type, and type-specific data)
- Directly modify the request—changes are applied instantly to the UI
- View and analyze responses after the user executes the request

Supported body types and their models:
- chat: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo (chat completions)
- image: dall-e-3, dall-e-2 (image generation)
- audio: tts-1, tts-1-hd (text-to-speech)
- transcription: whisper-1 (speech-to-text)
- embeddings: text-embedding-3-small, text-embedding-3-large, text-embedding-ada-002

Guidelines:
- First set the body_type, then configure type-specific options
- For chat, use set_chat_messages with role (system/user/assistant) and content
- For image, use set_image_prompt with a descriptive prompt
- For audio (TTS), use set_audio with text and optional voice
- For embeddings, use set_embeddings_input with an array of texts
- After making changes, briefly confirm what you did
- You cannot execute/send requests—the user must click Send
- Format your responses using Markdown`;
}

// Adapter metadata
export const adapterConfig: AdapterConfig = {
  id: 'openai',
  name: 'OpenAI Assistant',
  placeholder: 'Ask about your OpenAI request...',
};
