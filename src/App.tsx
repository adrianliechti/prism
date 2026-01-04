import { ClientProvider } from './context/ClientContext';
import { RequestBarPortalProvider } from './context/RequestBarPortal';
import { useClient } from './context/useClient';
import { Sidebar } from './components/Sidebar';
import { RequestPanel } from './components/RequestPanel';
import { ChatPanel } from './components/ChatPanel';
import { getConfig } from './config';

function AppContent() {
  const { request, aiPanelOpen, toggleAiPanel, setMethod, setUrl, setHeaders, setQuery, setBody } = useClient();

  return (
    <div className="h-screen flex bg-neutral-50 dark:bg-[#0d0d0d] py-2 pr-2 pl-1 gap-2 text-neutral-900 dark:text-neutral-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden gap-2 min-w-0">
        {/* Request Panel */}
        <div className="flex-1 overflow-hidden min-h-0">
          <RequestPanel />
        </div>
      </div>

      {/* Chat Panel - Inline */}
      {aiPanelOpen && getConfig().ai?.model && (
        <ChatPanel
          isOpen={aiPanelOpen}
          onClose={toggleAiPanel}
          request={request}
          setters={{ setMethod, setUrl, setHeaders, setQuery, setBody }}
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
