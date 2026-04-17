import assert from "node:assert/strict";

import type { AuthResult } from "@/lib/auth";
import { validateBearerToken } from "@/lib/auth";
import { db } from "@/db/index";
import { streamSessions, transactions } from "@/db/schema";
import { countActiveStreamsByRecentPayment } from "@/lib/active-streams";
import { proxyGenerateLivePayment } from "@/lib/signer-proxy";
import { run } from "@/test-utils/db-guard";
import {
  basicAuthHeader,
  cleanupTestApp,
  createAppUser,
  createJobTokenForApp,
  ensureRunningSigner,
  seedDeveloperAppWithClient,
} from "@/test-utils/fixtures";
import { mockSignerFetch } from "@/test-utils/mock-signer";
import { buildOrchestratorInfoBase64 } from "@/test-utils/orchestrator-info";
import { eq, and } from "drizzle-orm";

const PER_REQUEST_PIXELS = 1_000_000;
const PRICE_PER_UNIT = 1_000_000_000;
const PIXELS_PER_UNIT = 1;
const PER_REQUEST_FEE_WEI =
  (BigInt(PER_REQUEST_PIXELS) * BigInt(PRICE_PER_UNIT)) / BigInt(PIXELS_PER_UNIT);
/** Kept moderate so the suite stays fast on remote DBs; per-request fee is still huge for bigint totals. */
const VOLUME = 40;

/**
 * Integration test:
 *   - Mock the remote signer at the `fetch` boundary.
 *   - Drive **`proxyGenerateLivePayment`** directly (same code as the HTTP route)
 *     with cached **`AuthResult`** from **`validateBearerToken`** — avoids Next
 *     request handling and repeated route auth on every iteration.
 *   - Validate persistence + bigint totals via **`GET /api/v1/apps/{id}/usage`**
 *     (Basic auth). Route-level auth for `generate-live-payment` is covered in
 *     **`proxy-routes.test.ts`**.
 */
run("high-volume signer usage is persisted and summarised via Usage API", async (t) => {
  const { GET: readUsage } = await import("@/app/api/v1/apps/[id]/usage/route");

  const restoreSigner = await ensureRunningSigner();
  t.after(restoreSigner);

  const app = await seedDeveloperAppWithClient({ status: "approved" });
  t.after(() => cleanupTestApp(app));

  const ownerToken = await createJobTokenForApp({
    userId: app.userId,
    clientId: app.clientId,
    scopes: "sign:job",
  });

  const appUserAlpha = await createAppUser({
    clientId: app.clientId,
    externalUserId: "ext-alpha",
  });
  const appUserBeta = await createAppUser({
    clientId: app.clientId,
    externalUserId: "ext-beta",
  });
  const alphaToken = await createJobTokenForApp({
    userId: appUserAlpha.id,
    clientId: app.clientId,
    scopes: "sign:job",
  });
  const betaToken = await createJobTokenForApp({
    userId: appUserBeta.id,
    clientId: app.clientId,
    scopes: "sign:job",
  });

  const ownerAuth = await validateBearerToken(ownerToken);
  const alphaAuth = await validateBearerToken(alphaToken);
  const betaAuth = await validateBearerToken(betaToken);
  assert.ok(ownerAuth, "owner token resolves");
  assert.ok(alphaAuth, "alpha token resolves");
  assert.ok(betaAuth, "beta token resolves");

  const orch = await buildOrchestratorInfoBase64({
    pricePerUnit: PRICE_PER_UNIT,
    pixelsPerUnit: PIXELS_PER_UNIT,
  });

  const mock = mockSignerFetch({ signerHost: "http://test-signer.invalid" });
  t.after(mock.restore);

  function paymentBody(requestId: string, manifestId: string): Record<string, unknown> {
    return {
      ManifestID: manifestId,
      RequestID: requestId,
      InPixels: PER_REQUEST_PIXELS,
      Orchestrator: orch,
    };
  }

  async function sendPayment(auth: AuthResult, requestId: string, manifestId: string) {
    const result = await proxyGenerateLivePayment(paymentBody(requestId, manifestId), auth);
    assert.equal(
      result.status,
      200,
      `proxyGenerateLivePayment expected 200, got ${result.status}: ${JSON.stringify(result.body)}`,
    );
  }

  // Distribute volume across: owner (no endUser), alpha, beta.
  const alphaCount = Math.floor(VOLUME * 0.4);
  const betaCount = Math.floor(VOLUME * 0.3);
  const ownerCount = VOLUME - alphaCount - betaCount;

  let successes = 0;

  for (let i = 0; i < ownerCount; i++) {
    await sendPayment(ownerAuth!, `owner-req-${i}`, `owner-manifest-${i}`);
    successes++;
  }
  for (let i = 0; i < alphaCount; i++) {
    await sendPayment(alphaAuth!, `alpha-req-${i}`, `alpha-manifest-${i}`);
    successes++;
  }
  for (let i = 0; i < betaCount; i++) {
    await sendPayment(betaAuth!, `beta-req-${i}`, `beta-manifest-${i}`);
    successes++;
  }

  assert.equal(successes, VOLUME);
  assert.equal(
    mock.calls.filter((c) => c.url.endsWith("/generate-live-payment")).length,
    VOLUME,
    "every payment should have been forwarded to the mocked signer exactly once",
  );

  // Idempotency / dedupe: re-sending the same requestId twice should not
  // produce additional usage rows.
  await sendPayment(ownerAuth!, "dupe-req-0", "dupe-manifest-0");
  await sendPayment(ownerAuth!, "dupe-req-0", "dupe-manifest-0");

  const expectedRequestCount = VOLUME + 1;
  const expectedTotalFeeWei = (PER_REQUEST_FEE_WEI * BigInt(expectedRequestCount)).toString();

  const dupeSessionRows = await db
    .select()
    .from(streamSessions)
    .where(eq(streamSessions.manifestId, "dupe-manifest-0"))
    .limit(1);
  const dupeSession = dupeSessionRows[0];
  assert.ok(dupeSession, "stream session persisted for manifest");

  const linkedTxnRows = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.streamSessionId, dupeSession.id),
        eq(transactions.type, "usage"),
        eq(transactions.status, "confirmed"),
      ),
    );
  assert.equal(
    linkedTxnRows.length,
    1,
    "exactly one confirmed usage transaction links to stream session when requestId is duplicated",
  );

  const activeStreamCount = await countActiveStreamsByRecentPayment();
  assert.ok(
    activeStreamCount > 0,
    "recent-payment active stream view should report active streams after payment traffic",
  );

  async function fetchUsage(query = "") {
    const res = await readUsage(
      new Request(`http://localhost/api/v1/apps/${app.clientId}/usage${query}`, {
        method: "GET",
        headers: {
          Authorization: basicAuthHeader(app.clientId, app.clientSecret),
        },
      }) as never,
      { params: Promise.resolve({ id: app.clientId }) },
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  const overall = await fetchUsage();
  assert.equal(overall.status, 200);
  assert.equal((overall.body as { clientId: string }).clientId, app.clientId);
  const totals = (overall.body as { totals: { requestCount: number; totalFeeWei: string } }).totals;
  assert.equal(totals.requestCount, expectedRequestCount, "one row per unique requestId");
  assert.equal(totals.totalFeeWei, expectedTotalFeeWei, "bigint sum matches pricePerUnit * pixels * volume");

  const byUser = await fetchUsage("?groupBy=user");
  assert.equal(byUser.status, 200);
  const buckets = (byUser.body as {
    byUser?: {
      endUserId: string;
      externalUserId: string | null;
      feeWei: string;
      requestCount: number;
    }[];
  }).byUser;
  assert.ok(Array.isArray(buckets), "byUser array present when groupBy=user");
  assert.equal(buckets!.length, 3, "three buckets: owner(user), alpha, beta");

  const alphaBucket = buckets!.find((b) => b.endUserId === appUserAlpha.id);
  const betaBucket = buckets!.find((b) => b.endUserId === appUserBeta.id);
  const ownerBucket = buckets!.find((b) => b.endUserId === app.userId);

  assert.ok(alphaBucket, "alpha end user present in byUser");
  assert.equal(alphaBucket!.externalUserId, "ext-alpha");
  assert.equal(alphaBucket!.requestCount, alphaCount);
  assert.equal(
    alphaBucket!.feeWei,
    (PER_REQUEST_FEE_WEI * BigInt(alphaCount)).toString(),
  );

  assert.ok(betaBucket, "beta end user present in byUser");
  assert.equal(betaBucket!.externalUserId, "ext-beta");
  assert.equal(betaBucket!.requestCount, betaCount);
  assert.equal(
    betaBucket!.feeWei,
    (PER_REQUEST_FEE_WEI * BigInt(betaCount)).toString(),
  );

  assert.ok(ownerBucket, "owner userId bucket present");
  assert.equal(ownerBucket!.externalUserId, null, "owner is a platform user, not an app_user");
  assert.equal(ownerBucket!.requestCount, ownerCount + 1, "owner bucket includes dedup single row");

  // userId filter: only alpha rows.
  const alphaOnly = await fetchUsage(`?userId=${encodeURIComponent(appUserAlpha.id)}`);
  assert.equal(alphaOnly.status, 200);
  const alphaTotals = (alphaOnly.body as { totals: { requestCount: number; totalFeeWei: string } }).totals;
  assert.equal(alphaTotals.requestCount, alphaCount);
  assert.equal(
    alphaTotals.totalFeeWei,
    (PER_REQUEST_FEE_WEI * BigInt(alphaCount)).toString(),
  );

  // Date window that excludes all rows -> zero totals.
  const emptyWindow = await fetchUsage(
    "?startDate=1970-01-01T00:00:00.000Z&endDate=1970-01-02T00:00:00.000Z",
  );
  assert.equal(emptyWindow.status, 200);
  const emptyTotals = (emptyWindow.body as { totals: { requestCount: number; totalFeeWei: string } }).totals;
  assert.equal(emptyTotals.requestCount, 0);
  assert.equal(emptyTotals.totalFeeWei, "0");

  // Invalid date parameter -> 400.
  const badDate = await readUsage(
    new Request(`http://localhost/api/v1/apps/${app.clientId}/usage?startDate=not-a-date`, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(app.clientId, app.clientSecret),
      },
    }) as never,
    { params: Promise.resolve({ id: app.clientId }) },
  );
  assert.equal(badDate.status, 400);
});
