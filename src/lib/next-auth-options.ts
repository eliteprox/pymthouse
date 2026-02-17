import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { db } from "@/db/index";
import { users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { validateBearerToken, hasScope } from "@/lib/auth";

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
        const userCount = db.select().from(users).all().length;
        const role = userCount === 0 ? "admin" : "operator";

        db.insert(users)
          .values({
            id: uuidv4(),
            email: user.email,
            name: user.name || null,
            oauthProvider: provider,
            oauthSubject: subject,
            role,
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
