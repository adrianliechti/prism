import { useState } from 'react';
import { useClient } from '../context/useClient';
import { KeyValueEditor } from './KeyValueEditor';
import { CodeEditor } from './CodeEditor';
import type { RequestBody } from '../types/types';

type Tab = 'headers' | 'params' | 'body';

type BodyType = RequestBody['type'];

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
    setBody,
  } = useClient();

  const headers = request?.headers ?? [];
  const query = request?.query ?? [];
  const body = request?.body ?? { type: 'none' as const };

  const handleBodyTypeChange = (type: BodyType) => {
    switch (type) {
      case 'none':
        setBody({ type: 'none' });
        break;
      case 'json':
        setBody({ type: 'json', content: body.type === 'json' ? body.content : '' });
        break;
      case 'raw':
        setBody({ type: 'raw', content: body.type === 'raw' ? body.content : '' });
        break;
      case 'form-urlencoded':
        setBody({ type: 'form-urlencoded', data: body.type === 'form-urlencoded' ? body.data : [{ id: Math.random().toString(36).substring(2, 9), enabled: true, key: '', value: '' }] });
        break;
      case 'form-data':
        setBody({ type: 'form-data', data: body.type === 'form-data' ? body.data : [{ id: Math.random().toString(36).substring(2, 9), enabled: true, key: '', value: '' }] });
        break;
    }
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'params', label: 'Params', count: query.filter(p => p.key).length },
    { id: 'headers', label: 'Headers', count: headers.filter(h => h.key).length },
    { id: 'body', label: 'Body' },
  ];

  return (
    <div className="space-y-3">
      {/* Tab Headers */}
      <div className="flex items-center gap-2">
        <div role="tablist" className="inline-flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              onClick={() => setActiveTabId(tab.id)}
              className={`px-2 py-1 text-[11px] font-medium rounded-md transition-all ${
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
        {activeTabId === 'body' && (
          <select
            value={body.type}
            onChange={(e) => handleBodyTypeChange(e.target.value as BodyType)}
            className="px-2 py-1 text-[11px] bg-transparent text-gray-500 focus:outline-none cursor-pointer"
          >
            {bodyTypes.map((type) => (
              <option key={type.value} value={type.value} className="bg-[#1a1a1a]">
                {type.label}
              </option>
            ))}
          </select>
        )}
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

        {activeTabId === 'body' && body.type !== 'none' && (
          <>
            {(body.type === 'json' || body.type === 'raw') && (
              <CodeEditor
                value={body.content}
                onChange={(content) => setBody({ ...body, content })}
                language={body.type === 'json' ? 'json' : 'text'}
                placeholder={body.type === 'json' ? '{\n  "key": "value"\n}' : 'Enter raw body content'}
              />
            )}

            {(body.type === 'form-urlencoded' || body.type === 'form-data') && (
              <KeyValueEditor
                items={body.data}
                onChange={(data) => setBody({ ...body, data })}
                keyPlaceholder="Field"
                valuePlaceholder="Value"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
