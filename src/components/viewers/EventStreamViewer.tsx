import { useState, useEffect, useMemo } from 'react';
import { codeToHtml } from 'shiki';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SSEViewerProps {
  content: Blob;
}

interface SSEEvent {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
  raw: string;
}

function usePrefersDarkMode() {
  const [prefersDark, setPrefersDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersDark;
}

function parseSSEEvents(text: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const rawEvents = text.split(/\n\n+/);

  for (const rawEvent of rawEvents) {
    if (!rawEvent.trim()) continue;

    const event: SSEEvent = { data: '', raw: rawEvent };
    const lines = rawEvent.split('\n');

    for (const line of lines) {
      if (line.startsWith('id:')) {
        event.id = line.slice(3).trim();
      } else if (line.startsWith('event:')) {
        event.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        event.data += (event.data ? '\n' : '') + line.slice(5).trim();
      } else if (line.startsWith('retry:')) {
        event.retry = parseInt(line.slice(6).trim(), 10);
      }
    }

    if (event.data || event.event || event.id) {
      events.push(event);
    }
  }

  return events;
}

function tryParseJson(str: string): object | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function EventStreamCard({ event, index, prefersDark }: { event: SSEEvent; index: number; prefersDark: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const [highlightedData, setHighlightedData] = useState<string>('');

  const parsedJson = useMemo(() => tryParseJson(event.data), [event.data]);

  useEffect(() => {
    const highlight = async () => {
      if (parsedJson) {
        try {
          const formatted = JSON.stringify(parsedJson, null, 2);
          const html = await codeToHtml(formatted, {
            lang: 'json',
            theme: prefersDark ? 'github-dark' : 'github-light',
          });
          setHighlightedData(html);
        } catch {
          setHighlightedData(`<pre>${JSON.stringify(parsedJson, null, 2)}</pre>`);
        }
      }
    };
    highlight();
  }, [parsedJson, prefersDark]);

  return (
    <div className="border border-neutral-200 dark:border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-neutral-50 dark:bg-white/5 hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-neutral-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-neutral-400" />
        )}
        <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
          #{index + 1}
        </span>
        {event.event && (
          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded">
            {event.event}
          </span>
        )}
        {event.id && (
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            id: {event.id}
          </span>
        )}
        {parsedJson && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded">
            JSON
          </span>
        )}
      </button>
      {expanded && (
        <div className="p-3 bg-white dark:bg-transparent">
          {parsedJson && highlightedData ? (
            <div
              className="text-xs [&_pre]:bg-transparent! [&_pre]:p-0! [&_pre]:m-0! [&_pre]:overflow-visible! [&_code]:bg-transparent! [&_code]:block!"
              dangerouslySetInnerHTML={{ __html: highlightedData }}
            />
          ) : (
            <pre className="text-xs font-mono text-neutral-700 dark:text-neutral-200 whitespace-pre-wrap">
              {event.data}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function EventStreamViewer({ content }: SSEViewerProps) {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [rawText, setRawText] = useState<string>('');
  const prefersDark = usePrefersDarkMode();

  useEffect(() => {
    content.text().then((text) => {
      setRawText(text);
      setEvents(parseSSEEvents(text));
    });
  }, [content]);

  if (events.length === 0) {
    return (
      <pre className="text-xs font-mono text-neutral-700 dark:text-neutral-200 whitespace-pre-wrap">
        {rawText}
      </pre>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
      </div>
      {events.map((event, index) => (
        <EventStreamCard key={index} event={event} index={index} prefersDark={prefersDark} />
      ))}
    </div>
  );
}
