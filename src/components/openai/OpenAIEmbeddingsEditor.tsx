import { useClient } from '../../context/useClient';
import { Trash2 } from 'lucide-react';
import type { OpenAIEmbeddingsInput } from '../../types/types';

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function createEmptyInput(): OpenAIEmbeddingsInput {
  return {
    id: generateId(),
    text: '',
  };
}

function isInputEmpty(input: OpenAIEmbeddingsInput): boolean {
  return !input.text.trim();
}

export function OpenAIEmbeddingsEditor() {
  const { request, setOpenAIEmbeddingsInput } = useClient();
  
  const embeddingsInput = request?.openai?.embeddings?.input ?? [];

  const updateInput = (id: string, text: string) => {
    const newInput = embeddingsInput.map((item) =>
      item.id === id ? { ...item, text } : item
    );
    
    // Auto-add new row if last row has content
    const lastItem = newInput[newInput.length - 1];
    if (lastItem && !isInputEmpty(lastItem)) {
      newInput.push(createEmptyInput());
    }
    
    setOpenAIEmbeddingsInput(newInput);
  };

  const removeInput = (id: string) => {
    if (embeddingsInput.length === 1) {
      setOpenAIEmbeddingsInput([createEmptyInput()]);
      return;
    }
    setOpenAIEmbeddingsInput(embeddingsInput.filter((item) => item.id !== id));
  };

  return (
    <div>
      <table className="w-full">
        <tbody>
          {embeddingsInput.map((item) => (
            <tr key={item.id} className="border-b border-neutral-100 dark:border-white/5 last:border-0">
              {/* Text input */}
              <td className="px-1.5 py-1.5">
                <input
                  type="text"
                  value={item.text}
                  onChange={(e) => updateInput(item.id, e.target.value)}
                  placeholder="Text to convert to embeddings..."
                  className="w-full px-2 py-1 bg-white dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded text-xs text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors"
                />
              </td>
              
              {/* Delete button */}
              <td className="w-8 pr-1.5 py-1.5">
                <button
                  type="button"
                  onClick={() => removeInput(item.id)}
                  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-neutral-300 dark:text-neutral-600 hover:text-red-500"
                  title="Remove input"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
