import { db } from "@/db/index";
import { signerConfig, streamSessions, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { countActiveStreamsByRecentPayment } from "@/lib/active-streams";

interface MetricsPayload {
  ethAddress: string | null;
  network: string;
  timestamp: string;
  metrics: {
    activeStreams: number;
    totalStreams: number;
    /** Confirmed usage rows (signer billing events). */
    usagePaymentCount: number;
    totalFeeWei: string;
    totalTransactions: number;
    signerStatus: string;
  };
}

const NAAP_METRICS_URL = process.env.NAAP_METRICS_URL;

export function isMetricsEnabled(): boolean {
  return !!NAAP_METRICS_URL;
}

export async function collectMetrics(): Promise<MetricsPayload | null> {
  const signerRows = await db
    .select()
    .from(signerConfig)
    .where(eq(signerConfig.id, "default"))
    .limit(1);
  const signer = signerRows[0];

  if (!signer?.naapApiKey) return null;

  const [activeStreamCount, allSessions, txns] = await Promise.all([
    countActiveStreamsByRecentPayment(),
    db.select().from(streamSessions),
    db.select().from(transactions),
  ]);

  let totalFee = 0n;
  for (const session of allSessions) {
    totalFee += BigInt(session.totalFeeWei);
  }

  const usagePaymentCount = txns.filter(
    (t) => t.type === "usage" && t.status === "confirmed",
  ).length;

  return {
    ethAddress: signer.ethAddress,
    network: signer.network,
    timestamp: new Date().toISOString(),
    metrics: {
      activeStreams: activeStreamCount,
      totalStreams: allSessions.length,
      usagePaymentCount,
      totalFeeWei: totalFee.toString(),
      totalTransactions: txns.length,
      signerStatus: signer.status,
    },
  };
}

export async function reportMetrics(): Promise<boolean> {
  if (!NAAP_METRICS_URL) return false;

  const signerRows = await db
    .select()
    .from(signerConfig)
    .where(eq(signerConfig.id, "default"))
    .limit(1);
  const signer = signerRows[0];

  if (!signer?.naapApiKey) return false;

  const payload = await collectMetrics();
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
