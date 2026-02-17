import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { signerConfig, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest, hasScope } from "@/lib/auth";
import { syncSignerStatus } from "@/lib/signer-proxy";

/**
 * GET /api/v1/signer -- Get singleton signer status + config
 */
export async function GET(request: NextRequest) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Sync live status from go-livepeer container
  const liveStatus = await syncSignerStatus();

  const signer = db
    .select()
    .from(signerConfig)
    .where(eq(signerConfig.id, "default"))
    .get();

  return NextResponse.json({
    signer,
    live: {
      reachable: liveStatus.reachable,
      ethAddress: liveStatus.ethAddress,
    },
  });
}

/**
 * PATCH /api/v1/signer -- Update signer config
 * Changing config requires a restart to take effect.
 */
export async function PATCH(request: NextRequest) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.network !== undefined) {
    const valid = ["arbitrum-one-mainnet", "mainnet"];
    if (!valid.includes(body.network)) {
      return NextResponse.json(
        { error: `Invalid network. Must be one of: ${valid.join(", ")}` },
        { status: 400 }
      );
    }
    updates.network = body.network;
  }
  if (body.ethRpcUrl !== undefined) updates.ethRpcUrl = body.ethRpcUrl;
  if (body.defaultCutPercent !== undefined)
    updates.defaultCutPercent = body.defaultCutPercent;
  if (body.billingMode !== undefined) updates.billingMode = body.billingMode;
  if (body.naapApiKey !== undefined) updates.naapApiKey = body.naapApiKey;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  db.update(signerConfig)
    .set(updates)
    .where(eq(signerConfig.id, "default"))
    .run();

  const updated = db
    .select()
    .from(signerConfig)
    .where(eq(signerConfig.id, "default"))
    .get();

  return NextResponse.json({
    signer: updated,
    message: "Config updated. Restart the signer for changes to take effect.",
  });
}

async function getAdminUser(request: NextRequest) {
  const oauthSession = await getServerSession(authOptions);
  if (oauthSession?.user) {
    const sessionUser = oauthSession.user as Record<string, unknown>;
    if (sessionUser.id) {
      return db
        .select()
        .from(users)
        .where(eq(users.id, sessionUser.id as string))
        .get();
    }
  }

  const auth = authenticateRequest(request);
  if (auth && hasScope(auth.scopes, "admin")) {
    if (auth.userId) {
      return db.select().from(users).where(eq(users.id, auth.userId)).get();
    }
  }

  return null;
}
