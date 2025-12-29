import { useRef } from 'react';
import type { FormDataField } from '../types/types';
import { Trash2, Circle, CheckCircle2, Paperclip, X } from 'lucide-react';

interface FormDataEditorProps {
  items: FormDataField[];
  onChange: (items: FormDataField[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function createEmptyField(): FormDataField {
  return { id: generateId(), enabled: true, key: '', type: 'text', value: '', file: null, fileName: '' };
}

export function FormDataEditor({
  items,
  onChange,
  keyPlaceholder = 'Field',
  valuePlaceholder = 'Value',
}: FormDataEditorProps) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const updateItem = (id: string, updates: Partial<FormDataField>) => {
    const newItems = items.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );
    
    // Auto-add new row if last row has content
    const lastItem = newItems[newItems.length - 1];
    if (lastItem && (lastItem.key || lastItem.value || lastItem.file)) {
      newItems.push(createEmptyField());
    }
    
    onChange(newItems);
  };

  const removeItem = (id: string) => {
    if (items.length === 1) {
      onChange([createEmptyField()]);
      return;
    }
    onChange(items.filter((item) => item.id !== id));
  };

  const handleFileSelect = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    // Reset input value so the same file can be selected again
    e.target.value = '';
    if (file) {
      // When file is selected, set type to 'file' and store the file
      updateItem(id, { type: 'file', file, fileName: file.name, value: '' });
    }
  };

  const clearFile = (id: string) => {
    // When file is cleared, revert to text type
    updateItem(id, { type: 'text', file: null, fileName: '' });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      <table className="w-full">
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={`border-b border-neutral-100 dark:border-white/5 last:border-0 ${!item.enabled ? 'opacity-40' : ''}`}>
              <td className="w-8 pl-2.5 py-1.5">
                <button
                  type="button"
                  onClick={() => updateItem(item.id, { enabled: !item.enabled })}
                  className="p-0.5 rounded transition-colors"
                >
                  {item.enabled ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-neutral-700 dark:text-neutral-300" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-neutral-300 dark:text-neutral-600" />
                  )}
                </button>
              </td>
              <td className="px-1.5 py-1.5 w-36">
                <input
                  type="text"
                  value={item.key}
                  onChange={(e) => updateItem(item.id, { key: e.target.value })}
                  placeholder={keyPlaceholder}
                  className="w-full px-2 py-1 bg-white dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded text-xs text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors"
                />
              </td>
              <td className="px-1.5 py-1.5">
                <input
                  type="file"
                  ref={(el) => { fileInputRefs.current[item.id] = el; }}
                  onChange={(e) => handleFileSelect(item.id, e)}
                  className="hidden"
                />
                {item.type === 'file' && item.file ? (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-neutral-100 dark:bg-white/10 rounded text-xs text-neutral-600 dark:text-neutral-300">
                    <Paperclip className="w-3 h-3 shrink-0" />
                    <span className="truncate max-w-xs">{item.fileName}</span>
                    <span className="text-neutral-400 shrink-0">({formatFileSize(item.file.size)})</span>
                    <button
                      type="button"
                      onClick={() => clearFile(item.id)}
                      className="p-0.5 ml-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={item.value}
                    onChange={(e) => updateItem(item.id, { value: e.target.value })}
                    placeholder={valuePlaceholder}
                    className="w-full px-2 py-1 bg-white dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded text-xs text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors"
                  />
                )}
              </td>
              <td className="w-16 pr-1.5 py-1.5">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => fileInputRefs.current[item.id]?.click()}
                    className={`p-1 rounded transition-colors ${
                      item.type === 'file' 
                        ? 'text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10' 
                        : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5'
                    }`}
                    title="Attach file"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="p-1 text-neutral-400 dark:text-neutral-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-neutral-100 dark:hover:bg-white/5 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
