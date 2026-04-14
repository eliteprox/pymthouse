/**
 * Apply Drizzle SQL migrations to PostgreSQL (DATABASE_URL).
 */
import "./load-env-first";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "../src/db/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const { signerConfig } = schema;

async function seedDefaultSigner(dbUrl: string) {
  const client = postgres(dbUrl, { max: 1 });
  const db = drizzle(client, { schema });
  const now = new Date().toISOString();
  await db
    .insert(signerConfig)
    .values({
      id: "default",
      name: "pymthouse signer",
      network: "arbitrum-one-mainnet",
      ethRpcUrl: "https://arb1.arbitrum.io/rpc",
      signerPort: 8081,
      status: "stopped",
      defaultCutPercent: 15.0,
      billingMode: "delegated",
      createdAt: now,
    })
    .onConflictDoNothing({ target: signerConfig.id });
  await client.end({ timeout: 5 });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("[db:migrate] DATABASE_URL is not set.");
    process.exit(1);
  }

  const migrationClient = postgres(databaseUrl, { max: 1 });
  await migrate(drizzle(migrationClient, { schema }), {
    migrationsFolder: path.join(PROJECT_ROOT, "drizzle"),
  });
  await migrationClient.end({ timeout: 5 });

  await seedDefaultSigner(databaseUrl);

  console.log("[db:migrate] PostgreSQL migrations applied.");
}

main().catch((err) => {
  console.error("[db:migrate] Error:", err);
  process.exit(1);
});
