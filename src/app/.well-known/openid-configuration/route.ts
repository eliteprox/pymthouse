import { NextResponse } from "next/server";
import { getIssuer } from "@/lib/oidc/tokens";

export async function GET(): Promise<NextResponse> {
  const issuer = getIssuer();

  const discovery = {
    issuer,
    authorization_endpoint: `${issuer}/api/v1/oidc/authorize`,
    token_endpoint: `${issuer}/api/v1/oidc/token`,
    userinfo_endpoint: `${issuer}/api/v1/oidc/userinfo`,
    jwks_uri: `${issuer}/api/v1/oidc/jwks`,
    registration_endpoint: undefined, // Dynamic registration not supported
    scopes_supported: ["openid", "profile", "email", "plan", "entitlements", "gateway"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    claims_supported: [
      "iss",
      "sub",
      "aud",
      "exp",
      "iat",
      "auth_time",
      "nonce",
      "email",
      "name",
      "role",
      "plan",
      "entitlements",
    ],
    code_challenge_methods_supported: ["S256", "plain"],
    service_documentation: `${issuer}/docs/oidc`,
  };

  return NextResponse.json(discovery, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/json",
    },
  });
}
