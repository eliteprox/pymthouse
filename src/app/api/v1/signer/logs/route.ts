import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest, hasScope } from "@/lib/auth";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * GET /api/v1/signer/logs -- Fetch recent container logs
 */
export async function GET(request: NextRequest) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const tail = url.searchParams.get("tail") || "50";

  try {
    const { stdout, stderr } = await execAsync(
      `docker compose logs --no-color --tail=${tail} go-livepeer 2>&1`,
      { cwd: process.cwd(), timeout: 10000 }
    );

    const raw = stdout || stderr || "";
    // Strip the container name prefix from each line for cleaner output
    const lines = raw
      .split("\n")
      .map((line) => line.replace(/^go-livepeer-\d+\s+\|\s*/, ""))
      .filter((line) => line.trim());

    return NextResponse.json({ lines, count: lines.length });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch logs";
    return NextResponse.json({ lines: [message], count: 1, error: true });
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
  if (auth && hasScope(auth.scopes, "admin") && auth.userId) {
    return db.select().from(users).where(eq(users.id, auth.userId)).get();
  }

  return null;
}
