import { useClient } from '../../context/useClient';
import { OpenAIChatEditor } from './OpenAIChatEditor';
import type { OpenAIBodyType } from '../../types/types';

type Tab = 'chat' | 'image' | 'audio' | 'transcription';

export function OpenAIRequestPanel() {
  const { 
    request, 
    setOpenAIBodyType, 
    setOpenAIImagePrompt,
    setOpenAIAudioText,
    setOpenAIAudioVoice,
    setOpenAITranscriptionFile
  } = useClient();
  
  const isChat = !!request?.openai?.chat;
  const isImage = !!request?.openai?.image;
  const isAudio = !!request?.openai?.audio;
  const bodyType = isChat ? 'chat' : isImage ? 'image' : isAudio ? 'audio' : 'transcription';
  const imagePrompt = request?.openai?.image?.prompt ?? '';
  const audioText = request?.openai?.audio?.text ?? '';
  const audioVoice = request?.openai?.audio?.voice ?? 'alloy';
  const transcriptionFile = request?.openai?.transcription?.file ?? '';

  const tabs = [
    { id: 'chat' as Tab, label: 'Chat' },
    { id: 'audio' as Tab, label: 'Audio' },
    { id: 'image' as Tab, label: 'Image' },
    { id: 'transcription' as Tab, label: 'Transcription' },
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

        {bodyType === 'audio' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Text to convert to speech
              </label>
              <textarea
                value={audioText}
                onChange={(e) => setOpenAIAudioText(e.target.value)}
                placeholder="Enter text to convert to speech..."
                rows={4}
                className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600"
              />
            </div>
            
            <div className="space-y-2">
              <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Voice
              </label>
              <select
                value={audioVoice}
                onChange={(e) => setOpenAIAudioVoice(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-neutral-800 dark:text-neutral-100"
              >
                <option value="alloy">Alloy</option>
                <option value="ash">Ash</option>
                <option value="ballad">Ballad</option>
                <option value="coral">Coral</option>
                <option value="echo">Echo</option>
                <option value="fable">Fable</option>
                <option value="onyx">Onyx</option>
                <option value="nova">Nova</option>
                <option value="sage">Sage</option>
                <option value="shimmer">Shimmer</option>
                <option value="verse">Verse</option>
                <option value="marin">Marin</option>
                <option value="cedar">Cedar</option>
              </select>
            </div>
          </div>
        )}

        {bodyType === 'transcription' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Audio File
              </label>
              <div className="flex flex-col gap-2">
                {transcriptionFile ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-sm bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-lg">
                    <div className="flex-1 text-neutral-700 dark:text-neutral-300">
                      <svg className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                      Audio file uploaded
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenAITranscriptionFile('')}
                      className="px-2 py-1 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 rounded transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept="audio/*,.m4a,.mp3,.mp4,.mpeg,.mpga,.wav,.webm"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          const dataUrl = reader.result as string;
                          setOpenAITranscriptionFile(dataUrl);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-neutral-800 dark:text-neutral-100 file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-sm file:bg-violet-50 dark:file:bg-violet-500/10 file:text-violet-600 dark:file:text-violet-400 hover:file:bg-violet-100 dark:hover:file:bg-violet-500/20"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
