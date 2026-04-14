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
  await db.transaction(async (tx) => {
    await tx.insert(plans).values({
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

    for (const capability of parsedCapabilities.capabilities) {
      await tx.insert(planCapabilityBundles).values({
        id: uuidv4(),
        planId,
        clientId: id,
        pipeline: capability.pipeline,
        modelId: capability.modelId,
        slaTargetScore: capability.slaTargetScore ?? null,
        slaTargetP95Ms: capability.slaTargetP95Ms ?? null,
        maxPricePerUnit: capability.maxPricePerUnit,
        createdAt: now,
      });
    }
  });

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
  await db.transaction(async (tx) => {
    await tx
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

    if (parsedCapabilities) {
      await tx
        .delete(planCapabilityBundles)
        .where(
          and(
            eq(planCapabilityBundles.planId, planId),
            eq(planCapabilityBundles.clientId, id),
          ),
        );
      for (const capability of parsedCapabilities.capabilities) {
        await tx.insert(planCapabilityBundles).values({
          id: uuidv4(),
          planId,
          clientId: id,
          pipeline: capability.pipeline,
          modelId: capability.modelId,
          slaTargetScore: capability.slaTargetScore ?? null,
          slaTargetP95Ms: capability.slaTargetP95Ms ?? null,
          maxPricePerUnit: capability.maxPricePerUnit,
          createdAt: now,
        });
      }
    }
  });

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

  const planRows = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.clientId, id)))
    .limit(1);

  if (!planRows[0]) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(planCapabilityBundles)
      .where(
        and(
          eq(planCapabilityBundles.planId, planId),
          eq(planCapabilityBundles.clientId, id),
        ),
      );
    await tx.delete(plans).where(and(eq(plans.id, planId), eq(plans.clientId, id)));
  });

  return NextResponse.json({ success: true });
}
