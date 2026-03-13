import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { signerConfig, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest, hasScope } from "@/lib/auth";
import { syncSignerStatus } from "@/lib/signer-proxy";

const SUPPORTED_NETWORK = "arbitrum-one-mainnet";

// Duration format: number + unit (s, m, h) e.g. 5m, 10s, 1h
const DURATION_REGEX = /^\d+[smh]$/;

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return s.startsWith("http://") || s.startsWith("https://");
  } catch {
    return false;
  }
}

function isValidDuration(s: string): boolean {
  return DURATION_REGEX.test(s);
}

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
  const current = db
    .select()
    .from(signerConfig)
    .where(eq(signerConfig.id, "default"))
    .get();

  if (body.name !== undefined) updates.name = body.name;
  if (body.network !== undefined) {
    if (body.network !== SUPPORTED_NETWORK) {
      return NextResponse.json(
        { error: `Invalid network. Must be: ${SUPPORTED_NETWORK}` },
        { status: 400 }
      );
    }
    updates.network = SUPPORTED_NETWORK;
  }
  if (body.ethRpcUrl !== undefined) updates.ethRpcUrl = body.ethRpcUrl;
  if (body.ethAcctAddr !== undefined) updates.ethAcctAddr = body.ethAcctAddr;
  if (body.defaultCutPercent !== undefined)
    updates.defaultCutPercent = body.defaultCutPercent;
  if (body.billingMode !== undefined) updates.billingMode = body.billingMode;
  if (body.naapApiKey !== undefined) updates.naapApiKey = body.naapApiKey;

  // Remote discovery: when enabled, orchWebhookUrl and liveAICapReportInterval are used
  if (body.remoteDiscovery !== undefined) {
    const rd = body.remoteDiscovery === true || body.remoteDiscovery === "true";
    updates.remoteDiscovery = rd ? 1 : 0;
    if (!rd) {
      updates.orchWebhookUrl = null;
      updates.liveAICapReportInterval = null;
    }
  }
  const effectiveRemoteDiscovery =
    updates.remoteDiscovery !== undefined
      ? updates.remoteDiscovery === 1
      : current?.remoteDiscovery === 1;

  if (body.orchWebhookUrl !== undefined) {
    if (effectiveRemoteDiscovery) {
      const url = body.orchWebhookUrl?.trim() || null;
      if (url && !isValidUrl(url)) {
        return NextResponse.json(
          { error: "orchWebhookUrl must be a valid http(s) URL" },
          { status: 400 }
        );
      }
      updates.orchWebhookUrl = url;
    }
  }
  if (body.liveAICapReportInterval !== undefined) {
    if (effectiveRemoteDiscovery) {
      const val = body.liveAICapReportInterval?.trim() || null;
      if (val && !/^\d+(ns|us|µs|ms|s|m|h)$/.test(val)) {
        return NextResponse.json(
          {
            error:
              "liveAICapReportInterval must be a valid duration (e.g. 5m, 10s, 1h)",
          },
          { status: 400 }
        );
      }
      updates.liveAICapReportInterval = val;
    }
  }

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
      const user = db
        .select()
        .from(users)
        .where(eq(users.id, sessionUser.id as string))
        .get();
      if (user?.role !== "admin") return null;
      return user;
    }
  }

  const auth = authenticateRequest(request);
  if (auth && hasScope(auth.scopes, "admin") && auth.userId) {
    const user = db.select().from(users).where(eq(users.id, auth.userId)).get();
    if (user?.role !== "admin") return null;
    return user;
  }

  return null;
}
