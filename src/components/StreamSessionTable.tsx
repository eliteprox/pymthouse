"use client";

interface StreamSessionRow {
  id: string;
  manifestId: string;
  orchestratorAddress: string | null;
  totalPixels: number;
  totalFeeWei: string;
  status: string;
  startedAt: string;
  lastPaymentAt: string | null;
  endedAt: string | null;
}

interface StreamSessionTableProps {
  sessions: StreamSessionRow[];
}

function formatWei(wei: string): string {
  if (wei === "0") return "0";
  const value = BigInt(wei);
  const eth = Number(value) / 1e18;
  if (eth < 0.0001) return `${wei} wei`;
  return `${eth.toFixed(6)} ETH`;
}

function formatPixels(pixels: number): string {
  if (pixels >= 1e12) return `${(pixels / 1e12).toFixed(2)}T`;
  if (pixels >= 1e9) return `${(pixels / 1e9).toFixed(2)}B`;
  if (pixels >= 1e6) return `${(pixels / 1e6).toFixed(2)}M`;
  if (pixels >= 1e3) return `${(pixels / 1e3).toFixed(1)}K`;
  return pixels.toString();
}

function truncateAddress(addr: string | null): string {
  if (!addr) return "-";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const statusBadge: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400",
  ended: "bg-zinc-500/20 text-zinc-400",
  error: "bg-red-500/20 text-red-400",
};

export default function StreamSessionTable({
  sessions,
}: StreamSessionTableProps) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <p>No stream sessions found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
            <th className="text-left py-3 px-4 font-medium">Manifest ID</th>
            <th className="text-left py-3 px-4 font-medium">Orchestrator</th>
            <th className="text-right py-3 px-4 font-medium">Pixels</th>
            <th className="text-right py-3 px-4 font-medium">Fee</th>
            <th className="text-center py-3 px-4 font-medium">Status</th>
            <th className="text-right py-3 px-4 font-medium">Started</th>
            <th className="text-right py-3 px-4 font-medium">Last Payment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {sessions.map((s) => (
            <tr
              key={s.id}
              className="hover:bg-zinc-900/50 transition-colors"
            >
              <td className="py-3 px-4 font-mono text-zinc-300 text-xs">
                {s.manifestId.length > 16
                  ? `${s.manifestId.slice(0, 8)}...${s.manifestId.slice(-4)}`
                  : s.manifestId}
              </td>
              <td className="py-3 px-4 font-mono text-zinc-400 text-xs">
                {truncateAddress(s.orchestratorAddress)}
              </td>
              <td className="py-3 px-4 text-right text-zinc-300">
                {formatPixels(s.totalPixels)}
              </td>
              <td className="py-3 px-4 text-right text-zinc-300 font-mono">
                {formatWei(s.totalFeeWei)}
              </td>
              <td className="py-3 px-4 text-center">
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    statusBadge[s.status] || statusBadge.ended
                  }`}
                >
                  {s.status}
                </span>
              </td>
              <td className="py-3 px-4 text-right text-zinc-500 text-xs">
                {timeAgo(s.startedAt)}
              </td>
              <td className="py-3 px-4 text-right text-zinc-500 text-xs">
                {s.lastPaymentAt ? timeAgo(s.lastPaymentAt) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
