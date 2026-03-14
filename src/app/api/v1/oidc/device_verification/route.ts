import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { oidcDeviceCodes } from "@/db/schema";
import { getClient } from "@/lib/oidc/clients";
import { eq, and, gt } from "drizzle-orm";

function errorResponse(
  error: string,
  description: string,
  status: number = 400
): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return errorResponse("unauthorized", "You must be signed in", 401);
  }
  const userId = (session.user as Record<string, unknown>).id as string;
  if (!userId) {
    return errorResponse("unauthorized", "You must be signed in", 401);
  }

  const body = await request.json();
  const userCode = body.user_code;
  const action = body.action; // "lookup" | "approve" | "deny"

  if (!userCode || !action) {
    return errorResponse("invalid_request", "user_code and action are required");
  }

  if (!["lookup", "approve", "deny"].includes(action)) {
    return errorResponse("invalid_request", "action must be lookup, approve, or deny");
  }

  const now = new Date().toISOString();

  // Find the pending device code
  const deviceCode = db
    .select()
    .from(oidcDeviceCodes)
    .where(
      and(
        eq(oidcDeviceCodes.userCode, userCode.toUpperCase()),
        eq(oidcDeviceCodes.status, "pending"),
        gt(oidcDeviceCodes.expiresAt, now)
      )
    )
    .get();

  if (!deviceCode) {
    return errorResponse("invalid_grant", "Invalid, expired, or already used device code");
  }

  const client = getClient(deviceCode.clientId);
  if (!client) {
    return errorResponse("server_error", "Client not found", 500);
  }

  if (action === "lookup") {
    return NextResponse.json({
      client_name: client.displayName,
      scopes: deviceCode.scopes.split(" "),
    });
  }

  if (action === "approve") {
    db.update(oidcDeviceCodes)
      .set({
        status: "authorized",
        userId: userId,
      })
      .where(eq(oidcDeviceCodes.id, deviceCode.id))
      .run();

    return NextResponse.json({ status: "authorized" });
  }

  // action === "deny"
  db.update(oidcDeviceCodes)
    .set({ status: "denied" })
    .where(eq(oidcDeviceCodes.id, deviceCode.id))
    .run();

  return NextResponse.json({ status: "denied" });
}
