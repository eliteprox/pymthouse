export const dynamic = "force-dynamic";

import { db } from "@/db/index";
import { endUsers, sessions, streamSessions, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import StreamSessionTable from "@/components/StreamSessionTable";
import TransactionLog from "@/components/TransactionLog";
import UserActions from "@/components/UserActions";

function formatWei(wei: string): string {
  if (wei === "0") return "0 ETH";
  const value = BigInt(wei);
  const eth = Number(value) / 1e18;
  if (eth < 0.001) return `${wei} wei`;
  return `${eth.toFixed(6)} ETH`;
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = db
    .select()
    .from(endUsers)
    .where(eq(endUsers.id, id))
    .get();

  if (!user) notFound();

  const userTokens = db
    .select({
      id: sessions.id,
      label: sessions.label,
      scopes: sessions.scopes,
      expiresAt: sessions.expiresAt,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .where(eq(sessions.endUserId, id))
    .all();

  const userStreams = db
    .select()
    .from(streamSessions)
    .where(eq(streamSessions.endUserId, id))
    .all();

  const userTxns = db
    .select()
    .from(transactions)
    .where(eq(transactions.endUserId, id))
    .all();

  let totalUsage = 0n;
  for (const txn of userTxns) {
    if (txn.type === "usage") totalUsage += BigInt(txn.amountWei);
  }

  return (
    <DashboardLayout>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-2xl font-bold tracking-tight">
            {user.name || user.email || "End User"}
          </h2>
          <span
            className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${
              user.isActive
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "bg-red-500/20 text-red-400 border-red-500/30"
            }`}
          >
            {user.isActive ? "active" : "suspended"}
          </span>
        </div>
        {user.email && (
          <p className="text-zinc-500 text-sm">{user.email}</p>
        )}
        {user.walletAddress && (
          <p className="text-zinc-500 font-mono text-sm mt-0.5">
            {user.walletAddress}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/30">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
            Credit Balance
          </p>
          <p className="text-lg font-bold text-emerald-400">
            {formatWei(user.creditBalanceWei)}
          </p>
        </div>
        <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/30">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
            Total Usage
          </p>
          <p className="text-lg font-bold text-amber-400">
            {formatWei(totalUsage.toString())}
          </p>
        </div>
        <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/30">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
            Streams
          </p>
          <p className="text-lg font-bold text-blue-400">
            {userStreams.length}
          </p>
        </div>
        <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/30">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
            Gateway Tokens
          </p>
          <p className="text-lg font-bold text-cyan-400">
            {userTokens.length}
          </p>
        </div>
      </div>

      {/* Actions: issue token, add credits */}
      <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30 mb-8">
        <UserActions userId={id} />
      </div>

      {/* Active tokens */}
      <div className="border border-zinc-800 rounded-xl bg-zinc-900/30 mb-8">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="font-semibold text-zinc-200">Gateway Tokens</h3>
        </div>
        {userTokens.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">
            No tokens issued for this user
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="text-left py-3 px-4 font-medium">Label</th>
                  <th className="text-left py-3 px-4 font-medium">Scopes</th>
                  <th className="text-right py-3 px-4 font-medium">Expires</th>
                  <th className="text-right py-3 px-4 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {userTokens.map((tok) => (
                  <tr
                    key={tok.id}
                    className="hover:bg-zinc-900/50 transition-colors"
                  >
                    <td className="py-3 px-4 text-zinc-300">
                      {tok.label || tok.id.slice(0, 8)}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 text-xs">
                      {tok.scopes}
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-500 text-xs">
                      {new Date(tok.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-500 text-xs">
                      {new Date(tok.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stream sessions */}
      <div className="border border-zinc-800 rounded-xl bg-zinc-900/30 mb-8">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="font-semibold text-zinc-200">Stream Sessions</h3>
        </div>
        <StreamSessionTable sessions={userStreams} />
      </div>

      {/* Transactions */}
      <div className="border border-zinc-800 rounded-xl bg-zinc-900/30">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="font-semibold text-zinc-200">Transactions</h3>
        </div>
        <TransactionLog transactions={userTxns.slice(0, 50)} />
      </div>
    </DashboardLayout>
  );
}
