"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import AppInfoStep from "./steps/AppInfoStep";
import AppModeStep from "./steps/AppModeStep";
import TestingStep from "./steps/TestingStep";
import { DEFAULT_OIDC_SCOPES } from "@/lib/oidc/scopes";

const ALL_STEPS = [
  { label: "App Info", key: "info" as const, alwaysVisible: true },
  { label: "Auth & Scopes", key: "mode" as const, alwaysVisible: true },
  { label: "Credentials & Testing", key: "testing" as const, alwaysVisible: true },
];

export interface AppFormData {
  name: string;
  description: string;
  developerName: string;
  websiteUrl: string;
  tokenEndpointAuthMethod: "none" | "client_secret_post" | "client_secret_basic";
  redirectUris: string[];
  allowedScopes: string;
  grantTypes: string[];
}

export interface AppState {
  id: string | null;
  clientId: string | null;
  status: string;
  hasSecret: boolean;
  pendingRevisionSubmittedAt?: string | null;
}

export const defaultAppFormData: AppFormData = {
  name: "",
  description: "",
  developerName: "",
  websiteUrl: "",
  tokenEndpointAuthMethod: "none",
  redirectUris: [],
  allowedScopes: DEFAULT_OIDC_SCOPES,
  grantTypes: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
};

interface Props {
  initialData?: Partial<AppFormData>;
  initialState?: AppState;
  initialDomains?: { id: string; domain: string }[];
}

export default function AppWizard({ initialData, initialState, initialDomains }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<AppFormData>({
    ...defaultAppFormData,
    ...initialData,
  });
  const [appState, setAppState] = useState<AppState>(
    initialState || { id: null, clientId: null, status: "new", hasSecret: false }
  );
  const [domains, setDomains] = useState<{ id: string; domain: string }[]>(
    initialDomains || []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isM2MMode =
    formData.tokenEndpointAuthMethod !== "none" &&
    formData.grantTypes.includes("client_credentials");

  const visibleSteps = useMemo(() => ALL_STEPS, []);

  const updateFormData = useCallback(
    (updates: Partial<AppFormData>) => {
      setFormData((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const saveApp = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      if (!appState.id) {
        const res = await fetch("/api/v1/apps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!res.ok) {
          const text = await res.text();
          const data = text ? JSON.parse(text) : {};
          throw new Error(data.error || `Failed to create app (${res.status})`);
        }
        const data = await res.json();
        setAppState({
          id: data.id,
          clientId: data.clientId,
          status: data.status ?? "draft",
          hasSecret: false,
        });
      } else {
        const res = await fetch(`/api/v1/apps/${appState.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!res.ok) {
          const text = await res.text();
          const data = text ? JSON.parse(text) : {};
          throw new Error(data.error || `Failed to update app (${res.status})`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [appState.id, formData]);

  const handleNext = useCallback(async () => {
    try {
      await saveApp();
      setStep((currentStep) => Math.min(currentStep + 1, visibleSteps.length - 1));
    } catch {
      // error already set
    }
  }, [saveApp, visibleSteps.length]);

  const handleBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const handleFinish = useCallback(async () => {
    if (!appState.id) return;
    setError(null);
    try {
      await saveApp();
      const submitRes = await fetch(`/api/v1/apps/${appState.id}/submit`, {
        method: "POST",
      });
      if (!submitRes.ok) {
        const text = await submitRes.text();
        let msg = `Could not submit for review (${submitRes.status})`;
        try {
          const data = text ? JSON.parse(text) : {};
          if (data.message) msg = data.message;
          else if (data.error) msg = data.error;
        } catch {
          /* keep generic */
        }
        throw new Error(msg);
      }
      router.push(`/apps/${appState.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [appState.id, router, saveApp]);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress Stepper */}
      <div className="flex items-center justify-between mb-8">
        {visibleSteps.map((s, i) => (
          <div key={s.key} className="flex items-center flex-1">
            <button
              onClick={() => appState.id && setStep(i)}
              disabled={!appState.id && i > 0}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  i === step
                    ? "bg-emerald-500 text-white"
                    : i < step
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {i < step ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-xs font-medium ${
                  i === step ? "text-emerald-400" : "text-zinc-500"
                }`}
              >
                {s.label}
              </span>
            </button>
            {i < visibleSteps.length - 1 && (
              <div
                className={`flex-1 h-px mx-2 ${
                  i < step ? "bg-emerald-500/30" : "bg-zinc-800"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Step Content */}
      <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-6">
        {visibleSteps[step]?.key === "info" && (
          <AppInfoStep data={formData} onChange={updateFormData} />
        )}
        {visibleSteps[step]?.key === "mode" && (
          <AppModeStep data={formData} onChange={updateFormData} />
        )}
        {visibleSteps[step]?.key === "testing" && (
          <TestingStep
            appId={appState.id}
            clientId={appState.clientId}
            grantTypes={formData.grantTypes}
            redirectUris={formData.redirectUris}
            onRedirectUrisChange={(uris) => updateFormData({ redirectUris: uris })}
            allowedScopes={formData.allowedScopes}
            domains={domains}
            onDomainsChange={setDomains}
            hasSecret={appState.hasSecret}
            onSecretGenerated={() => {
              setAppState((s) => ({ ...s, hasSecret: true }));
              updateFormData({ tokenEndpointAuthMethod: "client_secret_post" });
            }}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={handleBack}
          disabled={step === 0}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Back
        </button>
        <div className="flex gap-2">
          {step < visibleSteps.length - 1 && (
            <button
              onClick={handleNext}
              disabled={saving || (!formData.name && step === 0)}
              className="px-6 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : appState.id ? "Save & Continue" : "Create App"}
            </button>
          )}
          {step === visibleSteps.length - 1 && appState.id && (
            <button
              type="button"
              onClick={handleFinish}
              disabled={saving}
              className="px-6 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : "Save & view app"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
