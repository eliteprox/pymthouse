import { db } from "@/db/index";
import { signerConfig, streamSessions, transactions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  decodeOrchestratorInfo,
  calculateFeeWei,
  calculatePlatformCut,
  calculateLv2vPixels,
} from "./proto";
import type { AuthResult } from "./auth";

export interface ProxyResult {
  status: number;
  body: unknown;
}

/**
 * Get the singleton signer config.
 */
export function getSignerConfig() {
  return db
    .select()
    .from(signerConfig)
    .where(eq(signerConfig.id, "default"))
    .get();
}

/**
 * Build the internal URL for the signer container.
 */
function getSignerUrl(): string {
  return process.env.SIGNER_INTERNAL_URL || "http://localhost:8935";
}

async function forwardToSigner(
  path: string,
  method: string,
  body?: unknown
): Promise<Response> {
  const url = `${getSignerUrl()}${path}`;
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Proxy: POST /sign-orchestrator-info
 */
export async function proxySignOrchestratorInfo(
  requestBody: unknown,
  auth: AuthResult
): Promise<ProxyResult> {
  const signer = getSignerConfig();
  if (!signer || signer.status !== "running") {
    return { status: 503, body: { error: "Signer is not running" } };
  }

  try {
    const response = await forwardToSigner(
      "/sign-orchestrator-info",
      "POST",
      requestBody
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
  const signer = getSignerConfig();
  if (!signer || signer.status !== "running") {
    return { status: 503, body: { error: "Signer is not running" } };
  }

  const manifestId = requestBody.ManifestID as string | undefined;
  const inPixels = requestBody.InPixels as number | undefined;
  const jobType = requestBody.Type as string | undefined;
  const orchestratorData = requestBody.Orchestrator as string | undefined;

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

  // Upsert StreamSession, linked to end user if token is scoped
  if (manifestId) {
    const existingSession = db
      .select()
      .from(streamSessions)
      .where(
        and(
          eq(streamSessions.manifestId, manifestId),
          eq(streamSessions.status, "active")
        )
      )
      .get();

    if (existingSession) {
      const newTotalPixels = BigInt(existingSession.totalPixels) + pixels;
      const newTotalFeeWei = BigInt(existingSession.totalFeeWei) + feeWei;

      db.update(streamSessions)
        .set({
          totalPixels: Number(newTotalPixels),
          totalFeeWei: newTotalFeeWei.toString(),
          lastPaymentAt: new Date().toISOString(),
        })
        .where(eq(streamSessions.id, existingSession.id))
        .run();
    } else {
      db.insert(streamSessions)
        .values({
          id: uuidv4(),
          endUserId: auth.endUserId || null,
          bearerTokenHash: auth.tokenHash,
          manifestId,
          orchestratorAddress,
          totalPixels: Number(pixels),
          totalFeeWei: feeWei.toString(),
          pricePerUnit: pricePerUnit.toString(),
          pixelsPerUnit: pixelsPerUnit.toString(),
          status: "active",
        })
        .run();
    }
  }

  // Forward to go-livepeer
  try {
    const response = await forwardToSigner(
      "/generate-live-payment",
      "POST",
      requestBody
    );
    const responseBody = await response.json();

    if (response.ok && feeWei > 0n) {
      db.insert(transactions)
        .values({
          id: uuidv4(),
          endUserId: auth.endUserId || null,
          type: "usage",
          amountWei: feeWei.toString(),
          platformCutPercent: signer.defaultCutPercent,
          platformCutWei: platformCutWei.toString(),
          status: "confirmed",
        })
        .run();
    }

    return { status: response.status, body: responseBody };
  } catch (error) {
    console.error("[proxy] Failed to forward generate-live-payment:", error);
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
    const response = await fetch(`${getSignerUrl()}/status`, {
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

  db.update(signerConfig)
    .set({
      status,
      ethAddress: ethAddress || null,
      lastError,
    })
    .where(eq(signerConfig.id, "default"))
    .run();

  return { reachable, ethAddress, containerRunning };
}
