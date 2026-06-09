import React, { useEffect, useRef, useState, useCallback } from 'react';
import { electronAPI } from '../lib/api';
import { Trash2, Copy, CheckCheck, ChevronDown } from 'lucide-react';
import { Button } from '../components/ui/button';

interface LogEntry {
  id: number;
  ts: string;
  level: string;
  msg: string;
}

type Filter = 'all' | 'info' | 'warn' | 'error';

const LEVEL_STYLES: Record<string, string> = {
  info:  'text-green-400',
  warn:  'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-gray-400',
};

const LEVEL_BADGE: Record<string, string> = {
  info:  'bg-green-900/60 text-green-300',
  warn:  'bg-yellow-900/60 text-yellow-300',
  error: 'bg-red-900/60 text-red-300',
  debug: 'bg-gray-700/60 text-gray-300',
};

function formatTs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    electronAPI.getLogs().then((initial: LogEntry[]) => {
      setLogs(initial);
    }).catch(() => {});

    electronAPI.onLog((entry: LogEntry) => {
      setLogs((prev) => {
        const next = [...prev, entry];
        return next.length > 500 ? next.slice(next.length - 500) : next;
      });
    });

    return () => {
      electronAPI.removeLogListener();
    };
  }, []);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const handleClear = () => {
    electronAPI.clearLogs();
    setLogs([]);
  };

  const handleCopy = () => {
    const text = filtered
      .map((e) => `[${e.ts}] [${e.level.toUpperCase()}] ${e.msg}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const counts = {
    info:  logs.filter((l) => l.level === 'info').length,
    warn:  logs.filter((l) => l.level === 'warn').length,
    error: logs.filter((l) => l.level === 'error').length,
  };

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.level === filter);

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d] text-[13px] font-mono">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-[#111] flex-wrap">
        {/* Filter buttons */}
        <div className="flex items-center gap-1">
          {(['all', 'info', 'warn', 'error'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                filter === f
                  ? f === 'all'    ? 'bg-white/20 text-white'
                  : f === 'info'   ? 'bg-green-700 text-green-100'
                  : f === 'warn'   ? 'bg-yellow-700 text-yellow-100'
                  :                  'bg-red-800 text-red-100'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {f === 'all'
                ? `ALL (${logs.length})`
                : `${f.toUpperCase()} (${counts[f as keyof typeof counts]})`}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Auto-scroll indicator */}
        {!autoScroll && (
          <button
            onClick={() => {
              setAutoScroll(true);
              bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ChevronDown className="w-3 h-3" /> Scroll to bottom
          </button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 px-2 text-[11px] text-white/60 hover:text-white"
        >
          {copied ? <CheckCheck className="w-3 h-3 mr-1 text-green-400" /> : <Copy className="w-3 h-3 mr-1" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="h-6 px-2 text-[11px] text-white/60 hover:text-red-400"
        >
          <Trash2 className="w-3 h-3 mr-1" /> Clear
        </Button>
      </div>

      {/* Log output */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-2 py-1 space-y-px"
      >
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/20">
            No log entries
          </div>
        ) : (
          filtered.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-2 px-1 py-0.5 rounded hover:bg-white/5 transition-colors group"
            >
              <span className="shrink-0 text-white/30 text-[11px] pt-px select-none w-[88px]">
                {formatTs(entry.ts)}
              </span>
              <span
                className={`shrink-0 text-[10px] font-bold px-1 rounded mt-px uppercase w-[40px] text-center ${LEVEL_BADGE[entry.level] ?? LEVEL_BADGE.debug}`}
              >
                {entry.level.slice(0, 3)}
              </span>
              <span className={`break-all leading-5 ${LEVEL_STYLES[entry.level] ?? 'text-gray-300'}`}>
                {entry.msg}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
