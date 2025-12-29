import { useState } from 'react';
import { useApiClient } from '../context/ApiClientContext';
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

export function RequestTabs() {
  const [activeTab, setActiveTab] = useState<Tab>('params');
  const {
    headers,
    setHeaders,
    queryParams,
    setQueryParams,
    bodyType,
    setBodyType,
    bodyContent,
    setBodyContent,
    formData,
    setFormData,
  } = useApiClient();

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'params', label: 'Query Params', count: queryParams.filter(p => p.key).length },
    { id: 'headers', label: 'Headers', count: headers.filter(h => h.key).length },
    { id: 'body', label: 'Body' },
  ];

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      {/* Tab Headers */}
      <div className="flex border-b border-gray-300 bg-gray-50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-600 border-b-2 border-blue-600 bg-white -mb-px'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-gray-200 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === 'params' && (
          <KeyValueEditor
            items={queryParams}
            onChange={setQueryParams}
            keyPlaceholder="Parameter"
            valuePlaceholder="Value"
          />
        )}

        {activeTab === 'headers' && (
          <KeyValueEditor
            items={headers}
            onChange={setHeaders}
            keyPlaceholder="Header"
            valuePlaceholder="Value"
          />
        )}

        {activeTab === 'body' && (
          <div className="space-y-4">
            {/* Body Type Selector */}
            <div className="flex gap-4">
              {bodyTypes.map((type) => (
                <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="bodyType"
                    value={type.value}
                    checked={bodyType === type.value}
                    onChange={() => setBodyType(type.value)}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{type.label}</span>
                </label>
              ))}
            </div>

            {/* Body Content */}
            {bodyType === 'none' && (
              <p className="text-sm text-gray-500 italic">This request does not have a body</p>
            )}

            {(bodyType === 'json' || bodyType === 'raw') && (
              <textarea
                value={bodyContent}
                onChange={(e) => setBodyContent(e.target.value)}
                placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Enter raw body content'}
                className="w-full h-48 px-3 py-2 font-mono text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
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
          </div>
        )}
      </div>
    </div>
  );
}
