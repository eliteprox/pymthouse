export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import DashboardLayout from "@/components/DashboardLayout";
import UsageLineChart from "@/components/UsageLineChart";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { appUsers, developerApps, usageBillingEvents, usageRecords, users } from "@/db/schema";
import { calendarMonthBoundsUtc, dateKeysInclusiveUtc } from "@/lib/billing-utils";

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
  userType: "system_managed" | "oidc_authorized" | "unknown";
  userLabel: string;
  identifier: string;
  requestCount: number;
  totalFeeWei: string;
  totalUnits: string;
};

type PipelineModelSummary = {
  pipeline: string;
  modelId: string;
  requestCount: number;
  networkFeeUsdMicros: bigint;
  endUserBillableUsdMicros: bigint;
};

type AppUsageSummary = {
  app: AppRow;
  requestCount: number;
  totalFeeWei: string;
  totalUnits: string;
  networkFeeUsdMicros: string;
  endUserBillableUsdMicros: string;
  byUser: UserUsageRow[];
  byPipelineModel: PipelineModelSummary[];
};

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

function classifyUsageUser(endUserId: string, externalUserId: string | null): {
  userType: "system_managed" | "oidc_authorized" | "unknown";
  userLabel: string;
  identifier: string;
} {
  if (externalUserId) {
    return {
      userType: "system_managed",
      userLabel: externalUserId,
      identifier: endUserId,
    };
  }
  if (endUserId !== "unknown") {
    return {
      userType: "oidc_authorized",
      userLabel: "OIDC user (not provisioned)",
      identifier: endUserId,
    };
  }
  return {
    userType: "unknown",
    userLabel: "Unknown / unscoped",
    identifier: "unknown",
  };
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

/** Owner display name for fixture / test-owned apps shown as "Owner: Test User" */
function isTestUserOwner(app: AppRow): boolean {
  return app.ownerName?.trim() === "Test User";
}

function sortAppUsageByMostUsed(appUsage: AppUsageSummary[]): AppUsageSummary[] {
  return [...appUsage].sort((a, b) => {
    const tierA = isTestUserOwner(a.app) ? 1 : 0;
    const tierB = isTestUserOwner(b.app) ? 1 : 0;
    if (tierA !== tierB) {
      return tierA - tierB;
    }

    if (b.requestCount !== a.requestCount) {
      return b.requestCount - a.requestCount;
    }

    const unitsA = BigInt(a.totalUnits);
    const unitsB = BigInt(b.totalUnits);
    if (unitsA !== unitsB) {
      return unitsB > unitsA ? 1 : -1;
    }

    const feeA = BigInt(a.totalFeeWei);
    const feeB = BigInt(b.totalFeeWei);
    if (feeA !== feeB) {
      return feeB > feeA ? 1 : -1;
    }

    return a.app.name.localeCompare(b.app.name);
  });
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

  // Fetch billing events to get USD denominations
  const usageRecordIds = usageRows.map((r) => r.id).filter(Boolean);
  const billingEventRows =
    usageRecordIds.length > 0
      ? await db
          .select()
          .from(usageBillingEvents)
          .where(inArray(usageBillingEvents.usageRecordId, usageRecordIds))
      : [];

  // Map usageRecordId → billing event
  const eventByUsageRecord = new Map(billingEventRows.map((e) => [e.usageRecordId, e]));

  const externalUserIdByAppUser = new Map(
    appUserRows.map((row) => [`${row.clientId}:${row.id}`, row.externalUserId]),
  );

  const summaryByApp = new Map<
    string,
    {
      requestCount: number;
      totalFeeWei: bigint;
      totalUnits: bigint;
      networkFeeUsdMicros: bigint;
      endUserBillableUsdMicros: bigint;
      byUser: Map<string, { requestCount: number; totalFeeWei: bigint; totalUnits: bigint }>;
      byPipelineModel: Map<string, { pipeline: string; modelId: string; requestCount: number; networkFeeUsdMicros: bigint; endUserBillableUsdMicros: bigint }>;
    }
  >();

  for (const app of orderedApps) {
    summaryByApp.set(app.id, {
      requestCount: 0,
      totalFeeWei: 0n,
      totalUnits: 0n,
      networkFeeUsdMicros: 0n,
      endUserBillableUsdMicros: 0n,
      byUser: new Map(),
      byPipelineModel: new Map(),
    });
  }

  for (const row of usageRows) {
    const appSummary = summaryByApp.get(row.clientId);
    if (!appSummary) continue;

    appSummary.requestCount += 1;
    appSummary.totalFeeWei += BigInt(row.fee || "0");
    appSummary.totalUnits += BigInt(row.units || "0");

    const billingEvent = eventByUsageRecord.get(row.id);
    if (billingEvent) {
      appSummary.networkFeeUsdMicros += BigInt(billingEvent.networkFeeUsdMicros);
      appSummary.endUserBillableUsdMicros += BigInt(billingEvent.endUserBillableUsdMicros);

      const pmKey = `${billingEvent.pipeline}|${billingEvent.modelId}`;
      const existing = appSummary.byPipelineModel.get(pmKey) || {
        pipeline: billingEvent.pipeline,
        modelId: billingEvent.modelId,
        requestCount: 0,
        networkFeeUsdMicros: 0n,
        endUserBillableUsdMicros: 0n,
      };
      existing.requestCount += 1;
      existing.networkFeeUsdMicros += BigInt(billingEvent.networkFeeUsdMicros);
      existing.endUserBillableUsdMicros += BigInt(billingEvent.endUserBillableUsdMicros);
      appSummary.byPipelineModel.set(pmKey, existing);
    }

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

  const appUsage: AppUsageSummary[] = sortAppUsageByMostUsed(
    orderedApps.map((app) => {
      const summary = summaryByApp.get(app.id)!;
      const byUser: UserUsageRow[] = [...summary.byUser.entries()]
        .map(([endUserId, userSummary]) => {
          const externalUserId =
            endUserId === "unknown"
              ? null
              : externalUserIdByAppUser.get(`${app.id}:${endUserId}`) || null;
          const identity = classifyUsageUser(endUserId, externalUserId);
          return {
            endUserId,
            externalUserId,
            userType: identity.userType,
            userLabel: identity.userLabel,
            identifier: identity.identifier,
            requestCount: userSummary.requestCount,
            totalFeeWei: userSummary.totalFeeWei.toString(),
            totalUnits: userSummary.totalUnits.toString(),
          };
        })
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
        networkFeeUsdMicros: summary.networkFeeUsdMicros.toString(),
        endUserBillableUsdMicros: summary.endUserBillableUsdMicros.toString(),
        byUser,
        byPipelineModel: [...summary.byPipelineModel.values()],
      };
    }),
  );

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
  const chartData: { date: string; value: number }[] = dateKeysInclusiveUtc(
    cycle.start,
    cycle.end,
  ).map((date) => ({
    date,
    value: requestsByDay.get(date) ?? 0,
  }));

  return (
    <DashboardLayout>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-100">Billing &amp; usage</h1>
        <p className="text-xs sm:text-sm text-zinc-500 mt-1">
          Applications are ordered by requests this billing cycle; apps owned by Test User appear
          after all others, with per-user billing breakdowns.
        </p>
        <p className="text-xs text-zinc-600 mt-2 break-words">
          Cycle: {formatPeriod(cycle.start)} — {formatPeriod(cycle.end)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6 sm:mb-8">
        <div className="border border-zinc-800 rounded-xl p-4 sm:p-5 bg-zinc-900/30 min-w-0">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Applications</p>
          <p className="text-lg sm:text-xl font-bold text-zinc-100 tabular-nums">
            {orderedApps.length}
          </p>
          <p className="text-xs text-zinc-600 mt-1">{appsWithUsage} with usage this cycle</p>
        </div>
        <div className="border border-zinc-800 rounded-xl p-4 sm:p-5 bg-zinc-900/30 min-w-0">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Requests</p>
          <p className="text-lg sm:text-xl font-bold text-zinc-100 tabular-nums">{totalRequests}</p>
          <p className="text-xs text-zinc-600 mt-1">runtime requests this cycle</p>
        </div>
        <div className="border border-zinc-800 rounded-xl p-4 sm:p-5 bg-zinc-900/30 min-w-0">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Total Fees</p>
          <p
            className="font-mono text-lg sm:text-xl font-bold text-zinc-100 break-all leading-snug"
            title={formatWei(totalFeeWei.toString())}
          >
            {formatWei(totalFeeWei.toString())}
          </p>
          <p className="text-xs text-zinc-600 mt-2">estimated usage fees</p>
        </div>
        <div className="border border-zinc-800 rounded-xl p-4 sm:p-5 bg-zinc-900/30 min-w-0">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Viewer Role</p>
          <p className="text-lg sm:text-xl font-bold text-zinc-100 capitalize truncate">
            {role || "developer"}
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            {isAdmin ? "all applications visible" : "owner applications only"}
          </p>
        </div>
      </div>

      <div className="mb-6 sm:mb-8 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 sm:p-5">
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
              <div className="px-4 py-4 sm:px-5 border-b border-zinc-800">
                <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-zinc-100 break-words">{entry.app.name}</h2>
                    <p className="text-xs text-zinc-500 mt-1 font-mono break-all">{entry.app.id}</p>
                    {isAdmin && (
                      <p className="text-xs text-zinc-500 mt-1 break-words">
                        Owner:{" "}
                        <span className="text-zinc-300">
                          {entry.app.ownerName || entry.app.ownerEmail || entry.app.ownerId}
                        </span>
                        {entry.app.ownerId === userId ? " (you)" : ""}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-right shrink-0 w-full min-w-0 sm:w-auto sm:max-w-full">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-zinc-500">Requests</p>
                      <p className="text-sm font-semibold text-zinc-200 tabular-nums">
                        {entry.requestCount}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-zinc-500">Network fee (ETH)</p>
                      <p className="text-sm font-semibold text-zinc-200 font-mono break-all">
                        {formatWei(entry.totalFeeWei)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-zinc-500">Network fee (USD)</p>
                      <p className="text-sm font-semibold text-emerald-400 font-mono break-all">
                        {entry.networkFeeUsdMicros !== "0"
                          ? `$${(parseInt(entry.networkFeeUsdMicros, 10) / 1_000_000).toFixed(4)}`
                          : "—"}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-zinc-500">Billable (USD)</p>
                      <p className="text-sm font-semibold text-zinc-200 font-mono break-all">
                        {entry.endUserBillableUsdMicros !== "0"
                          ? `$${(parseInt(entry.endUserBillableUsdMicros, 10) / 1_000_000).toFixed(4)}`
                          : "—"}
                      </p>
                    </div>
                  </div>
                  {entry.byPipelineModel.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {entry.byPipelineModel.map((pm) => (
                        <span
                          key={`${pm.pipeline}|${pm.modelId}`}
                          className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded"
                          title={`${pm.requestCount} requests · $${(Number(pm.networkFeeUsdMicros) / 1_000_000).toFixed(6)} USD`}
                        >
                          {pm.pipeline} / {pm.modelId.length > 20 ? `${pm.modelId.slice(0, 18)}…` : pm.modelId}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {entry.byUser.length > 0 ? (
                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <table className="w-full text-sm min-w-[32rem]">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                        <th className="text-left px-4 sm:px-5 py-3 font-medium">Identity</th>
                        <th className="text-left px-4 sm:px-5 py-3 font-medium">Identifier</th>
                        <th className="text-right px-4 sm:px-5 py-3 font-medium">Requests</th>
                        <th className="text-right px-4 sm:px-5 py-3 font-medium">Units</th>
                        <th className="text-right px-4 sm:px-5 py-3 font-medium">Total Fees</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.byUser.map((userUsage) => (
                        <tr
                          key={`${entry.app.id}:${userUsage.endUserId}`}
                          className="border-b border-zinc-800/50 hover:bg-zinc-800/20"
                        >
                          <td className="px-4 sm:px-5 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <code className="text-xs text-zinc-300">
                                {userUsage.userLabel}
                              </code>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                                  userUsage.userType === "system_managed"
                                    ? "bg-cyan-500/20 text-cyan-300"
                                    : userUsage.userType === "oidc_authorized"
                                      ? "bg-amber-500/20 text-amber-300"
                                      : "bg-zinc-700/40 text-zinc-400"
                                }`}
                              >
                                {userUsage.userType === "system_managed"
                                  ? "system"
                                  : userUsage.userType === "oidc_authorized"
                                    ? "oidc"
                                    : "unknown"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 sm:px-5 py-3">
                            <code className="text-xs text-zinc-500" title={userUsage.identifier}>
                              {userUsage.identifier === "unknown"
                                ? "unknown"
                                : userUsage.identifier.length > 8
                                  ? `${userUsage.identifier.slice(0, 8)}...`
                                  : userUsage.identifier}
                            </code>
                          </td>
                          <td className="px-4 sm:px-5 py-3 text-right text-zinc-300 tabular-nums">
                            {userUsage.requestCount}
                          </td>
                          <td className="px-4 sm:px-5 py-3 text-right text-zinc-300 font-mono text-xs break-all">
                            {userUsage.totalUnits}
                          </td>
                          <td className="px-4 sm:px-5 py-3 text-right text-zinc-300 font-mono text-xs break-all">
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
