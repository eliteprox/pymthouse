export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { redirect } from "next/navigation";
import { db } from "@/db/index";
import { signerConfig, streamSessions, transactions, endUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import DashboardLayout from "@/components/DashboardLayout";
import Link from "next/link";

function formatWei(wei: string): string {
  if (wei === "0") return "0 ETH";
  const value = BigInt(wei);
  const eth = Number(value) / 1e18;
  if (eth < 0.001) return `${wei} wei`;
  return `${eth.toFixed(6)} ETH`;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = (session.user as Record<string, unknown>)?.role as string;

  if (role === "admin" || role === "operator") {
    return <AdminDashboard />;
  }

  return <DeveloperDashboard />;
}

function AdminDashboard() {
  const signer = db
    .select()
    .from(signerConfig)
    .where(eq(signerConfig.id, "default"))
    .get();

  const activeSessions = db
    .select()
    .from(streamSessions)
    .where(eq(streamSessions.status, "active"))
    .all();

  const allTransactions = db.select().from(transactions).all();
  const allEndUsers = db.select().from(endUsers).all();

  let totalFeeWei = 0n;
  let totalPlatformCutWei = 0n;
  for (const txn of allTransactions) {
    totalFeeWei += BigInt(txn.amountWei);
    totalPlatformCutWei += BigInt(txn.platformCutWei || "0");
  }

  const stats = [
    {
      label: "Signer",
      value: signer?.status === "running" ? "Online" : signer?.status || "N/A",
      sub: signer?.ethAddress
        ? `${signer.ethAddress.slice(0, 6)}...${signer.ethAddress.slice(-4)}`
        : "no address",
      color: signer?.status === "running" ? "text-emerald-400" : "text-zinc-400",
    },
    {
      label: "Active Streams",
      value: activeSessions.length.toString(),
      sub: "live now",
      color: "text-blue-400",
    },
    {
      label: "App Users",
      value: allEndUsers.length.toString(),
      sub: `${allEndUsers.filter((u) => u.isActive).length} active`,
      color: "text-cyan-400",
    },
    {
      label: "Total Volume",
      value: formatWei(totalFeeWei.toString()),
      sub: `${allTransactions.length} transactions`,
      color: "text-amber-400",
    },
    {
      label: "Platform Revenue",
      value: formatWei(totalPlatformCutWei.toString()),
      sub: "total cut earned",
      color: "text-purple-400",
    },
  ];

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-zinc-500 mt-1">Platform overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30"
          >
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
              {stat.label}
            </p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-zinc-600 mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30">
          <h3 className="font-semibold text-zinc-200 mb-4">App Users</h3>
          {allEndUsers.length === 0 ? (
            <p className="text-zinc-500 text-sm">
              No app users yet. Create one from the Users page.
            </p>
          ) : (
            <div className="space-y-3">
              {allEndUsers.slice(0, 5).map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        user.isActive ? "bg-emerald-400" : "bg-zinc-600"
                      }`}
                    />
                    <span className="text-zinc-300">
                      {user.name || user.email || user.id.slice(0, 8)}
                    </span>
                  </div>
                  <span className="text-zinc-500 text-xs">
                    {formatWei(user.creditBalanceWei)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30">
          <h3 className="font-semibold text-zinc-200 mb-4">Recent Streams</h3>
          {activeSessions.length === 0 ? (
            <p className="text-zinc-500 text-sm">No active streams</p>
          ) : (
            <div className="space-y-3">
              {activeSessions.slice(0, 5).map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-zinc-300 font-mono text-xs">
                    {session.manifestId.length > 16
                      ? `${session.manifestId.slice(0, 12)}...`
                      : session.manifestId}
                  </span>
                  <span className="text-zinc-500 text-xs">
                    {formatWei(session.totalFeeWei)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function DeveloperDashboard() {
  return (
    <DashboardLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-zinc-500 mt-1">Developer overview</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30">
          <h3 className="font-semibold text-zinc-200 mb-2">My Apps</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Register OIDC clients to authenticate your users.
          </p>
          <Link
            href="/apps"
            className="inline-flex px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-500/20 transition-colors"
          >
            Manage Apps
          </Link>
        </div>

        <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30">
          <h3 className="font-semibold text-zinc-200 mb-2">Documentation</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Learn how to integrate OIDC authentication and payment flows
            into your application.
          </p>
          <div className="text-xs text-zinc-600">
            OIDC Discovery:{" "}
            <code className="text-zinc-500">/.well-known/openid-configuration</code>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
