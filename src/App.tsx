import { ApiClientProvider } from './context/ApiClientContext';
import { useApiClient } from './context/useApiClient';
import { Sidebar } from './components/Sidebar';
import { RequestPanel } from './components/RequestPanel';
import { getStatusBadge, formatBytes } from './utils/format';

function StatusBar() {
  const { request } = useApiClient();

  if (!request?.response) {
    return null;
  }

  return (
    <div className="px-3 py-2 flex items-center gap-4 text-xs shrink-0">
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${getStatusBadge(request.response.statusCode)}`}>
        {request.response.statusCode > 0 ? request.response.status : 'Error'}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Time:</span>
        <span className="text-gray-200 font-medium">{request.response.duration}ms</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Size:</span>
        <span className="text-gray-200 font-medium">{formatBytes(new Blob([request.response.body]).size)}</span>
      </div>
    </div>
  );
}

function AppContent() {
  return (
    <div className="h-screen flex bg-[#0d0d0d] py-2 pr-2 pl-1 gap-2">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden gap-2">
        {/* Request Panel */}
        <div className="flex-1 overflow-hidden min-h-0">
          <RequestPanel />
        </div>

        {/* Status Bar - Fixed at bottom */}
        <StatusBar />
      </div>
    </div>
  );
}

function App() {
  return (
    <ApiClientProvider>
      <AppContent />
    </ApiClientProvider>
  );
}

export default App
