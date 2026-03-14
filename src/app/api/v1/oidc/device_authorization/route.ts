import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { oidcDeviceCodes } from "@/db/schema";
import { v4 as uuidv4 } from "uuid";
import { randomBytes } from "crypto";
import { getClient } from "@/lib/oidc/clients";
import { getIssuer } from "@/lib/oidc/tokens";

const DEVICE_CODE_EXPIRY_S = 600; // 10 minutes
const POLLING_INTERVAL_S = 5;

function generateUserCode(): string {
  // Generate a user-friendly code like "ABCD-1234"
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O to avoid confusion
  const digits = "0123456789";
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[bytes[i] % chars.length];
  }
  code += "-";
  for (let i = 4; i < 8; i++) {
    code += digits[bytes[i] % digits.length];
  }
  return code;
}

function generateDeviceCode(): string {
  return randomBytes(32).toString("hex");
}

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
  const contentType = request.headers.get("content-type") || "";
  let body: Record<string, string> = {};

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    params.forEach((value, key) => {
      body[key] = value;
    });
  } else if (contentType.includes("application/json")) {
    body = await request.json();
  } else {
    return errorResponse("invalid_request", "Unsupported content type");
  }

  const clientId = body.client_id;
  const scope = body.scope || "openid";

  if (!clientId) {
    return errorResponse("invalid_request", "client_id is required");
  }

  const client = getClient(clientId);
  if (!client) {
    return errorResponse("invalid_client", "Unknown client_id");
  }

  // Verify the client supports device_code grant
  if (!client.grantTypes.includes("urn:ietf:params:oauth:grant-type:device_code")) {
    return errorResponse(
      "unauthorized_client",
      "Client is not authorized for device authorization flow"
    );
  }

  // Validate requested scopes
  const requestedScopes = scope.split(/\s+/).filter(Boolean);
  const validScopes = requestedScopes.filter((s) =>
    client.allowedScopes.includes(s)
  );

  if (!validScopes.includes("openid")) {
    validScopes.unshift("openid");
  }

  const issuer = getIssuer();
  const deviceCode = generateDeviceCode();
  const userCode = generateUserCode();
  const expiresAt = new Date(
    Date.now() + DEVICE_CODE_EXPIRY_S * 1000
  ).toISOString();
  const verificationUri = `${issuer}/oidc/device`;

  db.insert(oidcDeviceCodes)
    .values({
      id: uuidv4(),
      deviceCode,
      userCode,
      clientId: clientId,
      scopes: validScopes.join(" "),
      verificationUri,
      expiresAt,
      interval: POLLING_INTERVAL_S,
      status: "pending",
    })
    .run();

  return NextResponse.json(
    {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: `${verificationUri}?user_code=${userCode}`,
      expires_in: DEVICE_CODE_EXPIRY_S,
      interval: POLLING_INTERVAL_S,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
