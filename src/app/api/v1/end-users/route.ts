import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { endUsers, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { authenticateRequest, hasScope } from "@/lib/auth";
import {
  verifyPrivyToken,
  findOrCreateEndUser,
  isPrivyEnabled,
} from "@/lib/privy";
import { addCredits, deductCredits } from "@/lib/billing";

/**
 * GET /api/v1/end-users -- List end users (admin auth) or get current end user (Privy auth)
 */
export async function GET(request: NextRequest) {
  // Check for admin access first
  const adminUser = await getAdminUser(request);
  if (adminUser) {
    const allEndUsers = db.select().from(endUsers).all();
    return NextResponse.json({ endUsers: allEndUsers });
  }

  // Check for Privy auth token
  const privyToken = request.headers.get("x-privy-token");
  if (privyToken && isPrivyEnabled()) {
    const privyDid = await verifyPrivyToken(privyToken);
    if (!privyDid) {
      return NextResponse.json(
        { error: "Invalid Privy token" },
        { status: 401 }
      );
    }

    const endUser = db
      .select()
      .from(endUsers)
      .where(eq(endUsers.privyDid, privyDid))
      .get();

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
 * POST /api/v1/end-users -- Register a new end user (Privy auth) or create one (admin auth)
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  // Admin creating an end user manually
  const adminUser = await getAdminUser(request);
  if (adminUser) {
    const id = uuidv4();
    db.insert(endUsers)
      .values({
        id,
        privyDid: body.privyDid || null,
        walletAddress: body.walletAddress || null,
        creditBalanceWei: body.creditBalanceWei || "0",
      })
      .run();

    const created = db
      .select()
      .from(endUsers)
      .where(eq(endUsers.id, id))
      .get();

    return NextResponse.json({ endUser: created }, { status: 201 });
  }

  // Privy-authenticated end user registering themselves
  const privyToken = request.headers.get("x-privy-token");
  if (privyToken && isPrivyEnabled()) {
    const privyDid = await verifyPrivyToken(privyToken);
    if (!privyDid) {
      return NextResponse.json(
        { error: "Invalid Privy token" },
        { status: 401 }
      );
    }

    const { id, isNew } = findOrCreateEndUser(
      privyDid,
      body.walletAddress
    );

    const endUser = db
      .select()
      .from(endUsers)
      .where(eq(endUsers.id, id))
      .get();

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

  const amount = BigInt(amountWei);

  if (action === "add_credits") {
    addCredits(endUserId, amount);
  } else if (action === "deduct_credits") {
    const success = deductCredits(endUserId, amount);
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

  const updated = db
    .select()
    .from(endUsers)
    .where(eq(endUsers.id, endUserId))
    .get();

  return NextResponse.json({ endUser: updated });
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
