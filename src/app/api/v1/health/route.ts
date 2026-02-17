import { NextResponse } from "next/server";
import { db } from "@/db/index";
import { signerConfig } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const signer = db
      .select()
      .from(signerConfig)
      .where(eq(signerConfig.id, "default"))
      .get();

    const signerUrl =
      process.env.SIGNER_INTERNAL_URL || "http://localhost:8935";

    let signerReachable = false;
    try {
      const res = await fetch(`${signerUrl}/status`, {
        signal: AbortSignal.timeout(5000),
      });
      signerReachable = res.ok;
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
