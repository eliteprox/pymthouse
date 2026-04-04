import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { authenticateAppClient } from "@/lib/auth";
import { db } from "@/db/index";
import { developerApps, oidcClients, transactions, endUsers } from "@/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

async function resolveApp(
  request: NextRequest,
  appUuid: string,
): Promise<typeof developerApps.$inferSelect | null> {
  const clientAuth = authenticateAppClient(request);
  if (clientAuth && clientAuth.appId === appUuid) {
    return db.select().from(developerApps).where(eq(developerApps.id, appUuid)).get() ?? null;
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const userId = (session.user as Record<string, unknown>).id as string;
  const role = (session.user as Record<string, unknown>).role as string;
  const app = db.select().from(developerApps).where(eq(developerApps.id, appUuid)).get();
  if (!app) return null;
  if (app.ownerId !== userId && role !== "admin") return null;
  return app;
}

function getOidcClientId(app: typeof developerApps.$inferSelect): string | null {
  if (!app.oidcClientId) return null;
  const client = db.select().from(oidcClients).where(eq(oidcClients.id, app.oidcClientId)).get();
  return client?.clientId ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const app = await resolveApp(request, id);
  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const clientId = getOidcClientId(app);
  if (!clientId) {
    return NextResponse.json({ error: "App has no OIDC client" }, { status: 400 });
  }

  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const groupBy = url.searchParams.get("groupBy") || "none";
  const filterEndUserId = url.searchParams.get("endUserId");

  const conditions = [eq(transactions.appId, clientId)];
  if (startDate) conditions.push(gte(transactions.createdAt, startDate));
  if (endDate) conditions.push(lte(transactions.createdAt, endDate));
  if (filterEndUserId) conditions.push(eq(transactions.endUserId, filterEndUserId));

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  const rows = db
    .select()
    .from(transactions)
    .where(whereClause!)
    .all();

  let totalFeeWei = 0n;
  let platformCutWei = 0n;
  for (const row of rows) {
    totalFeeWei += BigInt(row.amountWei);
    if (row.platformCutWei) platformCutWei += BigInt(row.platformCutWei);
  }

  const totals = {
    transactionCount: rows.length,
    totalFeeWei: totalFeeWei.toString(),
    platformCutWei: platformCutWei.toString(),
  };

  const response: Record<string, unknown> = {
    appId: clientId,
    billingPattern: app.billingPattern,
    period: {
      start: startDate || null,
      end: endDate || null,
    },
    totals,
  };

  if (groupBy === "user" && app.billingPattern === "per_user") {
    const byUserMap = new Map<string, { feeWei: bigint; count: number; externalUserId: string | null }>();
    for (const row of rows) {
      const uid = row.endUserId || "unknown";
      const existing = byUserMap.get(uid) || { feeWei: 0n, count: 0, externalUserId: null };
      existing.feeWei += BigInt(row.amountWei);
      existing.count += 1;
      byUserMap.set(uid, existing);
    }

    const endUserIds = [...byUserMap.keys()].filter((k) => k !== "unknown");
    const endUserRows = endUserIds.length > 0
      ? db.select().from(endUsers).all().filter((u) => endUserIds.includes(u.id))
      : [];
    const endUserMap = new Map(endUserRows.map((u) => [u.id, u]));

    response.byUser = [...byUserMap.entries()].map(([endUserId, data]) => ({
      endUserId,
      externalUserId: endUserMap.get(endUserId)?.externalUserId || null,
      feeWei: data.feeWei.toString(),
      transactionCount: data.count,
    }));
  }

  return NextResponse.json(response);
}
