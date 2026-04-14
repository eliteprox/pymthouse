/**
 * POST /api/v1/naap/link-user
 *
 * NaaP → PymtHouse server-to-server user linking (interim implementation).
 *
 * Any confidential client with a valid Bearer token may call this endpoint.
 * NaaP supplies a `naapUserId` (and optional `email`) and receives a long-lived
 * gateway session token (`pmth_*`) scoped to that user.
 *
 * PymtHouse upserts an end_users row keyed on (appId, naapUserId) so usage
 * records can be attributed per NaaP user.
 *
 * Planned migration path for this endpoint:
 *   1. POST /api/v1/apps/{appId}/users          — provision the NaaP user
 *   2. POST /api/v1/apps/{appId}/users/{id}/token — issue a user-scoped JWT
 *      with gateway + sign:job + discover:orchestrators scopes
 *
 * This requires NaaP's OIDC client to be associated with a developer_apps row
 * (currently blocked by the required ownerId FK). Once that is resolved, NaaP
 * should call the builder API directly using Basic auth (client_id:client_secret)
 * and store the refresh_token as the API key, which gives proper structured JWTs
 * with sub=appUserId for per-user attribution.
 *
 * See: docs/builder-api.md, src/app/api/v1/apps/[id]/users/
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequestAsync, createSession } from "@/lib/auth";
import { db } from "@/db/index";
import { endUsers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const SESSION_EXPIRES_DAYS = 90;

export async function POST(request: NextRequest) {
  const auth = await authenticateRequestAsync(request);

  if (!auth) {
    return NextResponse.json(
      { error: "unauthorized", error_description: "Bearer token required" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "JSON body required" },
      { status: 400 },
    );
  }

  const naapUserId =
    typeof body.naapUserId === "string" ? body.naapUserId.trim() : null;
  if (!naapUserId) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "naapUserId (string) is required",
      },
      { status: 400 },
    );
  }

  const email =
    typeof body.email === "string" && body.email.trim()
      ? body.email.trim()
      : null;

  // appId is the NaaP developer app's OIDC client id from the Bearer JWT
  const appId = auth.appId ?? null;

  // Upsert the end_users row keyed on (appId, naapUserId) so usage records
  // can be attributed per NaaP user inside PymtHouse.
  let endUserId: string;

  if (appId) {
    const existing = await db
      .select({ id: endUsers.id })
      .from(endUsers)
      .where(
        and(
          eq(endUsers.appId, appId),
          eq(endUsers.externalUserId, naapUserId),
        ),
      )
      .limit(1);

    if (existing[0]) {
      endUserId = existing[0].id;
      if (email) {
        await db
          .update(endUsers)
          .set({ email })
          .where(eq(endUsers.id, endUserId));
      }
    } else {
      endUserId = uuidv4();
      await db.insert(endUsers).values({
        id: endUserId,
        appId,
        externalUserId: naapUserId,
        email,
      });
    }
  } else {
    // No appId on the token — still create a session but without user attribution
    endUserId = uuidv4();
    await db.insert(endUsers).values({
      id: endUserId,
      appId: null,
      externalUserId: naapUserId,
      email,
    });
  }

  const { token } = await createSession({
    endUserId,
    scopes: "gateway sign:job discover:orchestrators",
    label: "naap_user_linked",
    expiresInDays: SESSION_EXPIRES_DAYS,
  });

  return NextResponse.json({
    api_key: token,
    token_type: "Bearer",
    expires_in_days: SESSION_EXPIRES_DAYS,
    expires_in: SESSION_EXPIRES_DAYS * 24 * 60 * 60,
  });
}
