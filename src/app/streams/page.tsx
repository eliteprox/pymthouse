export const dynamic = "force-dynamic";

import { db } from "@/db/index";
import { streamSessions } from "@/db/schema";
import DashboardLayout from "@/components/DashboardLayout";
import StreamSessionTable from "@/components/StreamSessionTable";
import {
  ACTIVE_STREAM_PAYMENT_WINDOW_LABEL,
  getActiveStreamSessionsByRecentPayment,
} from "@/lib/active-streams";
import { streamSessionToTableRow } from "@/lib/stream-session-ui";
import { confirmedUsageCountByStreamSessionId } from "@/lib/stream-session-stats";

function sessionRecencyMs(s: { lastPaymentAt: string | null; startedAt: string }) {
  const t = s.lastPaymentAt ?? s.startedAt;
  return new Date(t).getTime();
}

export default async function StreamsPage() {
  const activeSessions = await getActiveStreamSessionsByRecentPayment();
  const activeSessionIds = new Set(activeSessions.map((session) => session.id));

  const allSessions = await db.select().from(streamSessions);
  const historicalSessions = allSessions
    .filter((s) => !activeSessionIds.has(s.id))
    .sort((a, b) => sessionRecencyMs(b) - sessionRecencyMs(a))
    .slice(0, 100);

  const usageCounts = await confirmedUsageCountByStreamSessionId([
    ...activeSessions.map((s) => s.id),
    ...historicalSessions.map((s) => s.id),
  ]);

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Streams</h2>
        <p className="text-zinc-500 mt-1">
          Active streams are based on recent confirmed payments
        </p>
      </div>

      <div className="border border-zinc-800 rounded-xl bg-zinc-900/30 mb-8">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="font-semibold text-zinc-200">Active Streams</h3>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-400">
            {activeSessions.length} {ACTIVE_STREAM_PAYMENT_WINDOW_LABEL}
          </span>
        </div>
        <StreamSessionTable
          sessions={activeSessions.map((s) =>
            streamSessionToTableRow(s, usageCounts),
          )}
        />
      </div>

      <div className="border border-zinc-800 rounded-xl bg-zinc-900/30">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="font-semibold text-zinc-200">Historical Sessions</h3>
        </div>
        <StreamSessionTable
          sessions={historicalSessions.map((s) =>
            streamSessionToTableRow(s, usageCounts),
          )}
        />
      </div>
    </DashboardLayout>
  );
}
