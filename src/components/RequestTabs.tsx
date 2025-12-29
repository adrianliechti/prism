import { useState } from 'react';
import { useApiClient } from '../context/useApiClient';
import { KeyValueEditor } from './KeyValueEditor';
import type { BodyType } from '../types/api';

type Tab = 'headers' | 'params' | 'body';

const bodyTypes: { value: BodyType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'form-urlencoded', label: 'Form URL Encoded' },
  { value: 'form-data', label: 'Form Data' },
  { value: 'raw', label: 'Raw' },
];

const commonHttpHeaders = [
  'Accept',
  'Accept-Charset',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Disposition',
  'Content-Encoding',
  'Content-Length',
  'Content-Type',
  'Cookie',
  'Date',
  'ETag',
  'Expect',
  'Forwarded',
  'From',
  'Host',
  'If-Match',
  'If-Modified-Since',
  'If-None-Match',
  'If-Range',
  'If-Unmodified-Since',
  'Max-Forwards',
  'Origin',
  'Pragma',
  'Proxy-Authorization',
  'Range',
  'Referer',
  'TE',
  'Trailer',
  'Transfer-Encoding',
  'Upgrade',
  'User-Agent',
  'Via',
  'Warning',
  'X-Api-Key',
  'X-Correlation-ID',
  'X-Forwarded-For',
  'X-Forwarded-Host',
  'X-Forwarded-Proto',
  'X-Request-ID',
  'X-Requested-With',
];

export function RequestTabs() {
  const [activeTabId, setActiveTabId] = useState<Tab>('params');
  const {
    request,
    setHeaders,
    setQuery,
    setBodyType,
    setBodyContent,
    setFormData,
  } = useApiClient();

  const headers = request?.headers ?? [];
  const query = request?.query ?? [];
  const bodyType = request?.bodyType ?? 'none';
  const bodyContent = request?.bodyContent ?? '';
  const formData = request?.formData ?? [];

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'params', label: 'Params', count: query.filter(p => p.key).length },
    { id: 'headers', label: 'Headers', count: headers.filter(h => h.key).length },
    { id: 'body', label: 'Body' },
  ];

  return (
    <div className="space-y-3">
      {/* Tab Headers */}
      <div role="tablist" className="inline-flex gap-1 p-0.5 bg-white/5 rounded-lg">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            onClick={() => setActiveTabId(tab.id)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
              activeTabId === tab.id
                ? 'bg-white/10 text-gray-100'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[9px] bg-white/10 text-gray-300 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTabId === 'params' && (
          <KeyValueEditor
            items={query}
            onChange={setQuery}
            keyPlaceholder="Parameter"
            valuePlaceholder="Value"
          />
        )}

        {activeTabId === 'headers' && (
          <KeyValueEditor
            items={headers}
            onChange={setHeaders}
            keyPlaceholder="Header"
            valuePlaceholder="Value"
            keySuggestions={commonHttpHeaders}
          />
        )}

        {activeTabId === 'body' && (
          <div className="space-y-3">
            {/* Body Type Selector */}
            <select
              value={bodyType}
              onChange={(e) => setBodyType(e.target.value as BodyType)}
              className="px-3 py-1.5 text-xs bg-white/5 text-gray-100 border border-white/10 rounded-lg focus:outline-none focus:border-white/20 transition-colors"
            >
              {bodyTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>

            {/* Body Content */}
            {bodyType !== 'none' && (
              <>
                {(bodyType === 'json' || bodyType === 'raw') && (
                  <textarea
                    value={bodyContent}
                    onChange={(e) => setBodyContent(e.target.value)}
                    placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Enter raw body content'}
                    className="w-full h-48 px-3 py-2 font-mono text-xs bg-white/5 text-gray-100 border border-white/10 rounded-lg focus:outline-none focus:border-white/20 resize-y placeholder-gray-500 transition-colors"
                  />
                )}

                {(bodyType === 'form-urlencoded' || bodyType === 'form-data') && (
                  <KeyValueEditor
                    items={formData}
                    onChange={setFormData}
                    keyPlaceholder="Field"
                    valuePlaceholder="Value"
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
