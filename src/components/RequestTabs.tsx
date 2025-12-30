import { useState } from 'react';
import { useClient } from '../context/useClient';
import { KeyValueEditor } from './KeyValueEditor';
import { FormDataEditor } from './FormDataEditor';
import { BinaryUploader } from './BinaryUploader';
import { CodeEditor } from './CodeEditor';
import { JsonEditor } from './JsonEditor';
import type { RequestBody, FormDataField } from '../types/types';

type Tab = 'headers' | 'params' | 'body';

type BodyType = RequestBody['type'];

const bodyTypes: { value: BodyType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'form-urlencoded', label: 'Form' },
  { value: 'form-data', label: 'Form Data' },
  { value: 'binary', label: 'Binary' },
  { value: 'raw', label: 'Raw' },
];

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function createEmptyFormDataField(): FormDataField {
  return { id: generateId(), enabled: true, key: '', type: 'text', value: '', file: null, fileName: '' };
}

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
  const [activeTabId, setActiveTabId] = useState<Tab>('body');
  const {
    request,
    setHeaders,
    setQuery,
    setBody,
    setVariables,
  } = useClient();

  const headers = request?.headers ?? [];
  const query = request?.query ?? [];
  const body = request?.body ?? { type: 'none' as const };
  const variables = request?.variables ?? [];

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
        setBody({ type: 'form-urlencoded', data: body.type === 'form-urlencoded' ? body.data : [{ id: generateId(), enabled: true, key: '', value: '' }] });
        break;
      case 'form-data':
        setBody({ type: 'form-data', data: body.type === 'form-data' ? body.data : [createEmptyFormDataField()] });
        break;
      case 'binary':
        setBody({ type: 'binary', file: body.type === 'binary' ? body.file : null, fileName: body.type === 'binary' ? body.fileName : '' });
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
                  ? 'bg-white dark:bg-white/10 text-neutral-800 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[9px] bg-neutral-200 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 rounded-full">
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
            className="h-6 px-2 text-[11px] font-medium bg-white dark:bg-white/10 text-neutral-800 dark:text-neutral-100 rounded-md shadow-sm border-0 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-white/20 cursor-pointer transition-all min-w-30"
          >
            {bodyTypes.map((type) => (
              <option key={type.value} value={type.value} className="bg-white dark:bg-[#1a1a1a]">
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
            {body.type === 'json' && (
              <JsonEditor
                value={body.content}
                onChange={(content) => setBody({ ...body, content })}
                variables={variables}
                onVariablesChange={setVariables}
                placeholder={'{\n  "key": "value"\n}'}
              />
            )}

            {body.type === 'raw' && (
              <CodeEditor
                value={body.content}
                onChange={(content) => setBody({ ...body, content })}
                language="text"
                placeholder="Enter raw body content"
              />
            )}

            {body.type === 'form-urlencoded' && (
              <KeyValueEditor
                items={body.data}
                onChange={(data) => setBody({ ...body, data })}
                keyPlaceholder="Field"
                valuePlaceholder="Value"
              />
            )}

            {body.type === 'form-data' && (
              <FormDataEditor
                items={body.data}
                onChange={(data) => setBody({ ...body, data })}
                keyPlaceholder="Field"
                valuePlaceholder="Value"
              />
            )}

            {body.type === 'binary' && (
              <BinaryUploader
                file={body.file}
                fileName={body.fileName}
                onFileChange={(file, fileName) => setBody({ ...body, file, fileName })}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
