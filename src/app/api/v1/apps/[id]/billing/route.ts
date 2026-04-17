import { NextRequest, NextResponse } from "next/server";
import { authenticateAppClient } from "@/lib/auth";
import { db } from "@/db/index";
import { plans, signerConfig, subscriptions, usageRecords } from "@/db/schema";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getAuthorizedProviderApp, getProviderApp } from "@/lib/provider-apps";
import { calendarMonthBoundsUtc, dateKeysInclusiveUtc } from "@/lib/billing-utils";

function dateKeyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const clientAuth = await authenticateAppClient(request);

  let app: Awaited<ReturnType<typeof getProviderApp>> | null = null;
  if (clientAuth?.appId === clientId) {
    app = await getProviderApp(clientId);
  } else {
    let providerAuth: Awaited<ReturnType<typeof getAuthorizedProviderApp>> | null = null;
    try {
      providerAuth = await getAuthorizedProviderApp(clientId);
    } catch (err) {
      // Log error for debugging
      console.error("getAuthorizedProviderApp failed", err);
      providerAuth = null;
    }
    if (!providerAuth) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    app = providerAuth.app;
  }

  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const signerRows = await db
    .select({ defaultCutPercent: signerConfig.defaultCutPercent })
    .from(signerConfig)
    .where(eq(signerConfig.id, "default"))
    .limit(1);
  const platformCutPercent = signerRows[0]?.defaultCutPercent ?? null;

  const ownerSubRows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.clientId, app.id),
        eq(subscriptions.userId, app.ownerId),
        eq(subscriptions.status, "active"),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const ownerSubscription = ownerSubRows[0] ?? null;

  let planRow: typeof plans.$inferSelect | null = null;
  if (ownerSubscription) {
    const pr = await db
      .select()
      .from(plans)
      .where(eq(plans.id, ownerSubscription.planId))
      .limit(1);
    planRow = pr[0] ?? null;
  }

  if (!planRow) {
    const fallbackPlans = await db
      .select()
      .from(plans)
      .where(
        and(eq(plans.clientId, app.id), eq(plans.status, "active")),
      )
      .orderBy(desc(plans.updatedAt))
      .limit(1);
    planRow = fallbackPlans[0] ?? null;
  }

  let periodStart: string;
  let periodEnd: string;
  if (
    ownerSubscription?.currentPeriodStart &&
    ownerSubscription?.currentPeriodEnd
  ) {
    periodStart = ownerSubscription.currentPeriodStart;
    periodEnd = ownerSubscription.currentPeriodEnd;
  } else {
    const cal = calendarMonthBoundsUtc(new Date());
    periodStart = cal.start;
    periodEnd = cal.end;
  }

  const rows = await db
    .select()
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.clientId, app.id),
        gte(usageRecords.createdAt, periodStart),
        lte(usageRecords.createdAt, periodEnd),
      ),
    );

  let totalFeeWei = 0n;
  let totalUnits = 0n;
  const byDay = new Map<
    string,
    { requestCount: number; feeWei: bigint }
  >();

  for (const row of rows) {
    const feeStr = row.fee || "0";
    totalFeeWei += BigInt(feeStr);
    totalUnits += BigInt(row.units || "0");
    const day = dateKeyFromIso(row.createdAt);
    const cur = byDay.get(day) || { requestCount: 0, feeWei: 0n };
    cur.requestCount += 1;
    cur.feeWei += BigInt(feeStr);
    byDay.set(day, cur);
  }

  const timelineDates = dateKeysInclusiveUtc(periodStart, periodEnd);

  const timeline = timelineDates.map((date) => {
    const bucket = byDay.get(date);
    return {
      date,
      requestCount: bucket?.requestCount ?? 0,
      feeWei: (bucket?.feeWei ?? 0n).toString(),
    };
  });

  const planType = planRow?.type ?? "free";
  let overageUnits = "0";
  let overageWei = "0";
  if (
    (planType === "subscription" || planType === "usage") &&
    planRow?.includedUnits &&
    planRow?.overageRateWei
  ) {
    const included = BigInt(planRow.includedUnits);
    const rate = BigInt(planRow.overageRateWei);
    if (totalUnits > included) {
      const over = totalUnits - included;
      overageUnits = over.toString();
      overageWei = (over * rate).toString();
    }
  }

  return NextResponse.json({
    clientId,
    plan: planRow
      ? {
          id: planRow.id,
          type: planRow.type,
          name: planRow.name,
          priceAmount: planRow.priceAmount,
          priceCurrency: planRow.priceCurrency,
          includedUnits:
            planRow.includedUnits != null
              ? planRow.includedUnits.toString()
              : null,
          overageRateWei:
            planRow.overageRateWei != null
              ? planRow.overageRateWei.toString()
              : null,
          status: planRow.status,
        }
      : null,
    subscription: ownerSubscription
      ? {
          id: ownerSubscription.id,
          status: ownerSubscription.status,
          currentPeriodStart: ownerSubscription.currentPeriodStart,
          currentPeriodEnd: ownerSubscription.currentPeriodEnd,
        }
      : null,
    cycle: {
      periodStart,
      periodEnd,
      usage: {
        requestCount: rows.length,
        totalFeeWei: totalFeeWei.toString(),
        totalUnits: totalUnits.toString(),
      },
      timeline,
      overage: {
        overageUnits,
        overageWei,
      },
    },
    platformCutPercent,
  });
}
