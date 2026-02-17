import { db } from "@/db/index";
import { signerConfig, streamSessions, transactions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface MetricsPayload {
  ethAddress: string | null;
  network: string;
  timestamp: string;
  metrics: {
    activeStreams: number;
    totalStreams: number;
    totalPixelsSigned: string;
    totalFeeWei: string;
    totalTransactions: number;
    signerStatus: string;
  };
}

const NAAP_METRICS_URL = process.env.NAAP_METRICS_URL;

export function isMetricsEnabled(): boolean {
  return !!NAAP_METRICS_URL;
}

export function collectMetrics(): MetricsPayload | null {
  const signer = db
    .select()
    .from(signerConfig)
    .where(eq(signerConfig.id, "default"))
    .get();

  if (!signer?.naapApiKey) return null;

  const activeSessions = db
    .select()
    .from(streamSessions)
    .where(eq(streamSessions.status, "active"))
    .all();

  const allSessions = db.select().from(streamSessions).all();
  const txns = db.select().from(transactions).all();

  let totalPixels = 0n;
  let totalFee = 0n;
  for (const session of allSessions) {
    totalPixels += BigInt(session.totalPixels);
    totalFee += BigInt(session.totalFeeWei);
  }

  return {
    ethAddress: signer.ethAddress,
    network: signer.network,
    timestamp: new Date().toISOString(),
    metrics: {
      activeStreams: activeSessions.length,
      totalStreams: allSessions.length,
      totalPixelsSigned: totalPixels.toString(),
      totalFeeWei: totalFee.toString(),
      totalTransactions: txns.length,
      signerStatus: signer.status,
    },
  };
}

export async function reportMetrics(): Promise<boolean> {
  if (!NAAP_METRICS_URL) return false;

  const signer = db
    .select()
    .from(signerConfig)
    .where(eq(signerConfig.id, "default"))
    .get();

  if (!signer?.naapApiKey) return false;

  const payload = collectMetrics();
  if (!payload) return false;

  try {
    const response = await fetch(`${NAAP_METRICS_URL}/api/v1/metrics/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signer.naapApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    return response.ok;
  } catch {
    return false;
  }
}
