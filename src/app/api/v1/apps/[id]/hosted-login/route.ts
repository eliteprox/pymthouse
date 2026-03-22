import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps, oidcClients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getIssuer, getPublicOrigin } from "@/lib/oidc/tokens";

async function getAuthenticatedOwner(appId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const userId = (session.user as Record<string, unknown>).id as string;
  const role = (session.user as Record<string, unknown>).role as string;
  if (!userId) return null;

  const app = db
    .select()
    .from(developerApps)
    .where(eq(developerApps.id, appId))
    .get();

  if (!app) return null;
  if (app.ownerId !== userId && role !== "admin") return null;

  return { app, userId, role };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const auth = await getAuthenticatedOwner(id);

  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { app } = auth;

  if (!app.oidcClientId) {
    return NextResponse.json({ error: "App has no OIDC client" }, { status: 400 });
  }

  const client = db
    .select()
    .from(oidcClients)
    .where(eq(oidcClients.id, app.oidcClientId))
    .get();

  if (!client) {
    return NextResponse.json({ error: "OIDC client not found" }, { status: 404 });
  }

  const issuer = getIssuer();
  const publicOrigin = getPublicOrigin();

  const hasCustomDomain = app.customLoginEnabled && app.customDomainVerifiedAt && app.customLoginDomain;
  const customLoginUrl = hasCustomDomain ? `https://${app.customLoginDomain}` : null;

  const hostedLoginInfo = {
    issuer,
    discoveryUrl: `${issuer}/.well-known/openid-configuration`,
    jwksUrl: `${issuer}/jwks`,

    defaultLoginUrl: `${publicOrigin}/login`,
    defaultConsentUrl: `${publicOrigin}/oidc/consent`,
    defaultDeviceUrl: `${publicOrigin}/oidc/device`,

    customDomain: {
      enabled: !!hasCustomDomain,
      domain: app.customLoginDomain || null,
      verified: !!app.customDomainVerifiedAt,
      loginUrl: customLoginUrl ? `${customLoginUrl}/login` : null,
      consentUrl: customLoginUrl ? `${customLoginUrl}/oidc/consent` : null,
      deviceUrl: customLoginUrl ? `${customLoginUrl}/oidc/device` : null,
    },

    brandingMode: app.brandingMode || "blackLabel",
    isWhiteLabel: app.brandingMode === "whiteLabel",

    clientId: client.clientId,
    hasClientSecret: !!client.clientSecretHash,

    sampleAuthUrl: buildSampleAuthUrl(issuer, client.clientId, JSON.parse(client.redirectUris) as string[]),

    notes: {
      issuerIsCanonical: "The OIDC issuer is always the canonical pymthouse issuer, even when using custom domains.",
      tokensAreIssuerBound: "All tokens are issued by and validated against the canonical issuer.",
      customDomainIsPresentationOnly: "Custom domains only affect the hosted login/consent UI, not token issuance.",
    },
  };

  return NextResponse.json(hostedLoginInfo);
}

function buildSampleAuthUrl(
  issuer: string,
  clientId: string,
  redirectUris: string[]
): string | null {
  if (redirectUris.length === 0) {
    return null;
  }

  const redirectUri = redirectUris[0].includes("*")
    ? redirectUris[0].replace(/\*/g, "localhost:3000")
    : redirectUris[0];

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state: "sample_state_value",
  });

  return `${issuer}/auth?${params.toString()}`;
}
