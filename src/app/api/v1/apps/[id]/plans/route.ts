import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db/index";
import { planCapabilityBundles, plans } from "@/db/schema";
import {
  canEditProviderApp,
  getAuthorizedProviderApp,
  appEditForbiddenResponse,
} from "@/lib/provider-apps";
import { publishProviderAndPlans } from "@/lib/naap-marketplace";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getAuthorizedProviderApp(id);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await db.select().from(plans).where(eq(plans.clientId, id));
  const bundles = await db
    .select()
    .from(planCapabilityBundles)
    .where(eq(planCapabilityBundles.clientId, id));

  return NextResponse.json({
    plans: rows.map((plan) => ({
      ...plan,
      capabilities: bundles.filter((bundle) => bundle.planId === plan.id),
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getAuthorizedProviderApp(id);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await canEditProviderApp(auth))) {
    return appEditForbiddenResponse();
  }

  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const planId = uuidv4();
  const now = new Date().toISOString();
  await db.insert(plans).values({
    id: planId,
    clientId: id,
    name,
    type: body.type || "free",
    priceAmount: String(body.priceAmount || "0"),
    priceCurrency: body.priceCurrency || "USD",
    status: body.status || "active",
    createdAt: now,
    updatedAt: now,
  });

  const capabilities = Array.isArray(body.capabilities) ? body.capabilities : [];
  for (const capability of capabilities) {
    await db.insert(planCapabilityBundles).values({
      id: uuidv4(),
      planId,
      clientId: id,
      pipeline: String(capability.pipeline || "video"),
      modelId: String(capability.modelId || ""),
      slaTargetScore: capability.slaTargetScore ?? null,
      slaTargetP95Ms: capability.slaTargetP95Ms ?? null,
      maxPricePerUnit: capability.maxPricePerUnit ? String(capability.maxPricePerUnit) : null,
      createdAt: now,
    });
  }

  void publishProviderAndPlans(id).catch(() => {});

  return NextResponse.json({ id: planId }, { status: 201 });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getAuthorizedProviderApp(id);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await canEditProviderApp(auth))) {
    return appEditForbiddenResponse();
  }

  const body = await request.json();
  const planId = String(body.id || "");
  if (!planId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const existingRows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.clientId, id)))
    .limit(1);
  const existing = existingRows[0];

  if (!existing) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  await db
    .update(plans)
    .set({
      name: body.name ?? existing.name,
      type: body.type ?? existing.type,
      priceAmount: body.priceAmount !== undefined ? String(body.priceAmount) : existing.priceAmount,
      priceCurrency: body.priceCurrency ?? existing.priceCurrency,
      status: body.status ?? existing.status,
      updatedAt: now,
    })
    .where(eq(plans.id, planId));

  if (Array.isArray(body.capabilities)) {
    await db.delete(planCapabilityBundles).where(eq(planCapabilityBundles.planId, planId));
    for (const capability of body.capabilities) {
      await db.insert(planCapabilityBundles).values({
        id: uuidv4(),
        planId,
        clientId: id,
        pipeline: String(capability.pipeline || "video"),
        modelId: String(capability.modelId || ""),
        slaTargetScore: capability.slaTargetScore ?? null,
        slaTargetP95Ms: capability.slaTargetP95Ms ?? null,
        maxPricePerUnit: capability.maxPricePerUnit ? String(capability.maxPricePerUnit) : null,
        createdAt: now,
      });
    }
  }

  void publishProviderAndPlans(id).catch(() => {});

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getAuthorizedProviderApp(id);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await canEditProviderApp(auth))) {
    return appEditForbiddenResponse();
  }

  const { searchParams } = new URL(request.url);
  const planId = searchParams.get("planId");
  if (!planId) {
    return NextResponse.json({ error: "planId is required" }, { status: 400 });
  }

  await db.delete(planCapabilityBundles).where(eq(planCapabilityBundles.planId, planId));
  await db.delete(plans).where(and(eq(plans.id, planId), eq(plans.clientId, id)));

  return NextResponse.json({ success: true });
}
