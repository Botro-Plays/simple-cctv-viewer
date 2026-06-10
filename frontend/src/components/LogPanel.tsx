import React, { useEffect, useRef, useState, useCallback } from 'react';
import { electronAPI } from '../lib/api';
import { X, Trash2, Copy, CheckCheck, ChevronDown, GripHorizontal } from 'lucide-react';

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

interface LogPanelProps {
  onClose: () => void;
}

export default function LogPanel({ onClose }: LogPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Draggable state
  const [pos, setPos] = useState(() => ({
    x: Math.max(0, window.innerWidth - 660),
    y: 60,
  }));
  const [size] = useState({ w: 640, h: 400 });
  const dragData = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

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

  // Global drag handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragData.current) return;
      const dx = e.clientX - dragData.current.sx;
      const dy = e.clientY - dragData.current.sy;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - size.w, dragData.current.px + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 40, dragData.current.py + dy)),
      });
    };
    const onUp = () => { dragData.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [size.w]);

  const handleDragStart = (e: React.MouseEvent) => {
    dragData.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  };

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
    <div
      className="fixed flex flex-col bg-[#0d0d0d] border border-white/15 rounded-lg shadow-2xl text-[13px] font-mono select-none overflow-hidden"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex: 9999 }}
    >
      {/* Title / Drag bar */}
      <div
        className="shrink-0 flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border-b border-white/10 cursor-grab active:cursor-grabbing"
        onMouseDown={handleDragStart}
      >
        <GripHorizontal className="w-4 h-4 text-white/30 shrink-0" />
        <span className="text-xs font-semibold text-white/70 flex-1">Logs</span>

        {/* Filters */}
        <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
          {(['all', 'info', 'warn', 'error'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                filter === f
                  ? f === 'all'  ? 'bg-white/20 text-white'
                  : f === 'info' ? 'bg-green-700 text-green-100'
                  : f === 'warn' ? 'bg-yellow-700 text-yellow-100'
                  :                'bg-red-800 text-red-100'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {f === 'all' ? `ALL·${logs.length}` : `${f.slice(0,1).toUpperCase()}·${counts[f as keyof typeof counts]}`}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={handleCopy}
            title="Copy to clipboard"
            className="p-1 text-white/40 hover:text-white/80 rounded transition-colors"
          >
            {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleClear}
            title="Clear logs"
            className="p-1 text-white/40 hover:text-red-400 rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            title="Close"
            className="p-1 text-white/40 hover:text-white rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log output */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-2 py-1 space-y-px"
      >
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/20 text-xs">
            No log entries
          </div>
        ) : (
          filtered.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-2 px-1 py-0.5 rounded hover:bg-white/5 transition-colors"
            >
              <span className="shrink-0 text-white/30 text-[10px] pt-px select-none w-[80px]">
                {formatTs(entry.ts)}
              </span>
              <span
                className={`shrink-0 text-[9px] font-bold px-1 rounded mt-px uppercase w-[36px] text-center ${LEVEL_BADGE[entry.level] ?? LEVEL_BADGE.debug}`}
              >
                {entry.level.slice(0, 3)}
              </span>
              <span className={`break-all leading-5 text-[12px] ${LEVEL_STYLES[entry.level] ?? 'text-gray-300'}`}>
                {entry.msg}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom hint */}
      {!autoScroll && (
        <div className="shrink-0 flex justify-center py-1 border-t border-white/10 bg-[#111]">
          <button
            onClick={() => {
              setAutoScroll(true);
              bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ChevronDown className="w-3 h-3" /> Scroll to bottom
          </button>
        </div>
      )}
    </div>
  );
}
