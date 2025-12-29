import { useState } from 'react';
import type { KeyValuePair } from '../types/types';
import { Trash2 } from 'lucide-react';

interface KeyValueEditorProps {
  items: KeyValuePair[];
  onChange: (items: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  keySuggestions?: string[];
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function KeyValueEditor({
  items,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  keySuggestions = [],
}: KeyValueEditorProps) {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');

  const updateItem = (id: string, field: keyof KeyValuePair, value: string | boolean) => {
    const newItems = items.map((item) =>
      item.id === id ? { ...item, [field]: value } : item
    );
    
    // Auto-add new row if last row has content
    const lastItem = newItems[newItems.length - 1];
    if (lastItem && (lastItem.key || lastItem.value)) {
      newItems.push({ id: generateId(), enabled: true, key: '', value: '' });
    }
    
    onChange(newItems);
  };

  const removeItem = (id: string) => {
    if (items.length === 1) {
      onChange([{ id: generateId(), enabled: true, key: '', value: '' }]);
      return;
    }
    onChange(items.filter((item) => item.id !== id));
  };

  const getFilteredSuggestions = (currentValue: string) => {
    const usedKeys = items.map(item => item.key.toLowerCase());
    return keySuggestions.filter(
      s => s.toLowerCase().includes(currentValue.toLowerCase()) && 
           !usedKeys.includes(s.toLowerCase())
    );
  };

  return (
    <div>
      <table className="w-full">
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={`border-b border-white/5 last:border-0 ${!item.enabled ? 'opacity-40' : ''}`}>
              <td className="w-8 pl-2.5 py-1.5">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={(e) => updateItem(item.id, 'enabled', e.target.checked)}
                  className="w-3.5 h-3.5 rounded bg-white/5 border-white/10 text-blue-500 focus:ring-blue-500/50 focus:ring-offset-0"
                />
              </td>
              <td className="px-1.5 py-1.5">
                <div className="relative">
                  <input
                    type="text"
                    value={item.key}
                    onChange={(e) => {
                      updateItem(item.id, 'key', e.target.value);
                      setFilterText(e.target.value);
                    }}
                    onFocus={() => {
                      setActiveDropdown(item.id);
                      setFilterText(item.key);
                    }}
                    onBlur={() => {
                      // Delay to allow click on suggestion
                      setTimeout(() => setActiveDropdown(null), 150);
                    }}
                    placeholder={keyPlaceholder}
                    className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-white/20 transition-colors"
                  />
                  {keySuggestions.length > 0 && activeDropdown === item.id && (
                    (() => {
                      const filtered = getFilteredSuggestions(filterText);
                      if (filtered.length === 0) return null;
                      return (
                        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-[#1a1a1a] border border-white/10 rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {filtered.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                updateItem(item.id, 'key', suggestion);
                                setActiveDropdown(null);
                              }}
                              className="w-full px-2 py-1.5 text-left text-xs text-gray-300 hover:bg-white/10 transition-colors"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      );
                    })()
                  )}
                </div>
              </td>
              <td className="px-1.5 py-1.5">
                <input
                  type="text"
                  value={item.value}
                  onChange={(e) => updateItem(item.id, 'value', e.target.value)}
                  placeholder={valuePlaceholder}
                  className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-white/20 transition-colors"
                />
              </td>
              <td className="w-8 pr-1.5 py-1.5">
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="p-1 text-gray-500 hover:text-rose-400 hover:bg-white/5 rounded transition-colors"
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
