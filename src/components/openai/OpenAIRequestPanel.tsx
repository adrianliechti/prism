import { useClient } from '../../context/useClient';
import { OpenAIChatEditor } from './OpenAIChatEditor';
import { OpenAIEmbeddingsEditor } from './OpenAIEmbeddingsEditor';
import { OpenAIImageEditor } from './OpenAIImageEditor';
import { getOpenAIBodyType } from '../../lib/openai';
import { FileAudio } from 'lucide-react';

export function OpenAIRequestPanel() {
  const { 
    request,
    setOpenAIImagePrompt,
    setOpenAIAudioText,
    setOpenAIAudioVoice,
    setOpenAITranscriptionFile,
  } = useClient();
  
  const bodyType = getOpenAIBodyType(request?.openai);
  const imagePrompt = request?.openai?.image?.prompt ?? '';
  const audioText = request?.openai?.audio?.text ?? '';
  const audioVoice = request?.openai?.audio?.voice ?? 'alloy';
  const transcriptionFile = request?.openai?.transcription?.file ?? '';

  // The mode follows the selected model; there is no manual override
  return (
    <div className="space-y-3">
      <div>
        {bodyType === 'chat' && (
          <OpenAIChatEditor />
        )}

        {bodyType === 'image' && (
          <div className="space-y-3">
            <textarea
              value={imagePrompt}
              onChange={(e) => setOpenAIImagePrompt(e.target.value)}
              placeholder="Describe the image..."
              autoCorrect="off"
              rows={4}
              className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600"
            />
            <OpenAIImageEditor />
          </div>
        )}

        {bodyType === 'audio' && (
          <div className="space-y-3">
            <select
              value={audioVoice}
              onChange={(e) => setOpenAIAudioVoice(e.target.value)}
              aria-label="Voice"
              className="h-6 px-2 text-[11px] font-medium bg-white dark:bg-white/10 text-neutral-800 dark:text-neutral-100 rounded-md shadow-sm border-0 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-white/20 cursor-pointer transition-all min-w-30"
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
            <textarea
              value={audioText}
              onChange={(e) => setOpenAIAudioText(e.target.value)}
              placeholder="Enter text to convert to speech..."
              autoCorrect="off"
              rows={4}
              className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600"
            />
          </div>
        )}

        {bodyType === 'transcription' && (
          <div>
            {transcriptionFile ? (
              <div className="flex items-center gap-2 px-3 py-2 text-sm bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-lg">
                    <div className="flex-1 text-neutral-700 dark:text-neutral-300">
                      <FileAudio className="w-4 h-4 inline-block mr-2" />
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
        )}

        {bodyType === 'embeddings' && (
          <OpenAIEmbeddingsEditor />
        )}
      </div>
    </div>
  );
}
