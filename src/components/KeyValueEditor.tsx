import type { KeyValuePair } from '../types/api';

interface KeyValueEditorProps {
  items: KeyValuePair[];
  onChange: (items: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function KeyValueEditor({
  items,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
}: KeyValueEditorProps) {
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

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 text-sm font-medium text-gray-600 px-1">
        <div className="w-6"></div>
        <div>{keyPlaceholder}</div>
        <div>{valuePlaceholder}</div>
        <div className="w-8"></div>
      </div>
      {items.map((item) => (
        <div key={item.id} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={(e) => updateItem(item.id, 'enabled', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <input
            type="text"
            value={item.key}
            onChange={(e) => updateItem(item.id, 'key', e.target.value)}
            placeholder={keyPlaceholder}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            value={item.value}
            onChange={(e) => updateItem(item.id, 'value', e.target.value)}
            placeholder={valuePlaceholder}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => removeItem(item.id)}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
