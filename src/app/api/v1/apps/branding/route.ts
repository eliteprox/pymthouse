import { NextRequest, NextResponse } from "next/server";
import { resolveAppBrandingByClientId, getDefaultBranding } from "@/lib/oidc/branding";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const clientId = request.nextUrl.searchParams.get("client_id");

  if (!clientId) {
    return NextResponse.json(
      { branding: getDefaultBranding() },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  }

  const branding = await resolveAppBrandingByClientId(clientId);

  return NextResponse.json(
    { 
      branding: {
        mode: branding.mode,
        displayName: branding.displayName,
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
        privacyPolicyUrl: branding.privacyPolicyUrl,
        tosUrl: branding.tosUrl,
        supportUrl: branding.supportUrl,
      }
    },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
