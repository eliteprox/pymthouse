"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";

interface PipelineCatalogEntry {
  id: string;
  name: string;
  models: string[];
}

interface PricingRow {
  orchAddress: string;
  pipeline: string;
  model: string;
  priceWeiPerUnit: string;
  pixelsPerUnit: string;
}

interface PlanRow {
  id: string;
  name: string;
  type: string;
  priceAmount: string;
  priceCurrency: string;
  status: string;
  includedUnits: string | null;
  overageRateWei: string | null;
  includedUsdMicros: string | null;
  generalUpchargePercentBps: number | null;
  payPerUseUpchargePercentBps: number | null;
  billingCycle: string;
  capabilities: {
    id: string;
    pipeline: string;
    modelId: string;
    slaTargetScore: number | null;
    slaTargetP95Ms: number | null;
    maxPricePerUnit: string | null;
    upchargePercentBps: number | null;
  }[];
}

const USD_MICROS = 1_000_000;

function usdMicrosToDisplay(micros: string | null | undefined): string {
  if (!micros) return "";
  const n = parseInt(micros, 10);
  if (isNaN(n)) return "";
  return (n / USD_MICROS).toFixed(2);
}

function displayToUsdMicros(display: string): string | null {
  const n = parseFloat(display);
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * USD_MICROS).toString();
}

function weiToEthDisplay(wei: string | undefined, ethUsdPrice: number | null): string {
  if (!wei) return "";
  try {
    const weiN = BigInt(wei);
    const whole = weiN / BigInt(1e18);
    const frac = weiN % BigInt(1e18);
    const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "").slice(0, 6);
    const eth = fracStr ? `${whole}.${fracStr}` : whole.toString();
    if (ethUsdPrice && ethUsdPrice > 0) {
      const usd = (parseFloat(eth) * ethUsdPrice).toFixed(6);
      return `${eth} ETH ≈ $${usd}`;
    }
    return `${eth} ETH`;
  } catch {
    return "";
  }
}

function bpsToPercent(bps: number | null | undefined): string {
  if (bps == null) return "";
  return (bps / 100).toFixed(2);
}

export default function AppPlansPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [appName, setAppName] = useState("App");
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [catalog, setCatalog] = useState<PipelineCatalogEntry[]>([]);
  const [pricing, setPricing] = useState<PricingRow[]>([]);
  const [ethUsdPrice, setEthUsdPrice] = useState<number | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "free",
    priceAmount: "0",
    priceCurrency: "USD",
    includedUnits: "",
    overageRateWei: "",
    includedUsdDisplay: "",
    generalUpchargePct: "",
    payPerUseUpchargePct: "",
    pipeline: "",
    modelId: "",
    capabilityUpchargePct: "",
    slaTargetP95Ms: "",
  });

  const selectedCatalogEntry = catalog.find((e) => e.id === form.pipeline);

  const matchedPricingRow =
    form.pipeline && form.modelId
      ? pricing.find((r) => r.pipeline === form.pipeline && r.model === form.modelId)
      : null;

  const exampleRetailUsd: string | null = (() => {
    if (!matchedPricingRow || !ethUsdPrice) return null;
    try {
      const priceWei = BigInt(matchedPricingRow.priceWeiPerUnit);
      const pixels = BigInt(matchedPricingRow.pixelsPerUnit);
      const feeWei = (priceWei * 1n) / pixels;
      const eth = Number(feeWei) / 1e18;
      const usd = eth * ethUsdPrice;
      const upchargePct = parseFloat(form.capabilityUpchargePct || form.generalUpchargePct || "0");
      const retail = usd * (1 + upchargePct / 100);
      return `$${retail.toFixed(8)} /unit`;
    } catch {
      return null;
    }
  })();

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/v1/apps/${id}`).then((r) => r.json()),
      fetch(`/api/v1/apps/${id}/plans`).then((r) => r.json()),
    ])
      .then(([app, payload]) => {
        setAppName(app.name || "App");
        setCanEdit(app.canEdit !== false);
        setPlans(payload.plans || []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/v1/pipeline-catalog")
      .then((r) => r.json())
      .then((d) => {
        if (d.catalog) setCatalog(d.catalog);
        else if (d.error) setCatalogError(d.error);
      })
      .catch(() => setCatalogError("NaaP catalog unavailable"));

    fetch("/api/v1/prices/eth-usd")
      .then((r) => r.json())
      .then((d) => {
        if (d.ethUsd?.priceUsd) setEthUsdPrice(d.ethUsd.priceUsd);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.pipeline) {
      setPricing([]);
      return;
    }
    fetch(`/api/v1/pipeline-pricing?pipeline=${encodeURIComponent(form.pipeline)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.pricing) setPricing(d.pricing);
      })
      .catch(() => {});
  }, [form.pipeline]);

  const parseBps = (pct: string): number | null => {
    const n = parseFloat(pct);
    if (!isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  };

  const createPlan = async () => {
    if (!canEdit || !form.name.trim()) return;
    setSaving(true);
    setPlanError(null);
    try {
      const generalBps = form.generalUpchargePct ? parseBps(form.generalUpchargePct) : null;
      const payPerUseBps = form.payPerUseUpchargePct ? parseBps(form.payPerUseUpchargePct) : null;
      const capabilityBps = form.capabilityUpchargePct ? parseBps(form.capabilityUpchargePct) : null;
      const includedUsdMicros = form.includedUsdDisplay
        ? displayToUsdMicros(form.includedUsdDisplay)
        : null;

      const res = await fetch(`/api/v1/apps/${id}/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          priceAmount: form.priceAmount,
          priceCurrency: form.priceCurrency,
          status: "active",
          includedUnits: form.type === "subscription" && form.includedUnits.trim() ? form.includedUnits.trim() : null,
          overageRateWei: (form.type === "subscription" || form.type === "usage") && form.overageRateWei.trim() ? form.overageRateWei.trim() : null,
          includedUsdMicros,
          generalUpchargePercentBps: generalBps,
          payPerUseUpchargePercentBps: payPerUseBps,
          capabilities: form.modelId
            ? [{
                modelId: form.modelId,
                pipeline: form.pipeline,
                slaTargetP95Ms: form.slaTargetP95Ms ? Number(form.slaTargetP95Ms) : null,
                upchargePercentBps: capabilityBps,
              }]
            : [],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPlanError(data?.error ?? `Failed to create plan (${res.status})`);
        return;
      }
      setForm({
        name: "", type: "free", priceAmount: "0", priceCurrency: "USD",
        includedUnits: "", overageRateWei: "", includedUsdDisplay: "",
        generalUpchargePct: "", payPerUseUpchargePct: "",
        pipeline: "", modelId: "", capabilityUpchargePct: "", slaTargetP95Ms: "",
      });
      load();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Failed to create plan");
    } finally {
      setSaving(false);
    }
  };

  const deletePlan = async (planId: string) => {
    if (!canEdit) return;
    try {
      const res = await fetch(`/api/v1/apps/${id}/plans?planId=${encodeURIComponent(planId)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPlanError(data?.error ?? `Failed to delete plan (${res.status})`);
        return;
      }
      load();
    } catch (err) {
      setPlanError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-8">
        <button
          onClick={() => router.push(`/apps/${id}`)}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-3 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to {appName}
        </button>
        <h1 className="text-2xl font-bold text-zinc-100">Plans</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Define subscription and pay-per-use plans with USD allowances and pipeline/model upcharges.
          {ethUsdPrice && (
            <span className="ml-2 text-zinc-400">
              ETH ≈ <span className="text-emerald-400">${ethUsdPrice.toFixed(0)}</span>
            </span>
          )}
        </p>
        {!canEdit && (
          <p className="text-sm text-amber-400/90 mt-2">
            View only — only platform or app administrators can create or delete plans.
          </p>
        )}
        {planError && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-2">
            {planError}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-100">New Plan</h2>

          {/* Basics */}
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Plan name"
            disabled={!canEdit}
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                disabled={!canEdit}
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
              >
                <option value="free">Free</option>
                <option value="subscription">Subscription</option>
                <option value="usage">Pay-Per-Use</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Monthly price (USD)</label>
              <input
                value={form.priceAmount}
                onChange={(e) => setForm({ ...form, priceAmount: e.target.value })}
                placeholder="0"
                disabled={!canEdit}
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
              />
            </div>
          </div>

          {/* USD included allowance */}
          {form.type === "subscription" && (
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Included usage allowance (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.includedUsdDisplay}
                onChange={(e) => setForm({ ...form, includedUsdDisplay: e.target.value })}
                placeholder="e.g. 10.00"
                disabled={!canEdit}
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
              />
            </div>
          )}

          {/* Upcharges */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">General upcharge (%)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.generalUpchargePct}
                onChange={(e) => setForm({ ...form, generalUpchargePct: e.target.value })}
                placeholder="e.g. 20"
                disabled={!canEdit}
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Pay-per-use upcharge (%)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.payPerUseUpchargePct}
                onChange={(e) => setForm({ ...form, payPerUseUpchargePct: e.target.value })}
                placeholder="optional"
                disabled={!canEdit}
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Pipeline / model override */}
          <div className="border-t border-zinc-800 pt-4 space-y-3">
            <h3 className="text-sm font-medium text-zinc-300">Pipeline / model override</h3>
            {catalogError && (
              <p className="text-xs text-amber-400">{catalogError} — existing bundles still work.</p>
            )}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Pipeline</label>
              {catalog.length > 0 ? (
                <select
                  value={form.pipeline}
                  onChange={(e) => setForm({ ...form, pipeline: e.target.value, modelId: "" })}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
                >
                  <option value="">— none —</option>
                  {catalog.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.pipeline}
                  onChange={(e) => setForm({ ...form, pipeline: e.target.value })}
                  placeholder="pipeline id"
                  disabled={!canEdit}
                  className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
                />
              )}
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Model</label>
              {selectedCatalogEntry && selectedCatalogEntry.models.length > 0 ? (
                <select
                  value={form.modelId}
                  onChange={(e) => setForm({ ...form, modelId: e.target.value })}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
                >
                  <option value="">— none —</option>
                  {selectedCatalogEntry.models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.modelId}
                  onChange={(e) => setForm({ ...form, modelId: e.target.value })}
                  placeholder="model id"
                  disabled={!canEdit || !form.pipeline}
                  className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
                />
              )}
            </div>
            {matchedPricingRow && (
              <div className="text-xs text-zinc-400 bg-zinc-800/40 rounded-lg px-3 py-2 space-y-1">
                <p>NaaP advertised price: <span className="text-zinc-200">{weiToEthDisplay(matchedPricingRow.priceWeiPerUnit, ethUsdPrice)}</span> / {matchedPricingRow.pixelsPerUnit} px</p>
                {exampleRetailUsd && (
                  <p>Example retail: <span className="text-emerald-400">{exampleRetailUsd}</span></p>
                )}
                <p className="text-zinc-500">Billing applies this override only after the signed ticket price validates against the advertised NaaP price.</p>
              </div>
            )}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Override upcharge (%) for this pipeline/model</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.capabilityUpchargePct}
                onChange={(e) => setForm({ ...form, capabilityUpchargePct: e.target.value })}
                placeholder="optional — overrides general upcharge"
                disabled={!canEdit || !form.pipeline}
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
              />
            </div>
          </div>

          <button
            onClick={createPlan}
            disabled={!canEdit || saving}
            className="w-full px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Create Plan"}
          </button>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
          <h2 className="text-lg font-semibold text-zinc-100 mb-4">Existing Plans</h2>
          {loading ? (
            <div className="text-zinc-500 animate-pulse">Loading plans...</div>
          ) : plans.length === 0 ? (
            <div className="text-zinc-500">No plans yet.</div>
          ) : (
            <div className="space-y-4">
              {plans.map((plan) => (
                <div key={plan.id} className="rounded-xl border border-zinc-800 bg-zinc-800/30 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-zinc-100">{plan.name}</h3>
                      <p className="text-xs text-zinc-500 mt-1">
                        {plan.type} · {plan.priceAmount} {plan.priceCurrency}
                        {plan.billingCycle ? ` · ${plan.billingCycle}` : ""}
                      </p>
                      {plan.includedUsdMicros && (
                        <p className="text-xs text-emerald-400/80 mt-1">
                          Includes ${usdMicrosToDisplay(plan.includedUsdMicros)} USD usage
                        </p>
                      )}
                      {(plan.generalUpchargePercentBps != null || plan.payPerUseUpchargePercentBps != null) && (
                        <p className="text-xs text-zinc-400 mt-1">
                          {plan.generalUpchargePercentBps != null && `General upcharge: ${bpsToPercent(plan.generalUpchargePercentBps)}%`}
                          {plan.generalUpchargePercentBps != null && plan.payPerUseUpchargePercentBps != null && " · "}
                          {plan.payPerUseUpchargePercentBps != null && `PPU upcharge: ${bpsToPercent(plan.payPerUseUpchargePercentBps)}%`}
                        </p>
                      )}
                      {plan.capabilities.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {plan.capabilities.map((cap) => (
                            <p key={cap.id} className="text-xs text-zinc-400">
                              <span className="text-zinc-200">{cap.pipeline}</span> · {cap.modelId}
                              {cap.upchargePercentBps != null && ` · ${bpsToPercent(cap.upchargePercentBps)}% upcharge`}
                              {cap.slaTargetP95Ms ? ` · p95 ${cap.slaTargetP95Ms}ms` : ""}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => deletePlan(plan.id)}
                      disabled={!canEdit}
                      className="text-xs text-zinc-500 hover:text-red-400 disabled:opacity-40 shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
