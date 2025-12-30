// OpenAI API client with streaming and tool support

export const Role = {
  System: 'system',
  User: 'user',
  Assistant: 'assistant',
  Tool: 'tool',
} as const;

export type Role = typeof Role[keyof typeof Role];

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  id: string;
  data: unknown;
}

export interface Message {
  role: Role;
  content: string;
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
}

interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_calls?: {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }[];
  tool_call_id?: string;
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Tool['parameters'];
  };
}

function toOpenAIMessages(messages: Message[]): OpenAIMessage[] {
  return messages.map((msg) => {
    if (msg.role === Role.Tool && msg.toolResult) {
      return {
        role: 'tool',
        content: JSON.stringify(msg.toolResult.data),
        tool_call_id: msg.toolResult.id,
      };
    }
    if (msg.role === Role.Assistant && msg.toolCalls?.length) {
      return {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        })),
      };
    }
    return {
      role: msg.role,
      content: msg.content,
    };
  });
}

function toOpenAITools(tools: Tool[]): OpenAITool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export async function complete(
  model: string,
  systemPrompt: string,
  messages: Message[],
  tools: Tool[],
  onStream?: (delta: string, snapshot: string) => void
): Promise<Message> {
  const openaiMessages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...toOpenAIMessages(messages),
  ];

  const body: Record<string, unknown> = {
    model,
    messages: openaiMessages,
    stream: true,
  };

  if (tools.length > 0) {
    body.tools = toOpenAITools(tools);
  }

  const response = await fetch('/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let content = '';
  const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;

        if (delta?.content) {
          content += delta.content;
          onStream?.(delta.content, content);
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = tc.index;
            const existing = toolCalls.get(index) || { id: '', name: '', arguments: '' };

            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing.arguments += tc.function.arguments;

            toolCalls.set(index, existing);
          }
        }
      } catch {
        // Ignore parse errors for incomplete chunks
      }
    }
  }

  const result: Message = {
    role: Role.Assistant,
    content,
  };

  if (toolCalls.size > 0) {
    result.toolCalls = Array.from(toolCalls.values()).map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments,
    }));
  }

  return result;
}
