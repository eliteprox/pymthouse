import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps, appAllowedDomains } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { normalizeDomainWhitelist } from "@/lib/domain-whitelist";

async function getOwnerApp(appId: string) {
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

  if (!app || (app.ownerId !== userId && role !== "admin")) return null;
  return app;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const app = await getOwnerApp(id);
  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const domains = db
    .select()
    .from(appAllowedDomains)
    .where(eq(appAllowedDomains.appId, id))
    .all();

  return NextResponse.json({ domains });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const app = await getOwnerApp(id);
  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { domain } = body;

  if (!domain || typeof domain !== "string") {
    return NextResponse.json(
      { error: "domain is required" },
      { status: 400 }
    );
  }

  // Normalize and validate the domain
  const result = normalizeDomainWhitelist(domain);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  const normalizedDomain = result.normalized;

  // Check for duplicates
  const existingDomains = db
    .select()
    .from(appAllowedDomains)
    .where(eq(appAllowedDomains.appId, id))
    .all();

  const isDuplicate = existingDomains.some(
    (d) => d.domain.toLowerCase() === normalizedDomain.toLowerCase()
  );

  if (isDuplicate) {
    return NextResponse.json(
      { error: `Domain "${normalizedDomain}" is already in the whitelist` },
      { status: 409 }
    );
  }

  const domainId = uuidv4();
  db.insert(appAllowedDomains)
    .values({
      id: domainId,
      appId: id,
      domain: normalizedDomain,
    })
    .run();

  return NextResponse.json({ id: domainId, domain: normalizedDomain }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const app = await getOwnerApp(id);
  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const domainId = searchParams.get("domainId");

  if (!domainId) {
    return NextResponse.json(
      { error: "domainId query parameter is required" },
      { status: 400 }
    );
  }

  db.delete(appAllowedDomains)
    .where(
      and(
        eq(appAllowedDomains.id, domainId),
        eq(appAllowedDomains.appId, id)
      )
    )
    .run();

  return NextResponse.json({ success: true });
}
