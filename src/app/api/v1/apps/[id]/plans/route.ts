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

function parseCapabilities(input: unknown): {
  capabilities: Array<{
    pipeline: string;
    modelId: string;
    slaTargetScore: number | null;
    slaTargetP95Ms: number | null;
    maxPricePerUnit: string | null;
  }>;
  error?: string;
} {
  if (input === undefined) {
    return { capabilities: [] };
  }

  if (!Array.isArray(input)) {
    return { capabilities: [], error: "capabilities must be an array" };
  }

  const capabilities = input.map((raw, index) => {
    const value = (raw ?? {}) as Record<string, unknown>;
    const pipeline = typeof value.pipeline === "string" ? value.pipeline.trim() : "";
    const modelId = typeof value.modelId === "string" ? value.modelId.trim() : "";

    if (!pipeline) {
      throw new Error(`capabilities[${index}].pipeline is required`);
    }

    if (!modelId) {
      throw new Error(`capabilities[${index}].modelId is required`);
    }

    const rawSlaTargetScore = value.slaTargetScore;
    const rawSlaTargetP95Ms = value.slaTargetP95Ms;
    const parsedSlaTargetScore =
      rawSlaTargetScore === null || rawSlaTargetScore === undefined
        ? null
        : Number(rawSlaTargetScore);
    const parsedSlaTargetP95Ms =
      rawSlaTargetP95Ms === null || rawSlaTargetP95Ms === undefined
        ? null
        : Number(rawSlaTargetP95Ms);

    if (parsedSlaTargetScore !== null && !Number.isFinite(parsedSlaTargetScore)) {
      throw new Error(`capabilities[${index}].slaTargetScore must be numeric`);
    }

    if (parsedSlaTargetP95Ms !== null && !Number.isFinite(parsedSlaTargetP95Ms)) {
      throw new Error(`capabilities[${index}].slaTargetP95Ms must be numeric`);
    }

    return {
      pipeline,
      modelId,
      slaTargetScore: parsedSlaTargetScore,
      slaTargetP95Ms: parsedSlaTargetP95Ms,
      maxPricePerUnit:
        value.maxPricePerUnit === null || value.maxPricePerUnit === undefined
          ? null
          : String(value.maxPricePerUnit),
    };
  });

  return { capabilities };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const auth = await getAuthorizedProviderApp(clientId);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const appId = auth.app.id;

  const rows = await db.select().from(plans).where(eq(plans.clientId, appId));
  const bundles = await db
    .select()
    .from(planCapabilityBundles)
    .where(eq(planCapabilityBundles.clientId, appId));

  return NextResponse.json({
    plans: rows.map((plan) => ({
      ...plan,
      clientId,
      capabilities: bundles
        .filter((bundle) => bundle.planId === plan.id)
        .map((bundle) => ({
          ...bundle,
          clientId,
        })),
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const auth = await getAuthorizedProviderApp(clientId);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await canEditProviderApp(auth))) {
    return appEditForbiddenResponse();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let parsedCapabilities: ReturnType<typeof parseCapabilities>;
  try {
    parsedCapabilities = parseCapabilities(body.capabilities);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid capabilities" },
      { status: 400 },
    );
  }

  if (parsedCapabilities.error) {
    return NextResponse.json({ error: parsedCapabilities.error }, { status: 400 });
  }

  const planId = uuidv4();
  const now = new Date().toISOString();
  const appId = auth.app.id;
  await db.transaction(async (tx) => {
    const includedUnits =
      body.includedUnits !== undefined && body.includedUnits !== null
        ? String(body.includedUnits).trim() || null
        : null;
    const overageRateWei =
      body.overageRateWei !== undefined && body.overageRateWei !== null
        ? String(body.overageRateWei).trim() || null
        : null;

    await tx.insert(plans).values({
      id: planId,
      clientId: appId,
      name,
      type: String(body.type || "free"),
      priceAmount: String(body.priceAmount || "0"),
      priceCurrency: String(body.priceCurrency || "USD"),
      status: String(body.status || "active"),
      includedUnits,
      overageRateWei,
      createdAt: now,
      updatedAt: now,
    });

    for (const capability of parsedCapabilities.capabilities) {
      await tx.insert(planCapabilityBundles).values({
        id: uuidv4(),
        planId,
        clientId: appId,
        pipeline: capability.pipeline,
        modelId: capability.modelId,
        slaTargetScore: capability.slaTargetScore ?? null,
        slaTargetP95Ms: capability.slaTargetP95Ms ?? null,
        maxPricePerUnit: capability.maxPricePerUnit,
        createdAt: now,
      });
    }
  });

  return NextResponse.json({ id: planId }, { status: 201 });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const auth = await getAuthorizedProviderApp(clientId);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await canEditProviderApp(auth))) {
    return appEditForbiddenResponse();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body.id !== "string" || !body.id.trim()) {
    return NextResponse.json({ error: "id is required and must be a string" }, { status: 400 });
  }
  const planId = String(body.id);
  const appId = auth.app.id;
  if (!planId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  let parsedCapabilities: ReturnType<typeof parseCapabilities> | null = null;
  if (body.capabilities !== undefined) {
    try {
      parsedCapabilities = parseCapabilities(body.capabilities);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid capabilities" },
        { status: 400 },
      );
    }

    if (parsedCapabilities.error) {
      return NextResponse.json({ error: parsedCapabilities.error }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const txnResult = await db.transaction(async (tx) => {
    const existingRows = await tx
      .select()
      .from(plans)
      .where(and(eq(plans.id, planId), eq(plans.clientId, appId)))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) {
      return false;
    }

    const updated = await tx
      .update(plans)
      .set({
        name: body.name !== undefined ? String(body.name) : existing.name,
        type: body.type !== undefined ? String(body.type) : existing.type,
        priceAmount: body.priceAmount !== undefined ? String(body.priceAmount) : existing.priceAmount,
        priceCurrency: body.priceCurrency !== undefined ? String(body.priceCurrency) : existing.priceCurrency,
        status: body.status !== undefined ? String(body.status) : existing.status,
        includedUnits:
          body.includedUnits !== undefined
            ? body.includedUnits === null || String(body.includedUnits).trim() === ""
              ? null
              : String(body.includedUnits).trim()
            : existing.includedUnits,
        overageRateWei:
          body.overageRateWei !== undefined
            ? body.overageRateWei === null || String(body.overageRateWei).trim() === ""
              ? null
              : String(body.overageRateWei).trim()
            : existing.overageRateWei,
        updatedAt: now,
      })
      .where(and(eq(plans.id, planId), eq(plans.clientId, appId)))
      .returning({ id: plans.id });

    if (updated.length === 0) {
      return false;
    }

    if (parsedCapabilities) {
      await tx
        .delete(planCapabilityBundles)
        .where(
          and(
            eq(planCapabilityBundles.planId, planId),
            eq(planCapabilityBundles.clientId, appId),
          ),
        );
      for (const capability of parsedCapabilities.capabilities) {
        await tx.insert(planCapabilityBundles).values({
          id: uuidv4(),
          planId,
          clientId: appId,
          pipeline: capability.pipeline,
          modelId: capability.modelId,
          slaTargetScore: capability.slaTargetScore ?? null,
          slaTargetP95Ms: capability.slaTargetP95Ms ?? null,
          maxPricePerUnit: capability.maxPricePerUnit,
          createdAt: now,
        });
      }
    }

    return true;
  });

  if (!txnResult) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const auth = await getAuthorizedProviderApp(clientId);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await canEditProviderApp(auth))) {
    return appEditForbiddenResponse();
  }

  const { searchParams } = new URL(request.url);
  const planId = searchParams.get("planId");
  const appId = auth.app.id;
  if (!planId) {
    return NextResponse.json({ error: "planId is required" }, { status: 400 });
  }

  const deleted = await db.transaction(async (tx) => {
    const planRows = await tx
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.id, planId), eq(plans.clientId, appId)))
      .limit(1);

    if (!planRows[0]) {
      return false;
    }

    await tx
      .delete(planCapabilityBundles)
      .where(
        and(
          eq(planCapabilityBundles.planId, planId),
          eq(planCapabilityBundles.clientId, appId),
        ),
      );
    const removed = await tx
      .delete(plans)
      .where(and(eq(plans.id, planId), eq(plans.clientId, appId)))
      .returning({ id: plans.id });
    return removed.length > 0;
  });

  if (!deleted) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
