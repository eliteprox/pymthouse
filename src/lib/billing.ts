import { db } from "@/db/index";
import { endUsers, transactions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export async function hasEnoughCredits(
  endUserId: string,
  requiredWei: bigint,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(endUsers)
    .where(eq(endUsers.id, endUserId))
    .limit(1);
  const user = rows[0];
  if (!user) return false;
  return BigInt(user.creditBalanceWei) >= requiredWei;
}

export async function deductCredits(
  endUserId: string,
  amountWei: bigint,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(endUsers)
    .where(eq(endUsers.id, endUserId))
    .limit(1);
  const user = rows[0];
  if (!user) return false;

  const current = BigInt(user.creditBalanceWei);
  if (current < amountWei) return false;

  await db
    .update(endUsers)
    .set({ creditBalanceWei: (current - amountWei).toString() })
    .where(eq(endUsers.id, endUserId));
  return true;
}

export async function addCredits(
  endUserId: string,
  amountWei: bigint,
): Promise<void> {
  const rows = await db
    .select()
    .from(endUsers)
    .where(eq(endUsers.id, endUserId))
    .limit(1);
  const user = rows[0];
  if (!user) return;

  const newBalance = BigInt(user.creditBalanceWei) + amountWei;
  await db
    .update(endUsers)
    .set({ creditBalanceWei: newBalance.toString() })
    .where(eq(endUsers.id, endUserId));
}

export async function findOrCreateAppEndUser(
  appId: string,
  externalUserId: string,
): Promise<{ id: string; isNew: boolean }> {
  const existingRows = await db
    .select()
    .from(endUsers)
    .where(
      and(
        eq(endUsers.appId, appId),
        eq(endUsers.externalUserId, externalUserId),
      ),
    )
    .limit(1);
  const existing = existingRows[0];

  if (existing) {
    return { id: existing.id, isNew: false };
  }

  const id = uuidv4();
  await db.insert(endUsers).values({
    id,
    appId,
    externalUserId,
    creditBalanceWei: "0",
  });

  return { id, isNew: true };
}

export async function getTransactions(
  endUserId?: string,
  limit: number = 50,
  offset: number = 0,
) {
  if (endUserId) {
    return db
      .select()
      .from(transactions)
      .where(eq(transactions.endUserId, endUserId))
      .limit(limit)
      .offset(offset);
  }

  return db.select().from(transactions).limit(limit).offset(offset);
}
