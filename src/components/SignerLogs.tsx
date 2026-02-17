"use client";

import { useEffect, useState, useRef } from "react";

export default function SignerLogs() {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [tail, setTail] = useState(50);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function fetchLogs() {
    try {
      const res = await fetch(`/api/v1/signer/logs?tail=${tail}`);
      if (res.ok) {
        const data = await res.json();
        setLines(data.lines);
      }
    } catch {
      setLines(["Failed to fetch logs"]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, [tail]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, tail]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  function classifyLine(line: string): string {
    if (line.startsWith("E0") || line.includes("Error") || line.includes("error"))
      return "text-red-400";
    if (line.startsWith("W0") || line.includes("Warning") || line.includes("warn"))
      return "text-amber-400";
    if (line.startsWith("I0")) return "text-zinc-400";
    if (line.startsWith("*") || line.startsWith("|")) return "text-zinc-500";
    return "text-zinc-400";
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-zinc-200">Container Logs</h3>
        <div className="flex items-center gap-3">
          <select
            value={tail}
            onChange={(e) => setTail(parseInt(e.target.value))}
            className="px-2 py-1 bg-zinc-800/50 border border-zinc-700 rounded text-xs text-zinc-300 focus:outline-none"
          >
            <option value={25}>25 lines</option>
            <option value={50}>50 lines</option>
            <option value={100}>100 lines</option>
            <option value={200}>200 lines</option>
          </select>

          <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-zinc-600"
            />
            Auto-refresh
          </label>

          <button
            onClick={fetchLogs}
            className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 font-mono text-xs leading-relaxed max-h-96 overflow-auto"
      >
        {loading ? (
          <p className="text-zinc-500 animate-pulse">Loading logs...</p>
        ) : lines.length === 0 ? (
          <p className="text-zinc-500">No logs available</p>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={`${classifyLine(line)} whitespace-pre-wrap`}>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
