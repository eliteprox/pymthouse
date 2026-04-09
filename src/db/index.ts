import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url?.trim()) {
    throw new Error(
      "DATABASE_URL is required. Set it to your PostgreSQL connection string (e.g. Neon).",
    );
  }
  return url.trim();
}

const globalForDb = globalThis as unknown as {
  pymthousePostgres?: ReturnType<typeof postgres>;
};

function createClient() {
  return postgres(requireDatabaseUrl(), { max: 10 });
}

export const postgresClient =
  globalForDb.pymthousePostgres ??= createClient();

export const db = drizzle(postgresClient, { schema });
