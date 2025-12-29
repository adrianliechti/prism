import { useApiClient } from '../context/ApiClientContext';
import { MethodSelector } from './MethodSelector';

export function UrlBar() {
  const { url, setUrl, executeRequest, isLoading } = useApiClient();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeRequest();
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-0">
      <MethodSelector />
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Enter request URL"
        className="flex-1 px-4 py-2 border border-l-0 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={isLoading || !url}
        className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-r-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {isLoading ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
}
