"use client";

import { useState, useCallback } from "react";
import AppInfoStep from "./steps/AppInfoStep";
import AppModeStep from "./steps/AppModeStep";
import TestingStep from "./steps/TestingStep";
import {
  defaultAppFormData,
  type AppFormData,
  type AppState,
} from "./AppWizard";

interface Props {
  appId: string;
  initialData: Partial<AppFormData>;
  initialState: AppState;
  initialDomains: { id: string; domain: string }[];
  /** Post-logout URIs and initiate-login URI (OIDC client metadata). */
  initialPostLogoutRedirectUris?: string[];
  initialInitiateLoginUri?: string | null;
  /** When false, settings are view-only (non-admin team members). */
  canEdit?: boolean;
}

function mergeFormData(initial: Partial<AppFormData>): AppFormData {
  return {
    ...defaultAppFormData,
    ...initial,
    redirectUris: initial.redirectUris ?? [...defaultAppFormData.redirectUris],
    grantTypes:
      initial.grantTypes !== undefined
        ? [...initial.grantTypes]
        : [...defaultAppFormData.grantTypes],
    allowedScopes: initial.allowedScopes ?? defaultAppFormData.allowedScopes,
  };
}

export default function AppSettingsScreen({
  appId,
  initialData,
  initialState,
  initialDomains,
  initialPostLogoutRedirectUris = [],
  initialInitiateLoginUri = null,
  canEdit = true,
}: Props) {
  const [formData, setFormData] = useState<AppFormData>(() =>
    mergeFormData(initialData),
  );
  const [appState, setAppState] = useState<AppState>(initialState);
  const [domains, setDomains] = useState<{ id: string; domain: string }[]>(
    initialDomains,
  );
  const [postLogoutRedirectUris, setPostLogoutRedirectUris] = useState<string[]>(
    initialPostLogoutRedirectUris,
  );
  const [initiateLoginUri, setInitiateLoginUri] = useState(
    initialInitiateLoginUri ?? "",
  );
  const [newPostLogoutUri, setNewPostLogoutUri] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const updateFormData = useCallback(
    (updates: Partial<AppFormData>) => {
      setFormData((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  const saveChanges = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/apps/${appId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Failed to save (${res.status})`;
        try {
          const data = text ? JSON.parse(text) : {};
          if (data.error) msg = data.error;
        } catch {
          /* keep generic */
        }
        throw new Error(msg);
      }

      const settingsRes = await fetch(`/api/v1/apps/${appId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postLogoutRedirectUris,
          initiateLoginUri: initiateLoginUri.trim() || null,
          tokenEndpointAuthMethod: formData.tokenEndpointAuthMethod,
        }),
      });
      if (!settingsRes.ok) {
        const body = await settingsRes.json().catch(() => ({}));
        throw new Error(
          body.error || "App metadata saved, but failed to save OIDC settings"
        );
      }

      setMessage("All settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [appId, formData, postLogoutRedirectUris, initiateLoginUri, canEdit]);

  const addPostLogoutUri = () => {
    const trimmed = newPostLogoutUri.trim();
    if (!trimmed || postLogoutRedirectUris.includes(trimmed)) return;
    setPostLogoutRedirectUris((u) => [...u, trimmed]);
    setNewPostLogoutUri("");
  };

  const discoveryUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/.well-known/openid-configuration`
      : "";
  const authorizeUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/v1/oidc/authorize`
      : "";
  const tokenUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/v1/oidc/token`
      : "";

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {!canEdit && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-200 text-sm">
          You can view this app&apos;s configuration. Only platform or app
          administrators can change settings.
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm">
          {message}
        </div>
      )}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <AppInfoStep
          data={formData}
          onChange={updateFormData}
          readOnly={!canEdit}
        />
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <AppModeStep
          data={formData}
          onChange={updateFormData}
          readOnly={!canEdit}
        />
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <TestingStep
          appId={appId}
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
          readOnly={!canEdit}
        />
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Advanced OIDC</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Post-logout redirects and optional initiate-login URI. Saved with{" "}
            <strong className="text-zinc-400">Save</strong> below.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Post-logout redirect URIs
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newPostLogoutUri}
              onChange={(e) => setNewPostLogoutUri(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && (e.preventDefault(), addPostLogoutUri())
              }
              placeholder="https://example.com/logout-complete"
              disabled={!canEdit}
              className="flex-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={addPostLogoutUri}
              disabled={!canEdit}
              className="px-4 py-2 rounded-lg bg-zinc-700 text-zinc-200 text-sm hover:bg-zinc-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
          <div className="space-y-2">
            {postLogoutRedirectUris.map((uri) => (
              <div
                key={uri}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-2"
              >
                <code className="text-xs text-zinc-300">{uri}</code>
                <button
                  type="button"
                  onClick={() =>
                    setPostLogoutRedirectUris((items) =>
                      items.filter((item) => item !== uri),
                    )
                  }
                  disabled={!canEdit}
                  className="text-xs text-zinc-500 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Initiate login URI
          </label>
          <input
            type="url"
            value={initiateLoginUri}
            onChange={(e) => setInitiateLoginUri(e.target.value)}
            placeholder="https://example.com/login"
            disabled={!canEdit}
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-zinc-100">Reference endpoints</h2>
        <EndpointField label="Client ID" value={appState.clientId || ""} />
        <EndpointField label="OIDC discovery" value={discoveryUrl} />
        <EndpointField label="Authorize" value={authorizeUrl} />
        <EndpointField label="Token" value={tokenUrl} />
      </section>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2 border-t border-zinc-800">
        <p className="text-xs text-zinc-500 max-w-xl">
          Redirect URIs and domains update when you add or remove them. Use{" "}
          <strong className="text-zinc-400">Save</strong> for app metadata, auth
          mode, scopes, and advanced OIDC fields.
        </p>
        <button
          type="button"
          onClick={() => void saveChanges()}
          disabled={!canEdit || saving || !formData.name.trim()}
          className="px-6 py-2.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function EndpointField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-500 mb-1.5">
        {label}
      </label>
      <code className="block rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-2 text-xs text-zinc-300 break-all">
        {value || "—"}
      </code>
    </div>
  );
}
