import { NextResponse } from "next/server";
import { db } from "@/db/index";
import { signerConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getSignerUrl,
  probeSignerHttpReachability,
} from "@/lib/signer-proxy";

export async function GET() {
  try {
    const signerRows = await db
      .select()
      .from(signerConfig)
      .where(eq(signerConfig.id, "default"))
      .limit(1);
    const signer = signerRows[0];

    let signerReachable = false;
    try {
      const probe = await probeSignerHttpReachability(getSignerUrl(signer));
      signerReachable = probe.reachable;
    } catch {}

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      database: "connected",
      signer: {
        status: signer?.status || "unknown",
        reachable: signerReachable,
        ethAddress: signer?.ethAddress || null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
