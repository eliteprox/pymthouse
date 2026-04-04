/**
 * findAccount — resolve a user by `sub` and return claims based on granted scopes.
 *
 * Checks both the `users` table (admin/operator/developer) and the `endUsers`
 * table (app-users authenticated via OIDC public clients).
 */

import type { Account, FindAccount } from "oidc-provider";
import { db } from "@/db/index";
import { users, endUsers } from "@/db/schema";
import { eq } from "drizzle-orm";

export const findAccount: FindAccount = async (_ctx, sub) => {
  const user = db.select().from(users).where(eq(users.id, sub)).get();

  if (user) {
    const account: Account = {
      accountId: user.id,
      async claims(_use, scope) {
        const scopes = scope ? scope.split(" ") : [];

        const claims: { sub: string; [key: string]: unknown } = { sub: user.id };

        if (scopes.includes("email")) {
          claims.email = user.email;
        }

        if (scopes.includes("profile")) {
          claims.name = user.name;
        }

        if (scopes.includes("gateway")) {
          claims.gateway = true;
        }

        return claims;
      },
    };

    return account;
  }

  const endUser = db.select().from(endUsers).where(eq(endUsers.id, sub)).get();

  if (endUser) {
    const account: Account = {
      accountId: endUser.id,
      async claims(_use, scope) {
        const scopes = scope ? scope.split(" ") : [];

        const claims: { sub: string; [key: string]: unknown } = { sub: endUser.id };

        if (scopes.includes("email")) {
          claims.email = endUser.email;
        }

        if (scopes.includes("profile")) {
          claims.name = endUser.name;
        }

        if (scopes.includes("gateway")) {
          claims.gateway = endUser.isActive;
        }

        return claims;
      },
    };

    return account;
  }

  return undefined;
};
