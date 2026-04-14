import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { db } from "@/db/index";
import { users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { validateBearerToken, hasScope } from "@/lib/auth";
import { verifyPrivyToken, findOrCreateDeveloperUser, getPrivyClient } from "@/lib/privy";
import { getNextAuthSecret } from "@/lib/next-auth-secret";

const nextAuthSecret = getNextAuthSecret();

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "token",
      name: "Admin Token",
      credentials: {
        token: { label: "Bearer Token", type: "text", placeholder: "pmth_..." },
      },
      async authorize(credentials) {
        if (!credentials?.token) return null;

        const auth = await validateBearerToken(credentials.token);
        if (!auth) return null;
        if (!hasScope(auth.scopes, "admin")) return null;
        if (!auth.userId) return null;

        const userRows = await db
          .select()
          .from(users)
          .where(eq(users.id, auth.userId))
          .limit(1);
        const user = userRows[0];

        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name || user.email,
        };
      },
    }),

    CredentialsProvider({
      id: "privy-wallet",
      name: "Wallet",
      credentials: {
        privyToken: { label: "Privy Token", type: "text" },
        walletAddress: { label: "Wallet Address", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.privyToken) return null;

        const privyDid = await verifyPrivyToken(credentials.privyToken);
        if (!privyDid) return null;

        let email: string | undefined;
        let name: string | undefined;
        try {
          const client = getPrivyClient();
          if (client) {
            const privyUser = await client.users()._get(privyDid);
            const emailAccount = privyUser.linked_accounts.find(
              (a) => a.type === "email",
            ) as { address: string } | undefined;
            email = emailAccount?.address || undefined;
            if (!credentials.walletAddress) {
              const walletAccount = privyUser.linked_accounts.find(
                (a) => a.type === "wallet",
              ) as { address: string } | undefined;
              if (walletAccount?.address) {
                credentials.walletAddress = walletAccount.address;
              }
            }
          }
        } catch {
          /* non-critical */
        }

        const { id } = await findOrCreateDeveloperUser(
          privyDid,
          credentials.walletAddress || undefined,
          undefined,
          email,
        );

        const userRows = await db
          .select()
          .from(users)
          .where(eq(users.id, id))
          .limit(1);
        const user = userRows[0];

        if (!user) return null;

        return {
          id: user.id,
          email: user.email || undefined,
          name: user.name || user.walletAddress || "Developer",
        };
      },
    }),

    ...(process.env.GOOGLE_CLIENT_ID
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
    ...(process.env.GITHUB_CLIENT_ID
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!account) return false;

      if (account.provider === "token") return true;

      if (account.provider === "privy-wallet") return true;

      if (!user.email) return false;

      const provider = account.provider;
      const subject = account.providerAccountId;

      const existingRows = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.oauthProvider, provider),
            eq(users.oauthSubject, subject),
          ),
        )
        .limit(1);
      const existing = existingRows[0];

      if (!existing) {
        await db.insert(users).values({
          id: uuidv4(),
          email: user.email,
          name: user.name || null,
          oauthProvider: provider,
          oauthSubject: subject,
          role: "developer",
        });
      }

      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.userId) {
          const pmthRows = await db
            .select()
            .from(users)
            .where(eq(users.id, token.userId as string))
            .limit(1);
          const pmthUser = pmthRows[0];

          if (pmthUser) {
            (session.user as Record<string, unknown>).id = pmthUser.id;
            (session.user as Record<string, unknown>).role = pmthUser.role;
            return session;
          }
        }

        if (token.provider && token.sub) {
          const pmthRows = await db
            .select()
            .from(users)
            .where(
              and(
                eq(users.oauthProvider, token.provider as string),
                eq(users.oauthSubject, token.sub),
              ),
            )
            .limit(1);
          const pmthUser = pmthRows[0];

          if (pmthUser) {
            (session.user as Record<string, unknown>).id = pmthUser.id;
            (session.user as Record<string, unknown>).role = pmthUser.role;
          }
        }
      }
      return session;
    },
    async jwt({ token, user, account }) {
      if (account) {
        token.provider = account.provider;
      }
      if (user?.id) {
        token.userId = user.id;
      }
      return token;
    },
  },
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
  },
  secret: nextAuthSecret,
};
