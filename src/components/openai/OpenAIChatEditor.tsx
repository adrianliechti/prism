import { useRef } from 'react';
import { useClient } from '../../context/useClient';
import { Trash2, FileText, Upload, X } from 'lucide-react';
import type { OpenAIChatInput, OpenAIChatContent } from '../../types/types';

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function createEmptyMessage(): OpenAIChatInput {
  return {
    id: generateId(),
    role: 'user',
    content: [{ type: 'input_text', text: '' }],
  };
}

function isMessageEmpty(message: OpenAIChatInput): boolean {
  if (message.content.length === 0) return true;
  const content = message.content[0];
  switch (content.type) {
    case 'input_text':
      return !content.text;
    case 'input_image':
      return !content.image_url;
    case 'input_file':
      return !content.file_data;
  }
}

export function OpenAIChatEditor() {
  const { request, setOpenAIChatInput } = useClient();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  
  const chatInput = request?.openai?.chat?.input ?? [];

  const updateMessage = (id: string, updates: Partial<OpenAIChatInput>) => {
    const newInput = chatInput.map((msg) =>
      msg.id === id ? { ...msg, ...updates } : msg
    );
    
    // Auto-add new row if last row has content
    const lastItem = newInput[newInput.length - 1];
    if (lastItem && !isMessageEmpty(lastItem)) {
      newInput.push(createEmptyMessage());
    }
    
    setOpenAIChatInput(newInput);
  };

  const updateContent = (id: string, content: OpenAIChatContent) => {
    updateMessage(id, { content: [content] });
  };

  const removeMessage = (id: string) => {
    if (chatInput.length === 1) {
      setOpenAIChatInput([createEmptyMessage()]);
      return;
    }
    setOpenAIChatInput(chatInput.filter((msg) => msg.id !== id));
  };

  const handleFileSelect = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // Reset so same file can be selected again
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      
      if (file.type.startsWith('image/')) {
        updateContent(id, { type: 'input_image', image_url: dataUrl });
      } else {
        updateContent(id, { type: 'input_file', filename: file.name, file_data: base64 });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleTypeChange = (id: string, newType: OpenAIChatContent['type']) => {
    switch (newType) {
      case 'input_text':
        updateContent(id, { type: 'input_text', text: '' });
        break;
      case 'input_image':
        updateContent(id, { type: 'input_image', image_url: '' });
        break;
      case 'input_file':
        updateContent(id, { type: 'input_file', filename: '', file_data: '' });
        break;
    }
  };

  const clearFile = (id: string) => {
    const msg = chatInput.find(m => m.id === id);
    if (!msg) return;
    const content = msg.content[0];
    if (content.type === 'input_image') {
      updateContent(id, { type: 'input_image', image_url: '' });
    } else if (content.type === 'input_file') {
      updateContent(id, { type: 'input_file', filename: '', file_data: '' });
    }
  };

  const renderContentInput = (message: OpenAIChatInput) => {
    const content = message.content[0];
    
    switch (content.type) {
      case 'input_text':
        return (
          <input
            type="text"
            value={content.text}
            onChange={(e) => updateContent(message.id, { type: 'input_text', text: e.target.value })}
            placeholder="Message content..."
            className="w-full px-2 py-1 bg-white dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded text-xs text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors"
          />
        );
      
      case 'input_image':
        return content.image_url ? (
          <div className="flex items-center gap-2 px-2 py-1 bg-white dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded">
            <img src={content.image_url} alt="Uploaded" className="w-5 h-5 object-cover rounded" />
            <span className="text-xs text-neutral-600 dark:text-neutral-400 truncate flex-1">Image</span>
            <button
              type="button"
              onClick={() => clearFile(message.id)}
              className="p-0.5 hover:bg-neutral-100 dark:hover:bg-white/10 rounded transition-colors"
            >
              <X className="w-3 h-3 text-neutral-400" />
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-2 px-2 py-1 bg-white dark:bg-white/5 border border-dashed border-neutral-300 dark:border-white/20 rounded cursor-pointer hover:bg-neutral-50 dark:hover:bg-white/10 transition-colors">
            <Upload className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-xs text-neutral-400">Upload image...</span>
            <input
              ref={(el) => { fileInputRefs.current[message.id] = el; }}
              type="file"
              accept="image/*"
              onChange={(e) => handleFileSelect(message.id, e)}
              className="hidden"
            />
          </label>
        );
      
      case 'input_file':
        return content.filename ? (
          <div className="flex items-center gap-2 px-2 py-1 bg-white dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded">
            <FileText className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <span className="text-xs text-neutral-600 dark:text-neutral-400 truncate flex-1">{content.filename}</span>
            <span className="text-[10px] text-neutral-400">({Math.round(content.file_data.length * 0.75 / 1024)}KB)</span>
            <button
              type="button"
              onClick={() => clearFile(message.id)}
              className="p-0.5 hover:bg-neutral-100 dark:hover:bg-white/10 rounded transition-colors"
            >
              <X className="w-3 h-3 text-neutral-400" />
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-2 px-2 py-1 bg-white dark:bg-white/5 border border-dashed border-neutral-300 dark:border-white/20 rounded cursor-pointer hover:bg-neutral-50 dark:hover:bg-white/10 transition-colors">
            <Upload className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-xs text-neutral-400">Upload file...</span>
            <input
              ref={(el) => { fileInputRefs.current[message.id] = el; }}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              onChange={(e) => handleFileSelect(message.id, e)}
              className="hidden"
            />
          </label>
        );
    }
  };

  return (
    <div>
      <table className="w-full">
        <tbody>
          {chatInput.map((message) => (
            <tr key={message.id} className="border-b border-neutral-100 dark:border-white/5 last:border-0">
              {/* Role selector */}
              <td className="w-24 px-1.5 py-1.5">
                <select
                  value={message.role}
                  onChange={(e) => updateMessage(message.id, { role: e.target.value as OpenAIChatInput['role'] })}
                  className="w-full px-2 py-1 bg-white dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors"
                >
                  <option value="system">System</option>
                  <option value="user">User</option>
                  <option value="assistant">Assistant</option>
                </select>
              </td>
              
              {/* Type selector */}
              <td className="w-20 px-1.5 py-1.5">
                <select
                  value={message.content[0]?.type ?? 'input_text'}
                  onChange={(e) => handleTypeChange(message.id, e.target.value as OpenAIChatContent['type'])}
                  className="w-full px-2 py-1 bg-white dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors"
                >
                  <option value="input_text">Text</option>
                  <option value="input_image">Image</option>
                  <option value="input_file">File</option>
                </select>
              </td>
              
              {/* Content input */}
              <td className="px-1.5 py-1.5">
                {renderContentInput(message)}
              </td>
              
              {/* Delete button */}
              <td className="w-8 pr-1.5 py-1.5">
                <button
                  type="button"
                  onClick={() => removeMessage(message.id)}
                  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-neutral-300 dark:text-neutral-600 hover:text-red-500"
                  title="Remove message"
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
