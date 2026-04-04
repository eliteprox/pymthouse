import { db } from "@/db/index";
import { endUsers, transactions, streamSessions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export function hasEnoughCredits(
  endUserId: string,
  requiredWei: bigint
): boolean {
  const user = db
    .select()
    .from(endUsers)
    .where(eq(endUsers.id, endUserId))
    .get();
  if (!user) return false;
  return BigInt(user.creditBalanceWei) >= requiredWei;
}

export function deductCredits(
  endUserId: string,
  amountWei: bigint
): boolean {
  const user = db
    .select()
    .from(endUsers)
    .where(eq(endUsers.id, endUserId))
    .get();
  if (!user) return false;

  const current = BigInt(user.creditBalanceWei);
  if (current < amountWei) return false;

  db.update(endUsers)
    .set({ creditBalanceWei: (current - amountWei).toString() })
    .where(eq(endUsers.id, endUserId))
    .run();
  return true;
}

export function addCredits(
  endUserId: string,
  amountWei: bigint
): void {
  const user = db
    .select()
    .from(endUsers)
    .where(eq(endUsers.id, endUserId))
    .get();
  if (!user) return;

  const newBalance = BigInt(user.creditBalanceWei) + amountWei;
  db.update(endUsers)
    .set({ creditBalanceWei: newBalance.toString() })
    .where(eq(endUsers.id, endUserId))
    .run();
}

export function findOrCreateAppEndUser(
  appId: string,
  externalUserId: string,
): { id: string; isNew: boolean } {
  const existing = db
    .select()
    .from(endUsers)
    .where(
      and(
        eq(endUsers.appId, appId),
        eq(endUsers.externalUserId, externalUserId),
      ),
    )
    .get();

  if (existing) {
    return { id: existing.id, isNew: false };
  }

  const id = uuidv4();
  db.insert(endUsers)
    .values({
      id,
      appId,
      externalUserId,
      creditBalanceWei: "0",
    })
    .run();

  return { id, isNew: true };
}

export function getTransactions(
  endUserId?: string,
  limit: number = 50,
  offset: number = 0
) {
  let query = db.select().from(transactions);

  if (endUserId) {
    query = query.where(eq(transactions.endUserId, endUserId)) as typeof query;
  }

  return query.limit(limit).offset(offset).all();
}
