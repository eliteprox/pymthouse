import { NextRequest, NextResponse } from "next/server";
import { authenticateAppClient } from "@/lib/auth";
import { db } from "@/db/index";
import { appUsers, usageRecords } from "@/db/schema";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getAuthorizedProviderApp, getProviderApp } from "@/lib/provider-apps";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const clientAuth = await authenticateAppClient(request);

  // Prefer Basic-auth path: it does not need Next request context. Calling
  // getAuthorizedProviderApp (session) pulls in headers() and throws outside
  // a request scope (e.g. node:test calling the handler directly).
  let app: Awaited<ReturnType<typeof getProviderApp>> | null = null;
  if (clientAuth?.appId === clientId) {
    app = await getProviderApp(clientId);
  } else {
    const providerAuth = await getAuthorizedProviderApp(clientId);
    if (!providerAuth) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    app = providerAuth.app;
  }

  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const groupBy = url.searchParams.get("groupBy") || "none";
  const filterUserId = url.searchParams.get("userId");

  // Validate date params as ISO strings
  if (startDate && isNaN(Date.parse(startDate))) {
    return NextResponse.json({ error: "Invalid startDate format" }, { status: 400 });
  }
  if (endDate && isNaN(Date.parse(endDate))) {
    return NextResponse.json({ error: "Invalid endDate format" }, { status: 400 });
  }

  const conditions = [eq(usageRecords.clientId, app.id)];
  if (startDate) conditions.push(gte(usageRecords.createdAt, startDate));
  if (endDate) conditions.push(lte(usageRecords.createdAt, endDate));
  if (filterUserId) conditions.push(eq(usageRecords.userId, filterUserId));

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  const rows = await db
    .select()
    .from(usageRecords)
    .where(whereClause!);

  let totalFeeWei = 0n;
  for (const row of rows) {
    totalFeeWei += BigInt(row.fee);
  }

  const totals = {
    requestCount: rows.length,
    totalFeeWei: totalFeeWei.toString(),
  };

  const response: Record<string, unknown> = {
    clientId,
    period: {
      start: startDate || null,
      end: endDate || null,
    },
    totals,
  };

  if (groupBy === "user") {
    const byUserMap = new Map<string, { feeWei: bigint; count: number }>();
    for (const row of rows) {
      const uid = row.userId || "unknown";
      const existing = byUserMap.get(uid) || { feeWei: 0n, count: 0 };
      existing.feeWei += BigInt(row.fee);
      existing.count += 1;
      byUserMap.set(uid, existing);
    }

    const userIds = [...byUserMap.keys()].filter((key) => key !== "unknown");
    const appUserRows =
      userIds.length > 0
        ? await db.select().from(appUsers).where(inArray(appUsers.id, userIds))
        : [];
    const appUserMap = new Map(appUserRows.map((user) => [user.id, user]));

    response.byUser = [...byUserMap.entries()].map(([endUserId, data]) => ({
      endUserId,
      externalUserId: appUserMap.get(endUserId)?.externalUserId || null,
      feeWei: data.feeWei.toString(),
      requestCount: data.count,
    }));
  }

  return NextResponse.json(response);
}
