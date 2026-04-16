"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  /** Only the app owner may submit for review (matches submit API). */
  canSubmitForReview?: boolean;
  /** Called after a successful submit so the parent can refresh status UI. */
  onReviewSubmitted?: () => void;
  /** Called after reverting from submitted to draft (header badge, etc.). */
  onRevertedToDraft?: () => void;
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
  canSubmitForReview = false,
  onReviewSubmitted,
  onRevertedToDraft,
}: Props) {
  const router = useRouter();
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
  const [submittingForReview, setSubmittingForReview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reverting, setReverting] = useState(false);

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

  const submitForReview = useCallback(async () => {
    if (!canSubmitForReview) return;
    setSubmittingForReview(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/apps/${appId}/submit`, {
        method: "POST",
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Submit failed (${res.status})`;
        try {
          const data = text ? JSON.parse(text) : {};
          if (data.message) msg = data.message;
          else if (data.error) msg = data.error;
        } catch {
          /* keep generic */
        }
        throw new Error(msg);
      }
      setAppState((s) => ({ ...s, status: "submitted" }));
      onReviewSubmitted?.();
      setMessage("App submitted for review. An administrator will approve it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmittingForReview(false);
    }
  }, [appId, canSubmitForReview, onReviewSubmitted]);

  const deleteDraftApp = useCallback(async () => {
    if (!canSubmitForReview || appState.status !== "draft") return;
    if (
      !confirm(
        `Delete "${formData.name.trim() || "this app"}"? This permanently removes the draft app and cannot be undone.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/apps/${appId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : `Delete failed (${res.status})`,
        );
      }
      router.push("/apps");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }, [appId, appState.status, canSubmitForReview, formData.name, router]);

  const revertToDraft = useCallback(async () => {
    if (!canSubmitForReview || appState.status !== "submitted") return;
    if (
      !confirm(
        "Revert this app to draft? It will leave the review queue until you submit again.",
      )
    ) {
      return;
    }
    setReverting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/apps/${appId}/revert-draft`, {
        method: "POST",
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Revert failed (${res.status})`;
        try {
          const data = text ? JSON.parse(text) : {};
          if (data.message) msg = data.message;
          else if (data.error) msg = data.error;
        } catch {
          /* keep generic */
        }
        throw new Error(msg);
      }
      setAppState((s) => ({ ...s, status: "draft" }));
      onRevertedToDraft?.();
      setMessage("App is back in draft. You can edit and submit again when ready.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revert failed");
    } finally {
      setReverting(false);
    }
  }, [appId, appState.status, canSubmitForReview, onRevertedToDraft]);

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
      {canEdit &&
        canSubmitForReview &&
        (appState.status === "draft" || appState.status === "rejected") && (
          <div className="p-4 rounded-xl border border-blue-500/25 bg-blue-500/5 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Submit for review
              </h2>
              <p className="text-sm text-zinc-400 mt-1">
                While this app is in draft, only you and platform staff can use
                it. Submit it when you are ready so an administrator can approve
                it for production.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void submitForReview()}
              disabled={submittingForReview}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submittingForReview ? "Submitting…" : "Submit for review"}
            </button>
          </div>
        )}
      {canEdit &&
        canSubmitForReview &&
        appState.status === "submitted" && (
          <div className="p-4 rounded-xl border border-amber-500/25 bg-amber-500/5 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Revert to draft
              </h2>
              <p className="text-sm text-zinc-400 mt-1">
                This app is waiting for administrator review. You can withdraw it
                from the queue to make changes, then submit again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void revertToDraft()}
              disabled={reverting}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {reverting ? "Reverting…" : "Revert to draft"}
            </button>
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

      {canSubmitForReview && appState.status === "draft" && (
        <section className="rounded-xl border border-red-500/25 bg-red-500/5 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-100">Delete draft app</h2>
          <p className="text-sm text-zinc-400">
            Permanently remove this app, its OIDC client, and related data. This
            cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => void deleteDraftApp()}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-fit"
          >
            {deleting ? "Deleting…" : "Delete app"}
          </button>
        </section>
      )}

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
