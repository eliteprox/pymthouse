import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { signerConfig, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest, hasScope } from "@/lib/auth";
import { syncSignerStatus } from "@/lib/signer-proxy";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * POST /api/v1/signer/control -- Control plane for the signer container
 *
 * Body: { action: "start" | "stop" | "restart" | "sync" }
 */
export async function POST(request: NextRequest) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const action = body.action;

  const validActions = ["start", "stop", "restart", "sync"];
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    if (action === "sync") {
      const result = await syncSignerStatus();
      return NextResponse.json({
        action: "sync",
        success: true,
        reachable: result.reachable,
        ethAddress: result.ethAddress,
      });
    }

    // Docker Compose control actions
    const signerRows = await db
      .select()
      .from(signerConfig)
      .where(eq(signerConfig.id, "default"))
      .limit(1);
    const signer = signerRows[0];
    const composeCmd = getComposeCommand(action);
    const composeEnv = buildSignerComposeEnv(signer);
    const { stdout, stderr } = await execAsync(composeCmd, {
      cwd: process.cwd(),
      timeout: 30000,
      env: composeEnv,
    });

    // Update status based on action
    const now = new Date().toISOString();
    if (action === "stop") {
      await db
        .update(signerConfig)
        .set({ status: "stopped" })
        .where(eq(signerConfig.id, "default"));
    } else {
      await db
        .update(signerConfig)
        .set({ status: "running", lastStartedAt: now, lastError: null })
        .where(eq(signerConfig.id, "default"));

      // Wait a moment then sync to get the eth address
      setTimeout(async () => {
        await syncSignerStatus();
      }, 3000);
    }

    return NextResponse.json({
      action,
      success: true,
      output: stdout || stderr || "OK",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[signer-control] ${action} failed:`, message);

    await db
      .update(signerConfig)
      .set({ status: "error", lastError: message })
      .where(eq(signerConfig.id, "default"));

    return NextResponse.json(
      { action, success: false, error: message },
      { status: 500 }
    );
  }
}

function getComposeCommand(action: string): string {
  switch (action) {
    case "start":
    case "restart":
      // --force-recreate ensures fresh container; --remove-orphans cleans stale containers
      return "docker compose up -d --force-recreate --remove-orphans go-livepeer";
    case "stop":
      return "docker compose stop go-livepeer";
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

function buildSignerComposeEnv(
  signer:
    | {
        ethRpcUrl: string;
        ethAcctAddr: string | null;
        ethAddress: string | null;
        signerPort: number;
        remoteDiscovery: number;
        orchWebhookUrl: string | null;
        liveAICapReportInterval: string | null;
      }
    | undefined
): NodeJS.ProcessEnv {
  const rd = signer?.remoteDiscovery === 1;
  const port = signer?.signerPort ?? 8081;
  return {
    ...process.env,
    SIGNER_NETWORK: "arbitrum-one-mainnet",
    ETH_RPC_URL: signer?.ethRpcUrl ?? "",
    SIGNER_ETH_ADDR: signer?.ethAcctAddr || "",
    SIGNER_PORT: String(port),
    SIGNER_REMOTE_DISCOVERY: rd ? "1" : "0",
    ORCH_WEBHOOK_URL: rd && signer?.orchWebhookUrl ? signer.orchWebhookUrl : "",
    LIVE_AI_CAP_REPORT_INTERVAL:
      rd && signer?.liveAICapReportInterval
        ? signer.liveAICapReportInterval
        : "",
  };
}

async function getAdminUser(request: NextRequest) {
  const oauthSession = await getServerSession(authOptions);
  if (oauthSession?.user) {
    const sessionUser = oauthSession.user as Record<string, unknown>;
    if (sessionUser.id) {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.id, sessionUser.id as string))
        .limit(1);
      const user = rows[0];
      if (user?.role !== "admin") return null;
      return user;
    }
  }

  const auth = await authenticateRequest(request);
  if (auth && hasScope(auth.scopes, "admin") && auth.userId) {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);
    const user = rows[0];
    if (user?.role !== "admin") return null;
    return user;
  }

  return null;
}
