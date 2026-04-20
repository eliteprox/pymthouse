import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { endUsers, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { authenticateRequest, hasScope } from "@/lib/auth";
import {
  findOrCreateEndUser,
  verifyTurnkeySessionJwt,
} from "@/lib/turnkey";
import { addCredits, deductCredits } from "@/lib/billing";

/**
 * GET /api/v1/end-users -- List end users (admin auth) or get current end user (Turnkey session JWT)
 */
export async function GET(request: NextRequest) {
  // Check for admin access first
  const adminUser = await getAdminUser(request);
  if (adminUser) {
    const allEndUsers = await db.select().from(endUsers);
    return NextResponse.json({ endUsers: allEndUsers });
  }

  const turnkeyJwt = getTurnkeySessionJwtFromRequest(request);
  if (turnkeyJwt) {
    const claims = await verifyTurnkeySessionJwt(turnkeyJwt);
    if (!claims) {
      return NextResponse.json(
        { error: "Invalid Turnkey session" },
        { status: 401 }
      );
    }

    const endUserRows = await db
      .select()
      .from(endUsers)
      .where(eq(endUsers.turnkeyUserId, claims.userId))
      .limit(1);
    const endUser = endUserRows[0];

    if (!endUser) {
      return NextResponse.json(
        { error: "End user not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ endUser });
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * POST /api/v1/end-users -- Register a new end user (Turnkey session JWT) or create one (admin auth)
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  // Admin creating an end user manually
  const adminUser = await getAdminUser(request);
  if (adminUser) {
    const id = uuidv4();
    await db.insert(endUsers).values({
      id,
      turnkeyUserId: body.turnkeyUserId || null,
      walletAddress: body.walletAddress || null,
      creditBalanceWei: body.creditBalanceWei || "0",
    });

    const createdRows = await db
      .select()
      .from(endUsers)
      .where(eq(endUsers.id, id))
      .limit(1);
    const created = createdRows[0];

    return NextResponse.json({ endUser: created }, { status: 201 });
  }

  const turnkeyJwtPost = getTurnkeySessionJwtFromRequest(request);
  if (turnkeyJwtPost) {
    const claims = await verifyTurnkeySessionJwt(turnkeyJwtPost);
    if (!claims) {
      return NextResponse.json(
        { error: "Invalid Turnkey session" },
        { status: 401 }
      );
    }

    const { id, isNew } = await findOrCreateEndUser(
      claims.userId,
      body.walletAddress,
    );

    const endUserRowsPost = await db
      .select()
      .from(endUsers)
      .where(eq(endUsers.id, id))
      .limit(1);
    const endUser = endUserRowsPost[0];

    return NextResponse.json(
      { endUser, isNew },
      { status: isNew ? 201 : 200 }
    );
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * PATCH /api/v1/end-users -- Update end user credits (admin auth)
 */
export async function PATCH(request: NextRequest) {
  const adminUser = await getAdminUser(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const endUserId = body.id;
  const action = body.action; // "add_credits" | "deduct_credits"
  const amountWei = body.amountWei;

  if (!endUserId || !action || !amountWei) {
    return NextResponse.json(
      { error: "id, action, and amountWei are required" },
      { status: 400 }
    );
  }

  if (!/^\d+$/.test(String(amountWei))) {
    return NextResponse.json(
      { error: "amountWei must be a non-negative integer string" },
      { status: 400 }
    );
  }

  const amount = BigInt(amountWei);

  if (action === "add_credits") {
    await addCredits(endUserId, amount);
  } else if (action === "deduct_credits") {
    const success = await deductCredits(endUserId, amount);
    if (!success) {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400 }
      );
    }
  } else {
    return NextResponse.json(
      { error: "action must be 'add_credits' or 'deduct_credits'" },
      { status: 400 }
    );
  }

  const updatedRows = await db
    .select()
    .from(endUsers)
    .where(eq(endUsers.id, endUserId))
    .limit(1);
  const updated = updatedRows[0];

  return NextResponse.json({ endUser: updated });
}

async function getAdminUser(request: NextRequest) {
  const oauthSession = await getServerSession(authOptions);
  if (oauthSession?.user) {
    const sessionUser = oauthSession.user as Record<string, unknown>;
    if (sessionUser.id && typeof sessionUser.id === "string" && sessionUser.role === "admin") {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.id, sessionUser.id))
        .limit(1);
      return rows[0];
    }
  }

  const auth = await authenticateRequest(request);
  if (auth && hasScope(auth.scopes, "admin") && auth.userId) {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);
    return rows[0];
  }

  return null;
}

/** Turnkey session JWT from `x-turnkey-session` or `Authorization: Bearer`. */
function getTurnkeySessionJwtFromRequest(request: NextRequest): string | null {
  const header = request.headers.get("x-turnkey-session")?.trim();
  if (header) return header;

  const auth = request.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || null;
  }

  return null;
}
