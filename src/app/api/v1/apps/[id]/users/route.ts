import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { authenticateAppClient } from "@/lib/auth";
import { db } from "@/db/index";
import { developerApps, oidcClients, endUsers, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const app = await resolveApp(request, id);
  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!app.oidcClientId) {
    return NextResponse.json({ error: "App has no OIDC client" }, { status: 400 });
  }

  const client = db.select().from(oidcClients).where(eq(oidcClients.id, app.oidcClientId)).get();
  if (!client) {
    return NextResponse.json({ error: "OIDC client not found" }, { status: 500 });
  }

  const appEndUsers = db
    .select()
    .from(endUsers)
    .where(eq(endUsers.appId, client.clientId))
    .all();

  const allTxns = db
    .select()
    .from(transactions)
    .where(eq(transactions.appId, client.clientId))
    .all();

  const txnsByUser = new Map<string, { feeWei: bigint; count: number }>();
  for (const txn of allTxns) {
    if (!txn.endUserId) continue;
    const existing = txnsByUser.get(txn.endUserId) || { feeWei: 0n, count: 0 };
    existing.feeWei += BigInt(txn.amountWei);
    existing.count += 1;
    txnsByUser.set(txn.endUserId, existing);
  }

  const users = appEndUsers.map((u) => {
    const usage = txnsByUser.get(u.id) || { feeWei: 0n, count: 0 };
    return {
      endUserId: u.id,
      externalUserId: u.externalUserId,
      totalFeeWei: usage.feeWei.toString(),
      transactionCount: usage.count,
      createdAt: u.createdAt,
    };
  });

  return NextResponse.json({ users });
}
