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
    const composeCmd = getComposeCommand(action);
    const { stdout, stderr } = await execAsync(composeCmd, {
      cwd: process.cwd(),
      timeout: 30000,
    });

    // Update status based on action
    const now = new Date().toISOString();
    if (action === "stop") {
      db.update(signerConfig)
        .set({ status: "stopped" })
        .where(eq(signerConfig.id, "default"))
        .run();
    } else {
      db.update(signerConfig)
        .set({ status: "running", lastStartedAt: now, lastError: null })
        .where(eq(signerConfig.id, "default"))
        .run();

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

    db.update(signerConfig)
      .set({ status: "error", lastError: message })
      .where(eq(signerConfig.id, "default"))
      .run();

    return NextResponse.json(
      { action, success: false, error: message },
      { status: 500 }
    );
  }
}

function getComposeCommand(action: string): string {
  switch (action) {
    case "start":
      return "docker compose up -d go-livepeer";
    case "stop":
      return "docker compose stop go-livepeer";
    case "restart":
      return "docker compose restart go-livepeer";
    default:
      throw new Error(`Unknown action: ${action}`);
  }
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
