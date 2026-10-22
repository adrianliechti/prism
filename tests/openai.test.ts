import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildResponsesInput, getOpenAIBodyType, hasOpenAIInput, inferOpenAIBodyType, parseResponsesOutput } from '../src/lib/openai.ts';
import type { OpenAIChatInput } from '../src/types/types.ts';

function message(role: OpenAIChatInput['role'], text: string): OpenAIChatInput {
  return { id: text, role, content: [{ type: 'text', text }] };
}

test('model names select the matching mode', () => {
  const cases: [string, string | undefined][] = [
    ['gpt-5.2', 'chat'], ['o3-mini', 'chat'], ['llama3.1:8b', 'chat'], ['gpt-4o-audio-preview', 'chat'], ['my-custom-deployment', 'chat'],
    ['gpt-image-1', 'image'], ['dall-e-3', 'image'], ['imagen-4', 'image'], ['black-forest-labs/FLUX.1-schnell', 'image'],
    ['tts-1-hd', 'audio'], ['gpt-4o-mini-tts', 'audio'], ['eleven_multilingual_v2', 'audio'],
    ['whisper-1', 'transcription'], ['gpt-4o-transcribe', 'transcription'], ['speech-stt', 'transcription'],
    ['text-embedding-3-small', 'embeddings'], ['nomic-embed-text', 'embeddings'], ['bge-m3', 'embeddings'],
    ['sentence-transformers/all-MiniLM-L6-v2', 'embeddings'],
    // no mode fits: these must not fall through to transcription or embeddings
    ['gpt-realtime', undefined], ['voxtral-mini-transcribe-live', undefined], ['BGE-reranker-v2-m3', undefined],
  ];
  for (const [model, bodyType] of cases) assert.equal(inferOpenAIBodyType(model), bodyType, model);
});

test('explicit mode wins over the data that happens to be present', () => {
  const chat = { input: [message('user', 'hi')] };
  assert.equal(getOpenAIBodyType({ model: '', image: { prompt: '' } }), 'image');
  assert.equal(getOpenAIBodyType({ model: '', bodyType: 'image', chat, image: { prompt: '' } }), 'image');
  assert.equal(hasOpenAIInput({ model: '', bodyType: 'image', chat, image: { prompt: ' ' } }), false);
  assert.equal(hasOpenAIInput({ model: '', bodyType: 'chat', chat }), true);
});

test('empty messages are not sent and text is sent as plain strings', () => {
  const input = buildResponsesInput([
    message('system', 'Be brief.'),
    message('user', 'Hi'),
    message('assistant', 'Hello!'),
    { id: 'file', role: 'user', content: [{ type: 'file', data: '' }] },
    message('user', '   '),
  ]);
  assert.deepEqual(input, [
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Hello!' },
  ]);
  assert.equal(hasOpenAIInput({ model: '', chat: { input: [message('user', ' ')] } }), false);
});

test('attachments map to image and file input parts', () => {
  const input = buildResponsesInput([
    { id: 'a', role: 'user', content: [{ type: 'file', data: 'data:image/png;base64,AAAA' }] },
    { id: 'b', role: 'user', content: [{ type: 'file', name: 'doc.pdf', data: 'data:application/pdf;base64,BBBB' }] },
  ]);
  assert.deepEqual(input, [
    { role: 'user', content: [{ type: 'input_image', image_url: 'data:image/png;base64,AAAA' }] },
    { role: 'user', content: [{ type: 'input_file', filename: 'doc.pdf', file_data: 'data:application/pdf;base64,BBBB' }] },
  ]);
});

test('response text skips reasoning items and includes refusals', () => {
  const text = parseResponsesOutput({ output: [
    { type: 'reasoning', content: [] },
    { type: 'message', content: [{ type: 'output_text', text: 'Hello ' }, { type: 'output_text', text: 'world' }] },
    { type: 'message', content: [{ type: 'refusal', refusal: '' }] },
  ] });
  assert.equal(text, 'Hello world');
});
