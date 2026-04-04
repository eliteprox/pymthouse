"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";

interface UsageData {
  appId: string;
  billingPattern: string;
  period: { start: string | null; end: string | null };
  totals: {
    transactionCount: number;
    totalFeeWei: string;
    platformCutWei: string;
  };
  byUser?: {
    endUserId: string;
    externalUserId: string | null;
    feeWei: string;
    transactionCount: number;
  }[];
}

function formatWei(wei: string): string {
  const value = BigInt(wei);
  if (value === 0n) return "0";
  const eth = Number(value) / 1e18;
  if (eth < 0.0001) return `${value.toString()} wei`;
  return `${eth.toFixed(6)} ETH`;
}

export default function UsageDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [appName, setAppName] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/v1/apps/${id}`).then((r) => r.json()),
      fetch(`/api/v1/apps/${id}/usage?groupBy=user`).then((r) => r.json()),
    ])
      .then(([appData, usageData]) => {
        setAppName(appData.name || "App");
        setUsage(usageData);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="text-zinc-500 text-center py-12 animate-pulse">
          Loading usage data...
        </div>
      </DashboardLayout>
    );
  }

  if (!usage) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-lg font-medium text-zinc-300">No usage data</h2>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-8">
        <button
          onClick={() => router.push(`/apps/${id}/settings`)}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-3 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Settings
        </button>
        <h1 className="text-2xl font-bold text-zinc-100">Usage Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Usage analytics for {appName}
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Transactions</p>
          <p className="text-2xl font-bold text-zinc-100">{usage.totals.transactionCount}</p>
        </div>
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Total Fees</p>
          <p className="text-2xl font-bold text-zinc-100">{formatWei(usage.totals.totalFeeWei)}</p>
        </div>
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Platform Cut</p>
          <p className="text-2xl font-bold text-zinc-100">{formatWei(usage.totals.platformCutWei)}</p>
        </div>
      </div>

      {/* Billing Pattern Badge */}
      <div className="mb-6">
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
          usage.billingPattern === "per_user"
            ? "bg-violet-500/20 text-violet-400"
            : "bg-emerald-500/20 text-emerald-400"
        }`}>
          {usage.billingPattern === "per_user" ? "Per-User Attribution" : "App-Level Billing"}
        </span>
      </div>

      {/* Per-User Breakdown */}
      {usage.billingPattern === "per_user" && usage.byUser && usage.byUser.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-200">Per-User Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-medium">External User ID</th>
                  <th className="text-left px-5 py-3 font-medium">PymtHouse ID</th>
                  <th className="text-right px-5 py-3 font-medium">Transactions</th>
                  <th className="text-right px-5 py-3 font-medium">Total Fees</th>
                </tr>
              </thead>
              <tbody>
                {usage.byUser.map((user) => (
                  <tr key={user.endUserId} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                    <td className="px-5 py-3">
                      <code className="text-xs text-zinc-300">{user.externalUserId || "—"}</code>
                    </td>
                    <td className="px-5 py-3">
                      <code className="text-xs text-zinc-500">{user.endUserId.slice(0, 8)}...</code>
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-300">{user.transactionCount}</td>
                    <td className="px-5 py-3 text-right text-zinc-300">{formatWei(user.feeWei)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {usage.billingPattern === "app_level" && (
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 text-center">
          <p className="text-sm text-zinc-500">
            App-level billing does not track per-user usage. All usage is attributed to the app.
          </p>
        </div>
      )}

      {usage.billingPattern === "per_user" && (!usage.byUser || usage.byUser.length === 0) && (
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 text-center">
          <p className="text-sm text-zinc-500">
            No per-user usage data yet. Usage will appear after your platform exchanges user tokens.
          </p>
        </div>
      )}
    </DashboardLayout>
  );
}
