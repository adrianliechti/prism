import { ApiClientProvider } from './context/ApiClientContext';
import { UrlBar } from './components/UrlBar';
import { RequestTabs } from './components/RequestTabs';
import { ResponseViewer } from './components/ResponseViewer';

function App() {
  return (
    <ApiClientProvider>
      <div className="min-h-screen bg-gray-100">
        <div className="max-w-6xl mx-auto p-6">
          {/* Header */}
          <header className="mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Prism</h1>
            <p className="text-sm text-gray-600">API Client</p>
          </header>

          {/* Main Content */}
          <div className="space-y-4">
            {/* URL Bar */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <UrlBar />
            </div>

            {/* Request Configuration */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <RequestTabs />
            </div>

            {/* Response */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">Response</h2>
              <ResponseViewer />
            </div>
          </div>
        </div>
      </div>
    </ApiClientProvider>
  );
}

export default App
