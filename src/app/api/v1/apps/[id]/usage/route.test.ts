import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { run } from "@/test-utils/db-guard";
import {
  basicAuthHeader,
  cleanupTestApp,
  createAppUser,
  seedDeveloperAppWithClient,
} from "@/test-utils/fixtures";

async function seedUsage(opts: {
  clientId: string;
  userId: string | null;
  feeWei: bigint;
  units?: bigint;
  createdAt?: string;
  requestId?: string;
}) {
  const { db } = await import("@/db/index");
  const { usageRecords } = await import("@/db/schema");
  await db.insert(usageRecords).values({
    id: randomUUID(),
    requestId: opts.requestId ?? randomUUID(),
    clientId: opts.clientId,
    userId: opts.userId,
    units: (opts.units ?? 1n).toString(),
    fee: opts.feeWei.toString(),
    createdAt: opts.createdAt ?? new Date().toISOString(),
  });
}

run("usage API requires a matching client or authorized session", async (t) => {
  const { GET } = await import("./route");
  const app = await seedDeveloperAppWithClient({ status: "approved" });
  t.after(() => cleanupTestApp(app));

  // No auth -> 404 (handler deliberately opaque).
  const anonymous = await GET(
    new Request(`http://localhost/api/v1/apps/${app.clientId}/usage`) as never,
    { params: Promise.resolve({ id: app.clientId }) },
  );
  assert.equal(anonymous.status, 404);

  // Wrong secret -> 404.
  const wrong = await GET(
    new Request(`http://localhost/api/v1/apps/${app.clientId}/usage`, {
      headers: { Authorization: basicAuthHeader(app.clientId, "pmth_cs_nope") },
    }) as never,
    { params: Promise.resolve({ id: app.clientId }) },
  );
  assert.equal(wrong.status, 404);

  // Basic auth for client A cannot read client B's usage.
  const other = await seedDeveloperAppWithClient({ status: "approved" });
  t.after(() => cleanupTestApp(other));
  const crossTenant = await GET(
    new Request(`http://localhost/api/v1/apps/${other.clientId}/usage`, {
      headers: { Authorization: basicAuthHeader(app.clientId, app.clientSecret) },
    }) as never,
    { params: Promise.resolve({ id: other.clientId }) },
  );
  assert.equal(crossTenant.status, 404);

  // Correct Basic auth -> 200.
  const ok = await GET(
    new Request(`http://localhost/api/v1/apps/${app.clientId}/usage`, {
      headers: { Authorization: basicAuthHeader(app.clientId, app.clientSecret) },
    }) as never,
    { params: Promise.resolve({ id: app.clientId }) },
  );
  assert.equal(ok.status, 200);
});

run("usage API aggregates seeded rows, filters by date and user, and validates input", async (t) => {
  const { GET } = await import("./route");

  const app = await seedDeveloperAppWithClient({ status: "approved" });
  t.after(() => cleanupTestApp(app));

  const alpha = await createAppUser({
    clientId: app.clientId,
    externalUserId: "alpha-ext",
  });
  const beta = await createAppUser({
    clientId: app.clientId,
    externalUserId: "beta-ext",
  });

  const inside1 = "2026-06-01T00:00:00.000Z";
  const inside2 = "2026-06-15T00:00:00.000Z";
  const outside = "2020-01-01T00:00:00.000Z";

  await seedUsage({ clientId: app.clientId, userId: alpha.id, feeWei: 1_000_000_000_000_000n, createdAt: inside1 });
  await seedUsage({ clientId: app.clientId, userId: alpha.id, feeWei: 2_000_000_000_000_000n, createdAt: inside2 });
  await seedUsage({ clientId: app.clientId, userId: beta.id, feeWei: 500_000_000_000_000n, createdAt: inside1 });
  await seedUsage({ clientId: app.clientId, userId: null, feeWei: 10n, createdAt: inside2 });
  await seedUsage({ clientId: app.clientId, userId: alpha.id, feeWei: 7n, createdAt: outside });

  async function call(query = "") {
    const res = await GET(
      new Request(`http://localhost/api/v1/apps/${app.clientId}/usage${query}`, {
        headers: { Authorization: basicAuthHeader(app.clientId, app.clientSecret) },
      }) as never,
      { params: Promise.resolve({ id: app.clientId }) },
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  // Totals across all rows.
  const all = await call();
  assert.equal(all.status, 200);
  const allTotals = (all.body as { totals: { requestCount: number; totalFeeWei: string } }).totals;
  assert.equal(allTotals.requestCount, 5);
  assert.equal(
    allTotals.totalFeeWei,
    (1_000_000_000_000_000n + 2_000_000_000_000_000n + 500_000_000_000_000n + 10n + 7n).toString(),
  );

  // Date-windowed totals exclude the "outside" row.
  const windowed = await call(`?startDate=2026-05-01T00:00:00.000Z&endDate=2026-07-01T00:00:00.000Z`);
  assert.equal(windowed.status, 200);
  const windowedTotals = (windowed.body as { totals: { requestCount: number; totalFeeWei: string } }).totals;
  assert.equal(windowedTotals.requestCount, 4);
  assert.equal(
    windowedTotals.totalFeeWei,
    (1_000_000_000_000_000n + 2_000_000_000_000_000n + 500_000_000_000_000n + 10n).toString(),
  );

  // userId filter narrows to one app_user.
  const betaOnly = await call(`?userId=${encodeURIComponent(beta.id)}`);
  assert.equal(betaOnly.status, 200);
  const betaTotals = (betaOnly.body as { totals: { requestCount: number; totalFeeWei: string } }).totals;
  assert.equal(betaTotals.requestCount, 1);
  assert.equal(betaTotals.totalFeeWei, "500000000000000");

  // groupBy=user exposes external ids and an "unknown" bucket for null user_id rows.
  const grouped = await call("?groupBy=user");
  const buckets = (grouped.body as {
    byUser: { endUserId: string; externalUserId: string | null; requestCount: number; feeWei: string }[];
  }).byUser;
  assert.equal(buckets.length, 3);
  const byId = new Map(buckets.map((b) => [b.endUserId, b]));
  assert.equal(byId.get(alpha.id)!.externalUserId, "alpha-ext");
  assert.equal(byId.get(alpha.id)!.requestCount, 3);
  assert.equal(byId.get(beta.id)!.externalUserId, "beta-ext");
  assert.equal(byId.get("unknown")!.externalUserId, null);
  assert.equal(byId.get("unknown")!.requestCount, 1);

  // Input validation.
  const badStart = await call("?startDate=not-a-date");
  assert.equal(badStart.status, 400);
  const badEnd = await call("?endDate=still-not-a-date");
  assert.equal(badEnd.status, 400);
});
