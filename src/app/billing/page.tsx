export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import DashboardLayout from "@/components/DashboardLayout";
import UsageLineChart from "@/components/UsageLineChart";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { appUsers, developerApps, usageRecords, users } from "@/db/schema";

type AppRow = {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string | null;
};

type UserUsageRow = {
  endUserId: string;
  externalUserId: string | null;
  requestCount: number;
  totalFeeWei: string;
  totalUnits: string;
};

type AppUsageSummary = {
  app: AppRow;
  requestCount: number;
  totalFeeWei: string;
  totalUnits: string;
  byUser: UserUsageRow[];
};

function calendarMonthBoundsUtc(now: Date): { start: string; end: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
  return { start: start.toISOString(), end: end.toISOString() };
}

function formatWei(wei: string): string {
  if (!wei || !/^\d+$/.test(wei)) return "0";
  const value = BigInt(wei);
  if (value === 0n) return "0";
  const divisor = 10n ** 18n;
  const whole = value / divisor;
  const remainder = value % divisor;
  if (whole === 0n && remainder > 0n) return `${value.toString()} wei`;
  const fracStr = remainder.toString().padStart(18, "0").slice(0, 6);
  return `${whole}.${fracStr} ETH`;
}

function formatPeriod(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function dateKeyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function sortAppsForViewer(apps: AppRow[], userId: string, isAdmin: boolean): AppRow[] {
  const byName = (a: AppRow, b: AppRow) => a.name.localeCompare(b.name);
  if (!isAdmin) {
    return [...apps].sort(byName);
  }
  const owned = apps.filter((app) => app.ownerId === userId).sort(byName);
  const rest = apps.filter((app) => app.ownerId !== userId).sort(byName);
  return [...owned, ...rest];
}

export default async function BillingPage() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as Record<string, unknown> | undefined;
  const userId = sessionUser?.id as string | undefined;
  const role = sessionUser?.role as string | undefined;
  const isAdmin = role === "admin";

  if (!userId) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-lg font-medium text-zinc-300">Billing unavailable</h2>
          <p className="text-zinc-500 mt-2">Please sign in to view billing and usage.</p>
        </div>
      </DashboardLayout>
    );
  }

  const appsQuery = db
    .select({
      id: developerApps.id,
      name: developerApps.name,
      ownerId: developerApps.ownerId,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(developerApps)
    .leftJoin(users, eq(developerApps.ownerId, users.id));

  const visibleApps = (isAdmin
    ? await appsQuery
    : await appsQuery.where(eq(developerApps.ownerId, userId))) as AppRow[];

  const orderedApps = sortAppsForViewer(visibleApps, userId, isAdmin);
  const appIds = orderedApps.map((app) => app.id);
  const cycle = calendarMonthBoundsUtc(new Date());

  const usageRows =
    appIds.length > 0
      ? await db
          .select()
          .from(usageRecords)
          .where(
            and(
              inArray(usageRecords.clientId, appIds),
              gte(usageRecords.createdAt, cycle.start),
              lte(usageRecords.createdAt, cycle.end),
            ),
          )
      : [];

  const appUserRows =
    appIds.length > 0
      ? await db
          .select({
            id: appUsers.id,
            clientId: appUsers.clientId,
            externalUserId: appUsers.externalUserId,
          })
          .from(appUsers)
          .where(inArray(appUsers.clientId, appIds))
      : [];

  const externalUserIdByAppUser = new Map(
    appUserRows.map((row) => [`${row.clientId}:${row.id}`, row.externalUserId]),
  );

  const summaryByApp = new Map<
    string,
    {
      requestCount: number;
      totalFeeWei: bigint;
      totalUnits: bigint;
      byUser: Map<
        string,
        {
          requestCount: number;
          totalFeeWei: bigint;
          totalUnits: bigint;
        }
      >;
    }
  >();

  for (const app of orderedApps) {
    summaryByApp.set(app.id, {
      requestCount: 0,
      totalFeeWei: 0n,
      totalUnits: 0n,
      byUser: new Map(),
    });
  }

  for (const row of usageRows) {
    const appSummary = summaryByApp.get(row.clientId);
    if (!appSummary) continue;

    appSummary.requestCount += 1;
    appSummary.totalFeeWei += BigInt(row.fee || "0");
    appSummary.totalUnits += BigInt(row.units || "0");

    const endUserId = row.userId || "unknown";
    const userSummary = appSummary.byUser.get(endUserId) || {
      requestCount: 0,
      totalFeeWei: 0n,
      totalUnits: 0n,
    };
    userSummary.requestCount += 1;
    userSummary.totalFeeWei += BigInt(row.fee || "0");
    userSummary.totalUnits += BigInt(row.units || "0");
    appSummary.byUser.set(endUserId, userSummary);
  }

  const appUsage: AppUsageSummary[] = orderedApps.map((app) => {
    const summary = summaryByApp.get(app.id)!;
    const byUser: UserUsageRow[] = [...summary.byUser.entries()]
      .map(([endUserId, userSummary]) => ({
        endUserId,
        externalUserId:
          endUserId === "unknown"
            ? null
            : externalUserIdByAppUser.get(`${app.id}:${endUserId}`) || null,
        requestCount: userSummary.requestCount,
        totalFeeWei: userSummary.totalFeeWei.toString(),
        totalUnits: userSummary.totalUnits.toString(),
      }))
      .sort((a, b) => {
        if (b.requestCount !== a.requestCount) {
          return b.requestCount - a.requestCount;
        }
        const feeA = BigInt(a.totalFeeWei);
        const feeB = BigInt(b.totalFeeWei);
        if (feeA === feeB) return 0;
        return feeB > feeA ? 1 : -1;
      });

    return {
      app,
      requestCount: summary.requestCount,
      totalFeeWei: summary.totalFeeWei.toString(),
      totalUnits: summary.totalUnits.toString(),
      byUser,
    };
  });

  const totalRequests = appUsage.reduce((sum, row) => sum + row.requestCount, 0);
  const totalFeeWei = appUsage.reduce(
    (sum, row) => sum + BigInt(row.totalFeeWei || "0"),
    0n,
  );
  const appsWithUsage = appUsage.filter((app) => app.requestCount > 0).length;
  const requestsByDay = new Map<string, number>();
  for (const row of usageRows) {
    const day = dateKeyFromIso(row.createdAt);
    requestsByDay.set(day, (requestsByDay.get(day) ?? 0) + 1);
  }
  const chartData: { date: string; value: number }[] = [];
  const startDay = new Date(`${dateKeyFromIso(cycle.start)}T12:00:00.000Z`);
  const endDay = new Date(`${dateKeyFromIso(cycle.end)}T12:00:00.000Z`);
  for (let d = new Date(startDay); d <= endDay; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    chartData.push({
      date,
      value: requestsByDay.get(date) ?? 0,
    });
  }

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Billing &amp; usage</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {isAdmin
            ? "Your applications are listed first, followed by all applications in the system."
            : "Usage for all applications you own, with per-user billing breakdowns."}
        </p>
        <p className="text-xs text-zinc-600 mt-2">
          Cycle: {formatPeriod(cycle.start)} — {formatPeriod(cycle.end)}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Applications</p>
          <p className="text-xl font-bold text-zinc-100">{orderedApps.length}</p>
          <p className="text-xs text-zinc-600 mt-1">{appsWithUsage} with usage this cycle</p>
        </div>
        <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Requests</p>
          <p className="text-xl font-bold text-zinc-100">{totalRequests}</p>
          <p className="text-xs text-zinc-600 mt-1">runtime requests this cycle</p>
        </div>
        <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Total Fees</p>
          <p className="text-xl font-bold text-zinc-100">{formatWei(totalFeeWei.toString())}</p>
          <p className="text-xs text-zinc-600 mt-1">estimated usage fees</p>
        </div>
        <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Viewer Role</p>
          <p className="text-xl font-bold text-zinc-100 capitalize">{role || "developer"}</p>
          <p className="text-xs text-zinc-600 mt-1">
            {isAdmin ? "all applications visible" : "owner applications only"}
          </p>
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <h2 className="text-sm font-semibold text-zinc-200 mb-4">Usage over billing period</h2>
        <UsageLineChart data={chartData} valueLabel="Requests / day" />
      </div>

      {appUsage.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 text-center">
          <p className="text-zinc-300 font-medium">No applications available</p>
          <p className="text-zinc-500 text-sm mt-1">
            {isAdmin
              ? "No developer applications exist yet."
              : "Create your first app to start tracking billing and usage."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {appUsage.map((entry) => (
            <section
              key={entry.app.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-zinc-100">{entry.app.name}</h2>
                    <p className="text-xs text-zinc-500 mt-1 font-mono">{entry.app.id}</p>
                    {isAdmin && (
                      <p className="text-xs text-zinc-500 mt-1">
                        Owner:{" "}
                        <span className="text-zinc-300">
                          {entry.app.ownerName || entry.app.ownerEmail || entry.app.ownerId}
                        </span>
                        {entry.app.ownerId === userId ? " (you)" : ""}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-right">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-zinc-500">Requests</p>
                      <p className="text-sm font-semibold text-zinc-200">{entry.requestCount}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-zinc-500">Units</p>
                      <p className="text-sm font-semibold text-zinc-200">{entry.totalUnits}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-zinc-500">Fees</p>
                      <p className="text-sm font-semibold text-zinc-200">
                        {formatWei(entry.totalFeeWei)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {entry.byUser.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                        <th className="text-left px-5 py-3 font-medium">App User</th>
                        <th className="text-left px-5 py-3 font-medium">PymtHouse ID</th>
                        <th className="text-right px-5 py-3 font-medium">Requests</th>
                        <th className="text-right px-5 py-3 font-medium">Units</th>
                        <th className="text-right px-5 py-3 font-medium">Total Fees</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.byUser.map((userUsage) => (
                        <tr
                          key={`${entry.app.id}:${userUsage.endUserId}`}
                          className="border-b border-zinc-800/50 hover:bg-zinc-800/20"
                        >
                          <td className="px-5 py-3">
                            <code className="text-xs text-zinc-300">
                              {userUsage.externalUserId || "Unknown / unmapped"}
                            </code>
                          </td>
                          <td className="px-5 py-3">
                            <code className="text-xs text-zinc-500">
                              {userUsage.endUserId === "unknown"
                                ? "unknown"
                                : `${userUsage.endUserId.slice(0, 8)}...`}
                            </code>
                          </td>
                          <td className="px-5 py-3 text-right text-zinc-300">
                            {userUsage.requestCount}
                          </td>
                          <td className="px-5 py-3 text-right text-zinc-300">
                            {userUsage.totalUnits}
                          </td>
                          <td className="px-5 py-3 text-right text-zinc-300">
                            {formatWei(userUsage.totalFeeWei)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-5 text-center">
                  <p className="text-sm text-zinc-500">
                    No usage for this application in the current cycle yet.
                  </p>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
