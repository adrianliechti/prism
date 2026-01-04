import { useClient } from '../../context/useClient';
import { Trash2, Upload } from 'lucide-react';
import type { OpenAIImageFile } from '../../types/types';

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function createEmptyImage(): OpenAIImageFile {
  return {
    id: generateId(),
    data: '',
  };
}

function isImageEmpty(image: OpenAIImageFile): boolean {
  return !image.data;
}

export function OpenAIImageEditor() {
  const { request, setOpenAIImageFiles } = useClient();
  
  const images = request?.openai?.image?.images ?? [];

  const handleFileSelect = (id: string, file: File | null) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const newImages = images.map((item) =>
        item.id === id ? { ...item, data: dataUrl } : item
      );
      
      // Auto-add new row if last row has content
      const lastItem = newImages[newImages.length - 1];
      if (lastItem && !isImageEmpty(lastItem)) {
        newImages.push(createEmptyImage());
      }
      
      setOpenAIImageFiles(newImages);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (id: string) => {
    if (images.length === 1) {
      setOpenAIImageFiles([createEmptyImage()]);
      return;
    }
    setOpenAIImageFiles(images.filter((item) => item.id !== id));
  };

  const clearImage = (id: string) => {
    const newImages = images.map((item) =>
      item.id === id ? { ...item, data: '' } : item
    );
    setOpenAIImageFiles(newImages);
  };

  return (
    <div>
      <table className="w-full">
        <tbody>
          {images.map((item) => (
            <tr key={item.id} className="border-b border-neutral-100 dark:border-white/5 last:border-0">
              {/* File input */}
              <td className="px-1.5 py-1.5">
                {item.data ? (
                  <div className="flex items-center gap-2 px-2 py-1 bg-white dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded text-xs">
                    <img src={item.data} alt="Preview" className="w-8 h-8 object-cover rounded" />
                    <span className="flex-1 text-neutral-700 dark:text-neutral-300">Image uploaded</span>
                    <button
                      type="button"
                      onClick={() => clearImage(item.id)}
                      className="px-2 py-0.5 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 rounded transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-2 py-1 bg-white dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded text-xs cursor-pointer hover:border-neutral-400 dark:hover:border-white/20 transition-colors">
                    <Upload className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
                    <span className="text-neutral-500 dark:text-neutral-400">Select image file...</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileSelect(item.id, e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                )}
              </td>
              
              {/* Delete button */}
              <td className="w-8 pr-1.5 py-1.5">
                <button
                  type="button"
                  onClick={() => removeImage(item.id)}
                  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-neutral-300 dark:text-neutral-600 hover:text-red-500"
                  title="Remove image"
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
