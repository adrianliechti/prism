import { useClient } from '../../context/useClient';
import { OpenAIChatEditor } from './OpenAIChatEditor';
import type { OpenAIBodyType } from '../../types/types';

type Tab = 'chat' | 'image';

export function OpenAIRequestPanel() {
  const { request, setOpenAIBodyType, setOpenAIImagePrompt } = useClient();
  
  const isChat = !!request?.openai?.chat;
  const bodyType = isChat ? 'chat' : 'image';
  const imagePrompt = request?.openai?.image?.prompt ?? '';

  const tabs = [
    { id: 'chat' as Tab, label: 'Chat' },
    { id: 'image' as Tab, label: 'Image' },
  ];

  const handleTabChange = (tab: Tab) => {
    setOpenAIBodyType(tab as OpenAIBodyType);
  };

  return (
    <div className="space-y-3">
      {/* Tab Headers */}
      <div className="flex items-center gap-2">
        <div role="tablist" className="inline-flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              onClick={() => handleTabChange(tab.id)}
              className={`px-2 py-1 text-[11px] font-medium rounded-md transition-all ${
                bodyType === tab.id
                  ? 'bg-white dark:bg-white/10 text-neutral-800 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {bodyType === 'chat' && (
          <OpenAIChatEditor />
        )}

        {bodyType === 'image' && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Prompt
            </label>
            <textarea
              value={imagePrompt}
              onChange={(e) => setOpenAIImagePrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              rows={4}
              className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600"
            />
          </div>
        )}
      </div>
    </div>
  );
}
