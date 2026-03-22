"use client";

import { useState, useCallback } from "react";
import AppInfoStep from "./steps/AppInfoStep";
import AuthAndDomainsStep from "./steps/AuthAndDomainsStep";
import IdentityBrandingStep from "./steps/IdentityBrandingStep";
import TestingStep from "./steps/TestingStep";
import ReviewSubmitStep from "./steps/ReviewSubmitStep";
import { DEFAULT_OIDC_SCOPES } from "@/lib/oidc/scopes";

const STEPS = [
  { label: "App Info", key: "info" },
  { label: "Auth & Scopes", key: "auth" },
  { label: "Identity & Branding", key: "branding" },
  { label: "Domains & Testing", key: "testing" },
  { label: "Submit", key: "submit" },
] as const;

export interface AppFormData {
  // Step 1: App Info
  name: string;
  subtitle: string;
  description: string;
  category: string;
  developerName: string;
  websiteUrl: string;

  // Step 2: Auth & Scopes
  tokenEndpointAuthMethod: "none" | "client_secret_post" | "client_secret_basic";
  redirectUris: string[];
  allowedScopes: string;
  grantTypes: string[];

  // Step 3: Identity & Branding
  brandingMode: "blackLabel" | "whiteLabel";
  brandingLogoUrl?: string;
  brandingPrimaryColor?: string;
  brandingSupportEmail?: string;
  customLoginDomain?: string;
  customDomainVerificationToken?: string;
  customDomainVerifiedAt?: string;

  // Step 5: Review & Submit
  supportUrl: string;
  privacyPolicyUrl: string;
  tosUrl: string;
  demoRecordingUrl: string;
  linksToPurchases: boolean;
}

export interface AppState {
  id: string | null;
  clientId: string | null;
  status: string;
  hasSecret: boolean;
  pendingRevisionSubmittedAt?: string | null;
}

const defaultFormData: AppFormData = {
  name: "",
  subtitle: "",
  description: "",
  category: "",
  developerName: "",
  websiteUrl: "",
  tokenEndpointAuthMethod: "none",
  redirectUris: [],
  allowedScopes: DEFAULT_OIDC_SCOPES,
  grantTypes: ["authorization_code", "refresh_token"],
  brandingMode: "blackLabel",
  brandingLogoUrl: undefined,
  brandingPrimaryColor: undefined,
  brandingSupportEmail: undefined,
  customLoginDomain: undefined,
  customDomainVerificationToken: undefined,
  customDomainVerifiedAt: undefined,
  supportUrl: "",
  privacyPolicyUrl: "",
  tosUrl: "",
  demoRecordingUrl: "",
  linksToPurchases: false,
};

interface Props {
  initialData?: Partial<AppFormData>;
  initialState?: AppState;
  initialDomains?: { id: string; domain: string }[];
}

export default function AppWizard({ initialData, initialState, initialDomains }: Props) {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<AppFormData>({
    ...defaultFormData,
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
          status: "draft",
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
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    } catch {
      // error already set
    }
  }, [saveApp]);

  const handleBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress Stepper */}
      <div className="flex items-center justify-between mb-8">
        {STEPS.map((s, i) => (
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
            {i < STEPS.length - 1 && (
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
        {step === 0 && (
          <AppInfoStep data={formData} onChange={updateFormData} />
        )}
        {step === 1 && (
          <AuthAndDomainsStep data={formData} onChange={updateFormData} />
        )}
        {step === 2 && (
          <IdentityBrandingStep
            data={formData}
            onChange={updateFormData}
            appId={appState.id}
          />
        )}
        {step === 3 && (
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
            onSecretGenerated={() =>
              setAppState((s) => ({ ...s, hasSecret: true }))
            }
          />
        )}
        {step === 4 && (
          <ReviewSubmitStep
            data={formData}
            appState={appState}
            onChange={updateFormData}
            onStatusChange={(status) =>
              setAppState((s) => ({ ...s, status }))
            }
            onAppStateChange={(updates) =>
              setAppState((s) => ({ ...s, ...updates }))
            }
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
        {step < STEPS.length - 1 && (
          <button
            onClick={handleNext}
            disabled={saving || (!formData.name && step === 0)}
            className="px-6 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : appState.id ? "Save & Continue" : "Create App"}
          </button>
        )}
      </div>
    </div>
  );
}
