export const dynamic = "force-dynamic";

import { db } from "@/db/index";
import { transactions, endUsers } from "@/db/schema";
import DashboardLayout from "@/components/DashboardLayout";
import TransactionLog from "@/components/TransactionLog";

function formatWei(wei: string): string {
  if (wei === "0") return "0 ETH";
  const value = BigInt(wei);
  const eth = Number(value) / 1e18;
  if (eth < 0.001) return `${wei} wei`;
  return `${eth.toFixed(6)} ETH`;
}

export default function BillingPage() {
  const allTxns = db.select().from(transactions).all();
  const allEndUsers = db.select().from(endUsers).all();

  let totalVolume = 0n;
  let totalPlatformCut = 0n;
  const byType: Record<string, { count: number; volume: bigint }> = {};

  for (const txn of allTxns) {
    const amount = BigInt(txn.amountWei);
    totalVolume += amount;
    totalPlatformCut += BigInt(txn.platformCutWei || "0");

    if (!byType[txn.type]) {
      byType[txn.type] = { count: 0, volume: 0n };
    }
    byType[txn.type].count++;
    byType[txn.type].volume += amount;
  }

  // Per-user breakdown
  const userSummaries = allEndUsers.map((user) => {
    const userTxns = allTxns.filter((t) => t.endUserId === user.id);
    let userVolume = 0n;
    for (const t of userTxns) {
      userVolume += BigInt(t.amountWei);
    }
    return {
      ...user,
      transactionCount: userTxns.length,
      totalVolume: userVolume.toString(),
    };
  });

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Billing</h2>
        <p className="text-zinc-500 mt-1">
          Transaction history and revenue overview
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
            Total Volume
          </p>
          <p className="text-xl font-bold text-amber-400">
            {formatWei(totalVolume.toString())}
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            {allTxns.length} transactions
          </p>
        </div>
        <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
            Platform Revenue
          </p>
          <p className="text-xl font-bold text-emerald-400">
            {formatWei(totalPlatformCut.toString())}
          </p>
          <p className="text-xs text-zinc-600 mt-1">total cut earned</p>
        </div>
        <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
            Usage Payments
          </p>
          <p className="text-xl font-bold text-blue-400">
            {byType["usage"]?.count || 0}
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            {formatWei((byType["usage"]?.volume || 0n).toString())}
          </p>
        </div>
        <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
            Prepay Credits
          </p>
          <p className="text-xl font-bold text-purple-400">
            {byType["prepay_credit"]?.count || 0}
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            {formatWei(
              (byType["prepay_credit"]?.volume || 0n).toString()
            )}
          </p>
        </div>
      </div>

      {userSummaries.filter((u) => u.transactionCount > 0).length > 0 && (
        <div className="border border-zinc-800 rounded-xl bg-zinc-900/30 mb-8">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h3 className="font-semibold text-zinc-200">
              Per-User Breakdown
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="text-left py-3 px-4 font-medium">User</th>
                  <th className="text-right py-3 px-4 font-medium">Transactions</th>
                  <th className="text-right py-3 px-4 font-medium">Volume</th>
                  <th className="text-right py-3 px-4 font-medium">Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {userSummaries
                  .filter((u) => u.transactionCount > 0)
                  .map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-900/50 transition-colors">
                      <td className="py-3 px-4">
                        <p className="text-zinc-200 font-medium">
                          {u.name || u.email || u.id.slice(0, 8)}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right text-zinc-300">
                        {u.transactionCount}
                      </td>
                      <td className="py-3 px-4 text-right text-zinc-300 font-mono text-xs">
                        {formatWei(u.totalVolume)}
                      </td>
                      <td className="py-3 px-4 text-right text-zinc-300 font-mono text-xs">
                        {formatWei(u.creditBalanceWei)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="border border-zinc-800 rounded-xl bg-zinc-900/30">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="font-semibold text-zinc-200">Transaction History</h3>
        </div>
        <TransactionLog transactions={allTxns.slice(0, 100)} />
      </div>
    </DashboardLayout>
  );
}
