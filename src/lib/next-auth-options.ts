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

export const authOptions: NextAuthOptions = {
  providers: [
    // Token login -- paste a pmth_ bearer token to sign in
    CredentialsProvider({
      id: "token",
      name: "Admin Token",
      credentials: {
        token: { label: "Bearer Token", type: "text", placeholder: "pmth_..." },
      },
      async authorize(credentials) {
        if (!credentials?.token) return null;

        const auth = validateBearerToken(credentials.token);
        if (!auth) return null;
        if (!hasScope(auth.scopes, "admin")) return null;
        if (!auth.userId) return null;

        const user = db
          .select()
          .from(users)
          .where(eq(users.id, auth.userId))
          .get();

        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name || user.email,
        };
      },
    }),

    // Privy wallet login -- developer sign-in with ETH wallet
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

        // Get additional user info from Privy if available
        let email: string | undefined;
        let name: string | undefined;
        try {
          const client = getPrivyClient();
          if (client) {
            const privyUser = await client.users()._get(privyDid);
            const emailAccount = privyUser.linked_accounts.find(
              (a) => a.type === "email"
            ) as { address: string } | undefined;
            email = emailAccount?.address || undefined;
            // Pick up wallet from linked accounts (email users get embedded wallets)
            if (!credentials.walletAddress) {
              const walletAccount = privyUser.linked_accounts.find(
                (a) => a.type === "wallet"
              ) as { address: string } | undefined;
              if (walletAccount?.address) {
                credentials.walletAddress = walletAccount.address;
              }
            }
          }
        } catch {
          // Non-critical: proceed without extra info
        }

        const { id } = findOrCreateDeveloperUser(
          privyDid,
          credentials.walletAddress || undefined,
          undefined,
          email
        );

        const user = db
          .select()
          .from(users)
          .where(eq(users.id, id))
          .get();

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

      // Token login -- user already validated in authorize()
      if (account.provider === "token") return true;

      // Privy wallet login -- user already created/found in authorize()
      if (account.provider === "privy-wallet") return true;

      // OAuth login
      if (!user.email) return false;

      const provider = account.provider;
      const subject = account.providerAccountId;

      const existing = db
        .select()
        .from(users)
        .where(
          and(
            eq(users.oauthProvider, provider),
            eq(users.oauthSubject, subject)
          )
        )
        .get();

      if (!existing) {
        db.insert(users)
          .values({
            id: uuidv4(),
            email: user.email,
            name: user.name || null,
            oauthProvider: provider,
            oauthSubject: subject,
            role: "developer",
          })
          .run();
      }

      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        // Try direct ID lookup first (token login stores userId)
        if (token.userId) {
          const pmthUser = db
            .select()
            .from(users)
            .where(eq(users.id, token.userId as string))
            .get();

          if (pmthUser) {
            (session.user as Record<string, unknown>).id = pmthUser.id;
            (session.user as Record<string, unknown>).role = pmthUser.role;
            return session;
          }
        }

        // Fall back to OAuth provider lookup
        if (token.provider && token.sub) {
          const pmthUser = db
            .select()
            .from(users)
            .where(
              and(
                eq(users.oauthProvider, token.provider as string),
                eq(users.oauthSubject, token.sub)
              )
            )
            .get();

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
      // For credentials login, store the DB user ID directly
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
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
