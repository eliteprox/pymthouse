import { PrivyClient } from "@privy-io/node";
import { db } from "@/db/index";
import { endUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

let privyClient: PrivyClient | null = null;

/**
 * Get or create the Privy server client.
 * Returns null if Privy is not configured.
 */
export function getPrivyClient(): PrivyClient | null {
  if (privyClient) return privyClient;

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) return null;

  privyClient = new PrivyClient({ appId, appSecret });
  return privyClient;
}

/**
 * Check if Privy is configured and available.
 */
export function isPrivyEnabled(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_PRIVY_APP_ID &&
    process.env.PRIVY_APP_SECRET
  );
}

/**
 * Verify a Privy identity token and return the user's DID.
 * Uses the @privy-io/node SDK's users().get() method.
 * Returns null if verification fails.
 */
export async function verifyPrivyToken(
  idToken: string
): Promise<string | null> {
  const client = getPrivyClient();
  if (!client) return null;

  try {
    const user = await client.users().get({ id_token: idToken });
    return user.id;
  } catch {
    return null;
  }
}

/**
 * Find or create an end user in the database by Privy DID.
 */
export function findOrCreateEndUser(
  privyDid: string,
  walletAddress?: string
): { id: string; isNew: boolean } {
  const existing = db
    .select()
    .from(endUsers)
    .where(eq(endUsers.privyDid, privyDid))
    .get();

  if (existing) {
    // Update wallet address if it changed
    if (walletAddress && walletAddress !== existing.walletAddress) {
      db.update(endUsers)
        .set({ walletAddress })
        .where(eq(endUsers.id, existing.id))
        .run();
    }
    return { id: existing.id, isNew: false };
  }

  const id = uuidv4();
  db.insert(endUsers)
    .values({
      id,
      privyDid,
      walletAddress: walletAddress || null,
      creditBalanceWei: "0",
    })
    .run();

  return { id, isNew: true };
}

/**
 * Get end user by Privy DID.
 */
export function getEndUserByDid(privyDid: string) {
  return db
    .select()
    .from(endUsers)
    .where(eq(endUsers.privyDid, privyDid))
    .get();
}

/**
 * Get end user by ID.
 */
export function getEndUserById(endUserId: string) {
  return db
    .select()
    .from(endUsers)
    .where(eq(endUsers.id, endUserId))
    .get();
}
