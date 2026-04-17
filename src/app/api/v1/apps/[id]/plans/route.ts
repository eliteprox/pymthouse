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

function isNonNegativeIntegerString(s: string): boolean {
  return /^\d+$/.test(s);
}

/** Present empty → null; present non-empty must match non-negative integer digits. */
function parseOptionalNonNegativeIntString(
  raw: unknown,
  fieldName: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  const s = String(raw).trim();
  if (s === "") {
    return { ok: true, value: null };
  }
  if (!isNonNegativeIntegerString(s)) {
    return {
      ok: false,
      error: `${fieldName} must be a non-negative integer string`,
    };
  }
  return { ok: true, value: s };
}

function resolveBillingFieldsForPost(
  planType: string,
  body: Record<string, unknown>,
):
  | { ok: true; includedUnits: string | null; overageRateWei: string | null }
  | { ok: false; error: string } {
  if (planType === "free") {
    return { ok: true, includedUnits: null, overageRateWei: null };
  }
  if (planType === "subscription") {
    const inc = parseOptionalNonNegativeIntString(body.includedUnits, "includedUnits");
    const ovr = parseOptionalNonNegativeIntString(body.overageRateWei, "overageRateWei");
    if (!inc.ok) return inc;
    if (!ovr.ok) return ovr;
    if (inc.value === null || ovr.value === null) {
      return {
        ok: false,
        error: "includedUnits and overageRateWei are required for subscription plans",
      };
    }
    return { ok: true, includedUnits: inc.value, overageRateWei: ovr.value };
  }
  if (planType === "usage") {
    const inc = parseOptionalNonNegativeIntString(body.includedUnits, "includedUnits");
    const ovr = parseOptionalNonNegativeIntString(body.overageRateWei, "overageRateWei");
    if (!inc.ok) return inc;
    if (!ovr.ok) return ovr;
    return { ok: true, includedUnits: inc.value, overageRateWei: ovr.value };
  }
  return { ok: true, includedUnits: null, overageRateWei: null };
}

function mergeBillingFieldForPut(
  rawBody: unknown,
  existing: string | null,
  fieldName: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (rawBody === undefined) {
    if (existing === null || existing === undefined) {
      return { ok: true, value: null };
    }
    const t = String(existing).trim();
    if (t === "") {
      return { ok: true, value: null };
    }
    if (!isNonNegativeIntegerString(t)) {
      return {
        ok: false,
        error: `${fieldName} must be a non-negative integer string`,
      };
    }
    return { ok: true, value: t };
  }
  return parseOptionalNonNegativeIntString(rawBody, fieldName);
}

function resolveBillingFieldsForPut(
  effectiveType: string,
  body: Record<string, unknown>,
  existing: { includedUnits: string | null; overageRateWei: string | null },
):
  | { ok: true; includedUnits: string | null; overageRateWei: string | null }
  | { ok: false; error: string } {
  if (effectiveType === "free") {
    return { ok: true, includedUnits: null, overageRateWei: null };
  }
  if (effectiveType === "subscription") {
    const inc = mergeBillingFieldForPut(body.includedUnits, existing.includedUnits, "includedUnits");
    const ovr = mergeBillingFieldForPut(body.overageRateWei, existing.overageRateWei, "overageRateWei");
    if (!inc.ok) return inc;
    if (!ovr.ok) return ovr;
    if (inc.value === null || ovr.value === null) {
      return {
        ok: false,
        error: "includedUnits and overageRateWei are required for subscription plans",
      };
    }
    return { ok: true, includedUnits: inc.value, overageRateWei: ovr.value };
  }
  if (effectiveType === "usage") {
    const inc = mergeBillingFieldForPut(body.includedUnits, existing.includedUnits, "includedUnits");
    const ovr = mergeBillingFieldForPut(body.overageRateWei, existing.overageRateWei, "overageRateWei");
    if (!inc.ok) return inc;
    if (!ovr.ok) return ovr;
    return { ok: true, includedUnits: inc.value, overageRateWei: ovr.value };
  }
  return { ok: true, includedUnits: null, overageRateWei: null };
}

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
      includedUnits:
        plan.includedUnits !== null && plan.includedUnits !== undefined
          ? plan.includedUnits.toString()
          : null,
      overageRateWei:
        plan.overageRateWei !== null && plan.overageRateWei !== undefined
          ? plan.overageRateWei.toString()
          : null,
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

  const planType = String(body.type || "free");
  const billing = resolveBillingFieldsForPost(planType, body);
  if (!billing.ok) {
    return NextResponse.json({ error: billing.error }, { status: 400 });
  }

  const planId = uuidv4();
  const now = new Date().toISOString();
  const appId = auth.app.id;
  await db.transaction(async (tx) => {
    await tx.insert(plans).values({
      id: planId,
      clientId: appId,
      name,
      type: planType,
      priceAmount: String(body.priceAmount || "0"),
      priceCurrency: String(body.priceCurrency || "USD"),
      status: String(body.status || "active"),
      includedUnits:
        billing.includedUnits !== null ? BigInt(billing.includedUnits) : null,
      overageRateWei:
        billing.overageRateWei !== null ? BigInt(billing.overageRateWei) : null,
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
      return { tag: "notfound" as const };
    }

    const nextType = body.type !== undefined ? String(body.type) : existing.type;
    const billing = resolveBillingFieldsForPut(nextType, body, {
      includedUnits:
        existing.includedUnits != null ? String(existing.includedUnits) : null,
      overageRateWei:
        existing.overageRateWei != null ? String(existing.overageRateWei) : null,
    });
    if (!billing.ok) {
      return { tag: "validation" as const, error: billing.error };
    }

    const updated = await tx
      .update(plans)
      .set({
        name: body.name !== undefined ? String(body.name) : existing.name,
        type: nextType,
        priceAmount: body.priceAmount !== undefined ? String(body.priceAmount) : existing.priceAmount,
        priceCurrency: body.priceCurrency !== undefined ? String(body.priceCurrency) : existing.priceCurrency,
        status: body.status !== undefined ? String(body.status) : existing.status,
        includedUnits:
          billing.includedUnits !== null ? BigInt(billing.includedUnits) : null,
        overageRateWei:
          billing.overageRateWei !== null ? BigInt(billing.overageRateWei) : null,
        updatedAt: now,
      })
      .where(and(eq(plans.id, planId), eq(plans.clientId, appId)))
      .returning({ id: plans.id });

    if (updated.length === 0) {
      return { tag: "notfound" as const };
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

    return { tag: "ok" as const };
  });

  if (txnResult.tag === "notfound") {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }
  if (txnResult.tag === "validation") {
    return NextResponse.json({ error: txnResult.error }, { status: 400 });
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
