/**
 * Loaded before tests so modules that import `@/db/index` can initialize without
 * throwing when DATABASE_URL is unset (e.g. CI / local `npm test`).
 */
if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/pymthouse_test_unset";
}
