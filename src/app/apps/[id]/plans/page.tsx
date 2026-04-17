"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";

interface PlanRow {
  id: string;
  name: string;
  type: string;
  priceAmount: string;
  priceCurrency: string;
  status: string;
  includedUnits: string | null;
  overageRateWei: string | null;
  capabilities: {
    id: string;
    pipeline: string;
    modelId: string;
    slaTargetScore: number | null;
    slaTargetP95Ms: number | null;
    maxPricePerUnit: string | null;
  }[];
}

export default function AppPlansPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [appName, setAppName] = useState("App");
  const [plans, setPlans] = useState<PlanRow[]>([]);
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
    modelId: "",
    pipeline: "video",
    slaTargetP95Ms: "",
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/v1/apps/${id}`).then((response) => response.json()),
      fetch(`/api/v1/apps/${id}/plans`).then((response) => response.json()),
    ])
      .then(([app, payload]) => {
        setAppName(app.name || "App");
        setCanEdit(app.canEdit !== false);
        setPlans(payload.plans || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  const createPlan = async () => {
    if (!canEdit || !form.name.trim()) return;
    setSaving(true);
    setPlanError(null);
    try {
      const res = await fetch(`/api/v1/apps/${id}/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          priceAmount: form.priceAmount,
          priceCurrency: form.priceCurrency,
          status: "active",
          includedUnits:
            form.type === "subscription" && form.includedUnits.trim()
              ? form.includedUnits.trim()
              : null,
          overageRateWei:
            (form.type === "subscription" || form.type === "usage") &&
            form.overageRateWei.trim()
              ? form.overageRateWei.trim()
              : null,
          capabilities: form.modelId
            ? [
                {
                  modelId: form.modelId,
                  pipeline: form.pipeline,
                  slaTargetP95Ms: form.slaTargetP95Ms ? Number(form.slaTargetP95Ms) : null,
                },
              ]
            : [],
        }),
      });
      if (!res.ok) {
        let msg = `Failed to create plan (${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          /* ignore */
        }
        setPlanError(msg);
        return;
      }
      setForm({
        name: "",
        type: "free",
        priceAmount: "0",
        priceCurrency: "USD",
        includedUnits: "",
        overageRateWei: "",
        modelId: "",
        pipeline: "video",
        slaTargetP95Ms: "",
      });
      setPlanError(null);
      load();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Failed to create plan");
    } finally {
      setSaving(false);
    }
  };

  const deletePlan = async (planId: string) => {
    if (!canEdit) return;
    setPlanError("");
    try {
      const res = await fetch(`/api/v1/apps/${id}/plans?planId=${encodeURIComponent(planId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        let msg = `Failed to delete plan (${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          /* ignore */
        }
        setPlanError(msg);
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
          Define minimal provider plans. NaaP data can be layered in later; manual entry works now.
        </p>
        {!canEdit && (
          <p className="text-sm text-amber-400/90 mt-2">
            View only — only platform or app administrators can create or delete
            plans.
          </p>
        )}
        {planError && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-2">
            {planError}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-100">New Plan</h2>
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Clinical Pro"
            disabled={!canEdit}
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
              disabled={!canEdit}
              className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
            >
              <option value="free">Free</option>
              <option value="subscription">Subscription</option>
              <option value="usage">Pay-Per-Use</option>
            </select>
            <input
              value={form.priceAmount}
              onChange={(event) => setForm({ ...form, priceAmount: event.target.value })}
              placeholder="0"
              disabled={!canEdit}
              className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
            />
          </div>
          {form.type === "subscription" && (
            <input
              value={form.includedUnits}
              onChange={(event) =>
                setForm({ ...form, includedUnits: event.target.value })
              }
              placeholder="Included units (pixels) per billing cycle"
              disabled={!canEdit}
              className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          )}
          {(form.type === "subscription" || form.type === "usage") && (
            <input
              value={form.overageRateWei}
              onChange={(event) =>
                setForm({ ...form, overageRateWei: event.target.value })
              }
              placeholder={
                form.type === "usage"
                  ? "Rate per unit (wei)"
                  : "Overage rate (wei per unit)"
              }
              disabled={!canEdit}
              className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.modelId}
              onChange={(event) => setForm({ ...form, modelId: event.target.value })}
              placeholder="livepeer/model-id"
              disabled={!canEdit}
              className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
            />
            <input
              value={form.pipeline}
              onChange={(event) => setForm({ ...form, pipeline: event.target.value })}
              placeholder="video"
              disabled={!canEdit}
              className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
            />
          </div>
          <input
            value={form.slaTargetP95Ms}
            onChange={(event) => setForm({ ...form, slaTargetP95Ms: event.target.value })}
            placeholder="p95 latency ms"
            disabled={!canEdit}
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50"
          />
          <button
            onClick={createPlan}
            disabled={!canEdit || saving}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-500 disabled:opacity-50"
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
            <div className="space-y-3">
              {plans.map((plan) => (
                <div key={plan.id} className="rounded-xl border border-zinc-800 bg-zinc-800/30 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100">{plan.name}</h3>
                      <p className="text-xs text-zinc-500 mt-1">
                        {plan.type} · {plan.priceAmount} {plan.priceCurrency}
                      </p>
                      {(plan.includedUnits || plan.overageRateWei) && (
                        <p className="text-xs text-zinc-500 mt-1">
                          {plan.includedUnits
                            ? `Included ${plan.includedUnits} units`
                            : null}
                          {plan.includedUnits && plan.overageRateWei ? " · " : null}
                          {plan.overageRateWei
                            ? `Rate ${plan.overageRateWei} wei/unit`
                            : null}
                        </p>
                      )}
                      <div className="mt-3 space-y-1">
                        {plan.capabilities.map((capability) => (
                          <p key={capability.id} className="text-xs text-zinc-400">
                            {capability.pipeline} · {capability.modelId}
                            {capability.slaTargetP95Ms ? ` · p95 ${capability.slaTargetP95Ms}ms` : ""}
                          </p>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => deletePlan(plan.id)}
                      disabled={!canEdit}
                      className="text-xs text-zinc-500 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
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
