import { useClient } from '../context/useClient';
import { RequestBarActions } from '../context/RequestBarActions';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { getConfig } from '../config';

export function SharedRequestActions() {
  const { request, isExecuting, executeRequest, aiPanelOpen, toggleAiPanel } = useClient();

  const hasAiModel = Boolean(getConfig().ai?.model);
  const isLoading = isExecuting;
  const protocol = request?.protocol ?? 'rest';
  const url = request?.url ?? '';

  // Parse grpc:// or grpcs:// URL into parts
  const parseGrpcUrl = (grpcUrl: string): { host: string; service: string; method: string } => {
    const match = grpcUrl.match(/^grpcs?:\/\/([^/]*)(?:\/([^/]*)(?:\/([^/]*))?)?$/);
    if (match) {
      return { host: match[1] || '', service: match[2] || '', method: match[3] || '' };
    }
    return { host: '', service: '', method: '' };
  };

  const { host: grpcHost, service: grpcService, method: grpcMethod } = parseGrpcUrl(url);

  const mcpHasToolOrResource = !!request?.mcp?.tool || !!request?.mcp?.resource;

  const openaiModel = request?.openai?.model ?? '';
  const openaiChatInput = request?.openai?.chat?.input ?? [];
  const openaiImage = request?.openai?.image;
  const openaiImagePrompt = openaiImage?.prompt ?? '';
  const openaiAudioText = request?.openai?.audio?.text ?? '';
  const openaiTranscriptionFile = request?.openai?.transcription?.file ?? '';
  const openaiEmbeddingsInput = request?.openai?.embeddings?.input ?? [];
  
  // Check if OpenAI has valid input
  const openaiHasValidInput = request?.openai?.chat
    ? openaiChatInput.some(msg => msg.content.some(content => (
        content.type === 'text'
          ? content.text.trim().length > 0
          : content.data.length > 0
      )))
    : request?.openai?.image
      ? openaiImagePrompt.trim().length > 0
      : request?.openai?.transcription
        ? openaiTranscriptionFile.length > 0
        : request?.openai?.embeddings
          ? openaiEmbeddingsInput.some(item => item.text.trim().length > 0)
          : openaiAudioText.trim().length > 0;

  const disabledReason = isLoading
    ? 'Request is running'
    : protocol === 'rest' && !url
      ? 'Enter a request URL'
      : protocol === 'grpc' && !grpcHost
        ? 'Enter a gRPC host'
        : protocol === 'grpc' && !grpcService
          ? 'Select a gRPC service'
          : protocol === 'grpc' && !grpcMethod
            ? 'Select a gRPC method'
            : protocol === 'mcp' && !url
              ? 'Enter an MCP server URL'
              : protocol === 'mcp' && !mcpHasToolOrResource
                ? 'Select an MCP tool or resource'
                : protocol === 'openai' && !url
                  ? 'Enter an OpenAI base URL'
                  : protocol === 'openai' && !openaiModel
                    ? 'Select an OpenAI model'
                    : protocol === 'openai' && !openaiHasValidInput
                      ? 'Enter request input'
                      : 'Send request';

  // Check if we can execute
  const canExecute = protocol === 'rest'
    ? url.length > 0
    : protocol === 'mcp'
      ? url.length > 0 && mcpHasToolOrResource
      : protocol === 'openai'
        ? url.length > 0 && openaiModel.length > 0 && openaiHasValidInput
        : grpcHost.length > 0 && grpcService.length > 0 && grpcMethod.length > 0;

  const handleSubmit = () => {
    executeRequest();
  };

  return (
    <RequestBarActions>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isLoading || !canExecute}
        className="p-1.5 hover:bg-neutral-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition-colors text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        title={disabledReason}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ArrowRight className="w-4 h-4" />
        )}
      </button>
      {hasAiModel && (
        <button
          type="button"
          onClick={toggleAiPanel}
          className={`p-1.5 hover:bg-neutral-100 dark:hover:bg-white/10 rounded-md transition-colors ${
            aiPanelOpen
              ? 'text-amber-500 hover:text-amber-600'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
          }`}
          title="AI Assistant"
        >
          <Sparkles className="w-4 h-4" />
        </button>
      )}
    </RequestBarActions>
  );
}
