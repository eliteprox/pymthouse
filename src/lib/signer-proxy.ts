import { db } from "@/db/index";
import {
  developerApps,
  oidcClients,
  signerConfig,
  streamSessions,
  transactions,
  usageRecords,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  decodeOrchestratorInfo,
  calculateFeeWei,
  calculatePlatformCut,
  calculateLv2vPixels,
} from "./proto";
import type { AuthResult } from "./auth";
import { issueSignerDmzToken } from "./signer-dmz-token";
import { getSenderInfo } from "./signer-cli";

export interface ProxyResult {
  status: number;
  body: unknown;
}

/**
 * Single shared clearinghouse signer (`id === "default"`).
 * Scale horizontally with multiple replicas behind one URL / load balancer — routing stays here.
 */
export async function getDefaultSigner() {
  const signerRows = await db
    .select()
    .from(signerConfig)
    .where(eq(signerConfig.id, "default"))
    .limit(1);
  return signerRows[0] ?? null;
}

/**
 * Resolve `developer_apps.id` from JWT/session `appId` (OIDC `client_id`).
 */
export async function resolveDeveloperAppIdFromAuthAppId(
  authAppId: string | null | undefined,
): Promise<string | null> {
  if (!authAppId?.trim()) return null;
  const trimmed = authAppId.trim();

  const byOidc = await db
    .select({ id: developerApps.id })
    .from(developerApps)
    .innerJoin(oidcClients, eq(developerApps.oidcClientId, oidcClients.id))
    .where(eq(oidcClients.clientId, trimmed))
    .limit(1);
  return byOidc[0]?.id ?? null;
}

export async function getSignerRoutingContext(authAppId?: string | null) {
  const signer = await getDefaultSigner();
  const providerAppId = await resolveDeveloperAppIdFromAuthAppId(authAppId);
  return { signer, providerAppId };
}

/**
 * Build the internal URL for the signer container.
 *
 * Always returned without a trailing slash so callers can safely concatenate
 * a leading-slash path (`${base}${path}`). A stored `http://host:8081/` would
 * otherwise produce `//sign-orchestrator-info`, which Go's ServeMux 301s to
 * the canonical path — undici follows the 301 as GET, and go-livepeer's
 * signer replies with `Method Not Allowed` on GET, surfacing as a 502 with
 * a "Unexpected token 'M'" JSON parse error in the proxy layer.
 */
function getSignerUrl(signer?: typeof signerConfig.$inferSelect | null): string {
  const base =
    signer?.signerUrl
    || process.env.SIGNER_INTERNAL_URL
    || `http://localhost:${signer?.signerPort ?? 8081}`;
  return base.replace(/\/+$/, "");
}

/**
 * Per-subject LRU cache for DMZ bearer tokens. Mirrors the scheme in `signer-cli.ts`:
 * DMZ tokens are minted for ~4 minutes; we serve cached copies for ~3.5 minutes and
 * mint a fresh one slightly before expiry so in-flight Apache verification never
 * trips the clock skew / leeway window.
 *
 * Keyed by the subject we put in the JWT (`sub` claim), so two callers acting on
 * behalf of the same principal reuse the same token instead of minting one per request.
 */
const HTTP_DMZ_TOKEN_MAX_ENTRIES = 100;
const HTTP_DMZ_TOKEN_TTL_MS = 3.5 * 60 * 1000;
const httpDmzTokenCache = new Map<string, { token: string; expMs: number }>();

async function getHttpDmzBearerForSubject(subject: string): Promise<string> {
  const now = Date.now();
  const cached = httpDmzTokenCache.get(subject);
  if (cached && cached.expMs > now + 15_000) {
    // Bump recency: re-insertion moves the entry to the end of the Map iteration order.
    httpDmzTokenCache.delete(subject);
    httpDmzTokenCache.set(subject, cached);
    return cached.token;
  }

  const token = await issueSignerDmzToken({ gate: "http", subject });
  httpDmzTokenCache.set(subject, { token, expMs: now + HTTP_DMZ_TOKEN_TTL_MS });

  if (httpDmzTokenCache.size > HTTP_DMZ_TOKEN_MAX_ENTRIES) {
    const oldest = httpDmzTokenCache.keys().next().value;
    if (oldest !== undefined) httpDmzTokenCache.delete(oldest);
  }

  return token;
}

async function forwardToSigner(
  signer: typeof signerConfig.$inferSelect | null | undefined,
  path: string,
  method: string,
  body: unknown | undefined,
  auth: AuthResult,
): Promise<Response> {
  const url = `${getSignerUrl(signer)}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.SIGNER_DMZ_FORWARD_JWT !== "false") {
    // Fall back to sessionId (always populated on AuthResult) so unauthenticated-but-
    // session-scoped callers don't collapse onto a single shared "signer-proxy" token —
    // each session keeps its own cache entry and stays traceable in upstream logs.
    const sub =
      auth.userId || auth.endUserId || auth.appId || auth.sessionId;
    const token = await getHttpDmzBearerForSubject(sub);
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    return await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Proxy: POST /sign-orchestrator-info
 */
export async function proxySignOrchestratorInfo(
  requestBody: unknown,
  auth: AuthResult
): Promise<ProxyResult> {
  const { signer } = await getSignerRoutingContext(auth.appId);
  if (!signer || signer.status !== "running") {
    return { status: 503, body: { error: "Signer is not running" } };
  }

  try {
    const response = await forwardToSigner(
      signer,
      "/sign-orchestrator-info",
      "POST",
      requestBody,
      auth,
    );
    const responseBody = await response.json();

    if (response.ok) {
      const who = auth.endUserId || auth.userId || "unknown";
      console.log(`[proxy] sign-orchestrator-info forwarded for ${who}`);
    }

    return { status: response.status, body: responseBody };
  } catch (error) {
    console.error("[proxy] Failed to forward sign-orchestrator-info:", error);
    return { status: 502, body: { error: "Failed to reach signer" } };
  }
}

/**
 * Proxy: POST /generate-live-payment
 * Tracks usage per end user when the token is scoped to one.
 */
export async function proxyGenerateLivePayment(
  requestBody: Record<string, unknown>,
  auth: AuthResult
): Promise<ProxyResult> {
  const { signer, providerAppId } = await getSignerRoutingContext(auth.appId);
  if (!signer || signer.status !== "running") {
    return { status: 503, body: { error: "Signer is not running" } };
  }

  const manifestId = (requestBody.ManifestID ??
    requestBody.manifestId) as string | undefined;
  const inPixels = (requestBody.InPixels ?? requestBody.inPixels) as
    | number
    | undefined;
  const jobType = (requestBody.Type ?? requestBody.type) as string | undefined;
  // python-gateway `payments_base._build_payment_payload` uses lowercase keys;
  // tests and some clients use Go-style PascalCase.
  const orchestratorData = (requestBody.Orchestrator ??
    requestBody.orchestrator) as string | undefined;

  let pricePerUnit = 0n;
  let pixelsPerUnit = 1n;
  let orchestratorAddress: string | undefined;

  if (orchestratorData) {
    try {
      const orchInfo = await decodeOrchestratorInfo(orchestratorData);
      if (orchInfo.priceInfo) {
        pricePerUnit = BigInt(orchInfo.priceInfo.pricePerUnit);
        pixelsPerUnit = BigInt(orchInfo.priceInfo.pixelsPerUnit || 1);
      }
      if (orchInfo.address) {
        orchestratorAddress =
          "0x" + Buffer.from(orchInfo.address).toString("hex");
      }
    } catch (err) {
      console.warn("[proxy] Failed to decode OrchestratorInfo:", err);
    }
  }

  let pixels: bigint;
  if (inPixels && inPixels > 0) {
    pixels = BigInt(inPixels);
  } else if (jobType === "lv2v") {
    pixels = calculateLv2vPixels(1);
  } else {
    pixels = 0n;
  }

  const feeWei = calculateFeeWei(pixels, pricePerUnit, pixelsPerUnit);
  const platformCutWei = calculatePlatformCut(
    feeWei,
    signer.defaultCutPercent
  );
  const nowIso = new Date().toISOString();
  let streamSessionId: string | null = null;

  // Upsert StreamSession, linked to end user if token is scoped
  if (manifestId) {
    const sessionRows = await db
      .select()
      .from(streamSessions)
      .where(
        and(
          eq(streamSessions.manifestId, manifestId),
          eq(streamSessions.status, "active"),
        ),
      )
      .limit(1);
    const existingSession = sessionRows[0];

    if (existingSession) {
      streamSessionId = existingSession.id;
      const newTotalPixels = BigInt(existingSession.totalPixels) + pixels;
      const newTotalFeeWei = BigInt(existingSession.totalFeeWei) + feeWei;

      await db
        .update(streamSessions)
        .set({
          totalPixels: Number(newTotalPixels),
          totalFeeWei: newTotalFeeWei.toString(),
          lastPaymentAt: nowIso,
        })
        .where(eq(streamSessions.id, existingSession.id));
    } else {
      const newSessionId = uuidv4();
      streamSessionId = newSessionId;
      await db.insert(streamSessions).values({
        id: newSessionId,
        endUserId: auth.endUserId || null,
        appId: providerAppId ?? auth.appId ?? null,
        bearerTokenHash: auth.tokenHash,
        manifestId,
        orchestratorAddress,
        totalPixels: Number(pixels),
        totalFeeWei: feeWei.toString(),
        pricePerUnit: pricePerUnit.toString(),
        pixelsPerUnit: pixelsPerUnit.toString(),
        status: "active",
        lastPaymentAt: nowIso,
      });
    }
  }

  // Forward to go-livepeer
  try {
    const response = await forwardToSigner(
      signer,
      "/generate-live-payment",
      "POST",
      requestBody,
      auth,
    );
    const responseBody = await response.json();

    if (response.ok && feeWei > 0n) {
      const requestId =
        (requestBody.requestId as string | undefined)
        || (requestBody.RequestID as string | undefined)
        || (requestBody.ManifestID as string | undefined)
        || uuidv4();

      // Check for an existing usage record first to prevent duplicate inserts on retries
      let existingUsage = null;
      if (providerAppId) {
        const usageRows = await db
          .select()
          .from(usageRecords)
          .where(
            and(
              eq(usageRecords.clientId, providerAppId),
              eq(usageRecords.requestId, requestId),
            ),
          )
          .limit(1);
        existingUsage = usageRows[0] ?? null;
      }

      if (!existingUsage) {
        await db.insert(transactions).values({
          id: uuidv4(),
          endUserId: auth.endUserId || null,
          appId: providerAppId ?? auth.appId ?? null,
          clientId: providerAppId,
          streamSessionId,
          type: "usage",
          amountWei: feeWei.toString(),
          platformCutPercent: signer.defaultCutPercent,
          platformCutWei: platformCutWei.toString(),
          status: "confirmed",
        });

        if (providerAppId) {
          await db.insert(usageRecords).values({
            id: uuidv4(),
            requestId,
            userId: auth.userId || auth.endUserId || null,
            clientId: providerAppId,
            modelId: typeof requestBody.modelId === "string" ? requestBody.modelId : null,
            units: pixels.toString(),
            fee: feeWei.toString(),
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    return { status: response.status, body: responseBody };
  } catch (error) {
    console.error("[proxy] Failed to forward generate-live-payment:", error);
    return { status: 502, body: { error: "Failed to reach signer" } };
  }
}

/**
 * Proxy: POST /sign-byoc-job
 */
export async function proxySignByocJob(
  requestBody: unknown,
  auth: AuthResult
): Promise<ProxyResult> {
  const { signer } = await getSignerRoutingContext(auth.appId);
  if (!signer || signer.status !== "running") {
    return { status: 503, body: { error: "Signer is not running" } };
  }

  try {
    const response = await forwardToSigner(
      signer,
      "/sign-byoc-job",
      "POST",
      requestBody,
      auth,
    );
    const responseBody = await response.json();

    if (response.ok) {
      const who = auth.endUserId || auth.userId || "unknown";
      console.log(`[proxy] sign-byoc-job forwarded for ${who}`);
    }

    return { status: response.status, body: responseBody };
  } catch (error) {
    console.error("[proxy] Failed to forward sign-byoc-job:", error);
    return { status: 502, body: { error: "Failed to reach signer" } };
  }
}

/**
 * Proxy: GET /discover-orchestrators
 */
export async function proxyDiscoverOrchestrators(
  auth: AuthResult
): Promise<ProxyResult> {
  const { signer } = await getSignerRoutingContext(auth.appId);
  if (!signer || signer.status !== "running") {
    return { status: 503, body: { error: "Signer is not running" } };
  }

  try {
    const response = await forwardToSigner(
      signer,
      "/discover-orchestrators",
      "GET",
      undefined,
      auth,
    );
    const responseBody = await response.json();

    if (response.ok) {
      const who = auth.endUserId || auth.userId || "unknown";
      console.log(`[proxy] discover-orchestrators forwarded for ${who}`);
    }

    return { status: response.status, body: responseBody };
  } catch (error) {
    console.error("[proxy] Failed to forward discover-orchestrators:", error);
    return { status: 502, body: { error: "Failed to reach signer" } };
  }
}

/**
 * Sync signer status by checking both the Docker container and the HTTP endpoint.
 */
export async function syncSignerStatus(): Promise<{
  reachable: boolean;
  ethAddress?: string;
  containerRunning?: boolean;
}> {
  // Check if the HTTP endpoint responds
  let reachable = false;
  let ethAddress: string | undefined;

  try {
    const defaultSigner = await getDefaultSigner();
    const response = await fetch(`${getSignerUrl(defaultSigner)}/status`, {
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      const data = await response.json();
      ethAddress = data.Address || data.address || undefined;
      reachable = true;
    }
  } catch {}

  // Check Docker container state
  let containerRunning = false;
  let lastError: string | null = null;
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    const { stdout } = await execAsync(
      "docker compose ps --format json go-livepeer",
      { cwd: process.cwd(), timeout: 5000 }
    );

    if (stdout.trim()) {
      const info = JSON.parse(stdout.trim());
      const state = (info.State || info.state || "").toLowerCase();
      containerRunning = state === "running";

      if (!containerRunning && state) {
        lastError = `Container state: ${state}`;
        // Grab last few log lines for the error
        try {
          const { stdout: logs } = await execAsync(
            "docker compose logs --no-color --tail=3 go-livepeer 2>&1",
            { cwd: process.cwd(), timeout: 5000 }
          );
          const errorLine = logs
            .split("\n")
            .filter((l) => l.includes("Error") || l.includes("error"))
            .pop();
          if (errorLine) {
            lastError = errorLine.replace(/^go-livepeer-\d+\s+\|\s*/, "");
          }
        } catch {}
      }
    }
  } catch {}

  // Determine status
  let status: string;
  if (reachable) {
    status = "running";
    lastError = null;
  } else if (containerRunning) {
    status = "running"; // container up but HTTP not ready yet
  } else {
    status = "stopped";
  }

  // Fetch deposit/reserve from CLI port (same data livepeer_cli reads).
  // Best-effort: only updates if the CLI is reachable.
  const dbSet: Record<string, unknown> = {
    status,
    ethAddress: ethAddress || null,
    lastError,
  };
  const senderInfo = await getSenderInfo();
  if (senderInfo) {
    dbSet.depositWei = senderInfo.deposit;
    dbSet.reserveWei = senderInfo.reserve.fundsRemaining;
  }

  await db
    .update(signerConfig)
    .set(dbSet)
    .where(eq(signerConfig.id, "default"));

  return { reachable, ethAddress, containerRunning };
}
