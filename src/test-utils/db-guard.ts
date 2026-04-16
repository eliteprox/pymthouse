import test from "node:test";

/**
 * Gate DB-backed integration tests behind DATABASE_URL so local runs and CI
 * jobs without Postgres silently skip (same pattern as existing *.test.ts files).
 */
export const run = process.env.DATABASE_URL ? test : test.skip;
