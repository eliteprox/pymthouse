"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_OIDC_SCOPES } from "@/lib/oidc/scopes";

const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export interface AppFormData {
  name: string;
  description: string;
  developerName: string;
  websiteUrl: string;
  tokenEndpointAuthMethod: "none" | "client_secret_post" | "client_secret_basic";
  redirectUris: string[];
  allowedScopes: string;
  grantTypes: string[];
  /** Provisions the confidential M2M sibling (Builder API + device approval via token exchange); keeps the public client unauthenticated. */
  backendDeviceHelper: boolean;
  /** OIDC initiate_login_uri for third-party device login. */
  initiateLoginUri: string;
  /** Whether to redirect unauthenticated device verification to initiateLoginUri. */
  deviceThirdPartyInitiateLogin: boolean;
}

export interface AppState {
  id: string | null;
  clientId: string | null;
  status: string;
  hasSecret: boolean;
  /** Confidential backend helper client (null until provisioned). */
  backendHelper: { clientId: string; hasSecret: boolean } | null;
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
  grantTypes: ["authorization_code", "refresh_token"],
  backendDeviceHelper: false,
  initiateLoginUri: "",
  deviceThirdPartyInitiateLogin: false,
};

interface Props {
  initialData?: Partial<AppFormData>;
  initialState?: AppState;
  initialDomains?: { id: string; domain: string }[];
}

const fieldClass =
  "w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 disabled:opacity-50";

export default function AppWizard({ initialData }: Props) {
  const router = useRouter();
  const [formData, setFormData] = useState<AppFormData>({
    ...defaultAppFormData,
    ...initialData,
  });
  const [callbackUrl, setCallbackUrl] = useState(initialData?.redirectUris?.[0] ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasDeviceCode = formData.grantTypes.includes(DEVICE_CODE_GRANT);

  const set = useCallback(<K extends keyof AppFormData>(key: K, value: AppFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleDeviceCode = () => {
    if (hasDeviceCode) {
      set("grantTypes", formData.grantTypes.filter((v) => v !== DEVICE_CODE_GRANT));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      backendDeviceHelper: true,
      grantTypes: prev.grantTypes.includes(DEVICE_CODE_GRANT)
        ? prev.grantTypes
        : [...prev.grantTypes, DEVICE_CODE_GRANT],
    }));
    setShowAdvanced(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: AppFormData = {
        ...formData,
        redirectUris: callbackUrl.trim() ? [callbackUrl.trim()] : [],
      };
      const res = await fetch("/api/v1/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Failed to create app (${res.status})`;
        try {
          const data = text ? JSON.parse(text) : {};
          if (data && typeof data === "object") {
            if (typeof (data as { message?: unknown }).message === "string") {
              msg = (data as { message: string }).message;
            } else if (typeof (data as { error?: unknown }).error === "string") {
              msg = (data as { error: string }).error;
            }
          }
        } catch {
          if (text?.trim()) msg = text.trim().slice(0, 500);
        }
        throw new Error(msg);
      }
      const data = await res.json();
      router.push(`/apps/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    !saving &&
    formData.name.trim().length > 0 &&
    formData.websiteUrl.trim().length > 0;

  return (
    <div className="max-w-[540px]">
      <h1 className="text-lg font-semibold text-zinc-100 pb-4 mb-6 border-b border-zinc-800">
        Register a new OAuth app
      </h1>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        {error && (
          <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Application name */}
        <div>
          <label className="block text-sm font-medium text-zinc-200 mb-1.5">
            Application name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => set("name", e.target.value)}
            required
            className={fieldClass}
          />
          <p className="text-xs text-zinc-500 mt-1.5">Something users will recognize and trust.</p>
        </div>

        {/* Homepage URL */}
        <div>
          <label className="block text-sm font-medium text-zinc-200 mb-1.5">
            Homepage URL <span className="text-red-400">*</span>
          </label>
          <input
            type="url"
            value={formData.websiteUrl}
            onChange={(e) => set("websiteUrl", e.target.value)}
            required
            placeholder="https://"
            className={fieldClass}
          />
          <p className="text-xs text-zinc-500 mt-1.5">The full URL to your application homepage.</p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-zinc-200 mb-1.5">
            Application description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            placeholder="Application description is optional"
            className={`${fieldClass} resize-none`}
          />
          <p className="text-xs text-zinc-500 mt-1.5">
            This is displayed to all users of your application.
          </p>
        </div>

        {/* Authorization callback URL */}
        <div>
          <label className="block text-sm font-medium text-zinc-200 mb-1.5">
            Authorization callback URL
          </label>
          <input
            type="url"
            value={callbackUrl}
            onChange={(e) => setCallbackUrl(e.target.value)}
            placeholder="https://"
            className={fieldClass}
          />
          <p className="text-xs text-zinc-500 mt-1.5">
            Required for the browser authorization code flow. Optional if you only use
            device or server flows for now; you can add this later in app settings. Read our{" "}
            <a href="/docs/oauth" className="text-emerald-500 hover:underline">
              OAuth documentation
            </a>{" "}
            for more information.
          </p>
        </div>

        {/* Enable Device Flow */}
        <div className="pt-1">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={hasDeviceCode}
              onChange={toggleDeviceCode}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/40"
            />
            <span className="text-sm font-medium text-zinc-200">Enable Device Flow</span>
          </label>
          <p className="text-xs text-zinc-500 mt-1.5 ml-[26px]">
            Allow this OAuth App to authorize users via the Device Flow. Enabling this also
            provisions a confidential client.
            <br />
            Read the{" "}
            <a href="/docs/device-flow" className="text-emerald-500 hover:underline">
              Device Flow documentation
            </a>{" "}
            for more information.
          </p>
        </div>

        {/* Advanced settings */}
        <div className="border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Advanced settings
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-5 pl-[22px]">
              {/* Developer / org name */}
              <div>
                <label className="block text-sm font-medium text-zinc-200 mb-1.5">
                  Developer / organization name
                </label>
                <input
                  type="text"
                  value={formData.developerName}
                  onChange={(e) => set("developerName", e.target.value)}
                  placeholder="Acme Inc."
                  className={fieldClass}
                />
              </div>

              {/* Confidential client (M2M) */}
              <div>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.backendDeviceHelper)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      if (!checked) {
                        setFormData((prev) => ({
                          ...prev,
                          backendDeviceHelper: false,
                          grantTypes: prev.grantTypes.filter((g) => g !== DEVICE_CODE_GRANT),
                        }));
                      } else {
                        set("backendDeviceHelper", true);
                      }
                    }}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/40"
                  />
                  <span className="text-sm font-medium text-zinc-200">
                    Confidential client{" "}
                    <span className="text-[10px] font-normal text-zinc-500 uppercase tracking-wide">
                      (client credentials)
                    </span>
                  </span>
                </label>
                <p className="text-xs text-zinc-500 mt-1.5 ml-[26px]">
                  Provisions a companion{" "}
                  <code className="font-mono text-zinc-400">m2m_</code> client for
                  server-to-server Builder APIs. Your public client remains
                  unauthenticated for SDK / CLI device login.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Registering…" : "Register application"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/apps")}
            className="text-sm text-emerald-500 hover:underline"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
