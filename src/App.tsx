import { ClientProvider } from './context/ClientContext';
import { RequestBarPortalProvider } from './context/RequestBarPortal';
import { useClient } from './context/useClient';
import { Sidebar } from './components/Sidebar';
import { RequestPanel } from './components/RequestPanel';
import { ChatPanel } from './components/ChatPanel';
import { getConfig } from './config';

function AppContent() {
  const { 
    request, 
    aiPanelOpen, 
    toggleAiPanel, 
    // HTTP setters
    setMethod, 
    setUrl, 
    setHeaders, 
    setQuery, 
    setBody,
    // gRPC setters
    setGrpcBody,
    setGrpcMetadata,
    // MCP setters
    setMcpHeaders,
    setMcpTool,
    setMcpResource,
    // OpenAI setters
    setOpenAIModel,
    setOpenAIChatInput,
    setOpenAIImagePrompt,
    setOpenAIImageFiles,
    setOpenAIAudioText,
    setOpenAIAudioVoice,
    setOpenAIEmbeddingsInput,
  } = useClient();

  const allSetters = {
    // HTTP
    setMethod,
    setUrl,
    setHeaders,
    setQuery,
    setBody,
    // gRPC
    setGrpcBody,
    setGrpcMetadata,
    // MCP
    setMcpHeaders,
    setMcpTool,
    setMcpResource,
    // OpenAI
    setOpenAIModel,
    setOpenAIChatInput,
    setOpenAIImagePrompt,
    setOpenAIImageFiles,
    setOpenAIAudioText,
    setOpenAIAudioVoice,
    setOpenAIEmbeddingsInput,
  };

  return (
    <div className="flex h-screen bg-bg text-fg">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Request Panel */}
        <div className="flex-1 overflow-hidden min-h-0">
          <RequestPanel />
        </div>
      </div>

      {/* Chat Panel - key forces remount on protocol/request change so useChat
          rebuilds with the right tools/connection (the library doesn't update them). */}
      {aiPanelOpen && getConfig().ai?.model && (
        <ChatPanel
          key={`${request.protocol}:${request.id}`}
          isOpen={aiPanelOpen}
          onClose={toggleAiPanel}
          request={request}
          setters={allSetters}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <ClientProvider>
      <RequestBarPortalProvider>
        <AppContent />
      </RequestBarPortalProvider>
    </ClientProvider>
  );
}

export default App
