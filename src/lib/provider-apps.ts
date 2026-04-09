import { getServerSession } from "next-auth";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/index";
import { authOptions } from "@/lib/next-auth-options";
import { developerApps, providerAdmins } from "@/db/schema";

export async function getProviderApp(appId: string) {
  const rows = await db
    .select()
    .from(developerApps)
    .where(eq(developerApps.id, appId))
    .limit(1);
  return rows[0] ?? null;
}

export async function isProviderAdmin(userId: string, appId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(providerAdmins)
    .where(
      and(
        eq(providerAdmins.userId, userId),
        eq(providerAdmins.clientId, appId),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

export async function ensureProviderAdminMembership(userId: string, appId: string) {
  const rows = await db
    .select()
    .from(providerAdmins)
    .where(
      and(
        eq(providerAdmins.userId, userId),
        eq(providerAdmins.clientId, appId),
      ),
    )
    .limit(1);
  const existing = rows[0];

  if (existing) return existing;

  const membership = {
    id: crypto.randomUUID(),
    userId,
    clientId: appId,
    role: "owner",
    createdAt: new Date().toISOString(),
  } as const;

  await db.insert(providerAdmins).values(membership);
  return membership;
}

export async function getAuthorizedProviderApp(appId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const userId = (session.user as Record<string, unknown>).id as string | undefined;
  const role = (session.user as Record<string, unknown>).role as string | undefined;
  if (!userId) return null;

  const app = await getProviderApp(appId);
  if (!app) return null;

  if (
    role === "admin" ||
    app.ownerId === userId ||
    (await isProviderAdmin(userId, appId))
  ) {
    return { app, userId, role: role ?? "developer" };
  }

  return null;
}
