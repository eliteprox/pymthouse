import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  setupCustomLoginDomain,
  verifyDomainOwnership,
  enableCustomLoginDomain,
  disableCustomLoginDomain,
  removeCustomLoginDomain,
  getCustomDomainStatus,
  getDnsVerificationRecord,
} from "@/lib/oidc/custom-domains";

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

  const status = getCustomDomainStatus(id);
  
  if (!status) {
    return NextResponse.json({ 
      configured: false,
      domain: null,
      verified: false,
      enabled: false,
    });
  }

  return NextResponse.json({
    configured: true,
    domain: status.domain,
    verified: status.verified,
    verifiedAt: status.verifiedAt,
    enabled: auth.app.customLoginEnabled === 1,
    verificationRequired: !status.verified,
    dnsHost: status.verificationToken ? `_pymthouse.${status.domain}` : null,
    dnsValue: status.verificationToken || null,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const auth = await getAuthenticatedOwner(id);
  
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { action, domain } = body;

  if (action === "setup") {
    if (!domain || typeof domain !== "string") {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 });
    }

    const result = setupCustomLoginDomain(id, domain);
    
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      domain: domain.toLowerCase(),
      dnsHost: result.dnsHost,
      dnsValue: result.token,
      dnsRecord: result.dnsRecord,
      instructions: `Add a TXT record for ${result.dnsHost} with value: ${result.token}`,
    });
  }

  if (action === "verify") {
    const status = getCustomDomainStatus(id);
    
    if (!status) {
      return NextResponse.json({ error: "No custom domain configured" }, { status: 400 });
    }

    const result = await verifyDomainOwnership(id, status.domain);
    
    if (!result.verified) {
      return NextResponse.json({ 
        verified: false, 
        error: result.error 
      }, { status: 400 });
    }

    return NextResponse.json({ 
      verified: true,
      domain: status.domain,
    });
  }

  if (action === "enable") {
    const success = enableCustomLoginDomain(id);
    
    if (!success) {
      return NextResponse.json({ 
        error: "Domain must be verified before enabling" 
      }, { status: 400 });
    }

    return NextResponse.json({ enabled: true });
  }

  if (action === "disable") {
    disableCustomLoginDomain(id);
    return NextResponse.json({ enabled: false });
  }

  if (action === "remove") {
    removeCustomLoginDomain(id);
    return NextResponse.json({ removed: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
