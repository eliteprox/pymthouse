/**
 * findAccount — resolve a user by `sub` and return claims based on granted scopes.
 *
 * Unifies the plan/entitlements derivation that was previously split between the
 * token endpoint and the userinfo endpoint (fixing the operator-role bug from userinfo).
 */

import type { Account, FindAccount } from "oidc-provider";
import { db } from "@/db/index";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export function derivePlanAndEntitlements(role: string): {
  plan: string;
  entitlements: string[];
} {
  switch (role) {
    case "admin":
      return {
        plan: "enterprise",
        entitlements: [
          "transcode",
          "ai-inference",
          "live-streaming",
          "admin",
          "unlimited-quota",
        ],
      };
    case "operator":
      return {
        plan: "pro",
        entitlements: ["transcode", "ai-inference", "live-streaming"],
      };
    default:
      return {
        plan: "free",
        entitlements: ["transcode", "ai-inference"],
      };
  }
}

export const findAccount: FindAccount = async (_ctx, sub) => {
  const user = db.select().from(users).where(eq(users.id, sub)).get();
  if (!user) return undefined;

  const account: Account = {
    accountId: user.id,
    async claims(_use, scope) {
      const scopes = scope ? scope.split(" ") : [];
      const { plan, entitlements } = derivePlanAndEntitlements(user.role);

      const claims: { sub: string; [key: string]: unknown } = { sub: user.id };

      if (scopes.includes("email")) {
        claims.email = user.email;
      }

      if (scopes.includes("profile")) {
        claims.name = user.name;
      }

      if (scopes.includes("role")) {
        claims.role = user.role;
      }

      if (scopes.includes("plan")) {
        claims.plan = plan;
      }

      if (scopes.includes("entitlements")) {
        claims.entitlements = entitlements;
      }

      if (scopes.includes("gateway")) {
        claims.gateway = true;
      }

      return claims;
    },
  };

  return account;
};
