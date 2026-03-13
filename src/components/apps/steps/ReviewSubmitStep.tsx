"use client";

import { useState, useCallback } from "react";
import type { AppFormData, AppState } from "../AppWizard";

interface Props {
  data: AppFormData;
  appState: AppState;
  onChange: (updates: Partial<AppFormData>) => void;
  onStatusChange: (status: string) => void;
  onAppStateChange?: (updates: Partial<AppState>) => void;
}

export default function ReviewSubmitStep({
  data,
  appState,
  onChange,
  onStatusChange,
  onAppStateChange,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const saveFields = useCallback(async () => {
    if (!appState.id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/apps/${appState.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Save failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [appState.id, data]);

  const handleResubmit = useCallback(async () => {
    if (!appState.id) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/v1/apps/${appState.id}/resubmit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowedScopes: data.allowedScopes,
          grantTypes: data.grantTypes,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        throw new Error(d.error || "Resubmit failed");
      }
      onAppStateChange?.({ pendingRevisionSubmittedAt: new Date().toISOString() });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }, [appState.id, data.allowedScopes, data.grantTypes, onAppStateChange]);

  const handleSubmit = useCallback(async () => {
    if (!appState.id) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await saveFields();

      const res = await fetch(`/api/v1/apps/${appState.id}/submit`, {
        method: "POST",
      });
      const d = await res.json();
      if (!res.ok) {
        const missingMsg = d.missing
          ? ` Missing: ${d.missing.join(", ")}`
          : "";
        throw new Error((d.error || "Submit failed") + missingMsg);
      }
      onStatusChange("submitted");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }, [appState.id, saveFields, onStatusChange]);

  return appState.status === "submitted" ? (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-zinc-100 mb-2">
        App Submitted for Review
      </h2>
      <p className="text-sm text-zinc-400 max-w-md mx-auto">
        Your app has been submitted for review. You will be notified when
        the review is complete. In the meantime, you can continue testing
        your OIDC integration.
      </p>
      <p className="text-sm text-amber-400/90 mt-4">
        Go to Auth & Domains to edit scopes and grant types while your app is in review.
      </p>
    </div>
  ) : (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">
          Review & Submit
        </h2>
        <p className="text-sm text-zinc-500">
          Complete the remaining details and submit your app for review.
        </p>
      </div>

      {appState.status === "approved" && (
        <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
          {appState.pendingRevisionSubmittedAt ? (
            <>
              <p className="text-sm font-medium text-amber-400 mb-1">
                Revision in review
              </p>
              <p className="text-sm text-zinc-400">
                Your scope/grant type changes are under review. Your app remains in production.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-amber-400 mb-1">
                Scope & grant type changes require review
              </p>
              <p className="text-sm text-zinc-400 mb-3">
                Edit scopes and grant types in Auth & Domains. To save those changes,
                submit a new version for review. Your app stays in production until the new version is approved.
              </p>
              <button
                onClick={handleResubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 transition-colors"
              >
                {submitting ? "Submitting..." : "Submit new version"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Policy URLs */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Customer Support URL or Email
          </label>
          <input
            type="text"
            value={data.supportUrl}
            onChange={(e) => onChange({ supportUrl: e.target.value })}
            placeholder="https://example.com/support"
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Privacy Policy URL <span className="text-red-400">*</span>
          </label>
          <input
            type="url"
            value={data.privacyPolicyUrl}
            onChange={(e) => onChange({ privacyPolicyUrl: e.target.value })}
            placeholder="https://example.com/privacy"
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Terms of Service URL
          </label>
          <input
            type="url"
            value={data.tosUrl}
            onChange={(e) => onChange({ tosUrl: e.target.value })}
            placeholder="https://example.com/terms"
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Demo Recording URL
          </label>
          <p className="text-xs text-zinc-500 mb-1.5">
            Record a video demonstrating your app&apos;s functionality. Include all
            main use cases and tools across all platforms.
          </p>
          <input
            type="url"
            value={data.demoRecordingUrl}
            onChange={(e) => onChange({ demoRecordingUrl: e.target.value })}
            placeholder="https://example.com/demo.mp4"
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>
      </div>

      {/* Commerce */}
      <div className="p-4 bg-zinc-800/30 rounded-lg border border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-300 mb-2">
          App Commerce & Purchasing
        </h3>
        <p className="text-xs text-zinc-500 mb-3">
          Tell us if your app involves sales and verify that no digital goods
          (e.g., subscriptions, in-app purchases, digital content) are offered.
        </p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.linksToPurchases}
            onChange={(e) =>
              onChange({ linksToPurchases: e.target.checked })
            }
            className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/40"
          />
          <span className="text-sm text-zinc-300">
            My app links or directs users out of PymtHouse to make purchases
          </span>
        </label>
      </div>

      {/* Summary */}
      <div className="p-4 bg-zinc-800/30 rounded-lg border border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Summary</h3>
        <dl className="space-y-2 text-sm">
          {[
            { label: "App Name", value: data.name },
            { label: "Category", value: data.category },
            { label: "Developer", value: data.developerName },
            { label: "Client ID", value: appState.clientId },
            {
              label: "Auth Method",
              value:
                data.tokenEndpointAuthMethod === "none"
                  ? "Public (PKCE)"
                  : "Confidential",
            },
            {
              label: "Scopes",
              value: data.allowedScopes,
            },
            {
              label: "Redirect URIs",
              value: `${data.redirectUris.length} configured`,
            },
          ].map((item) => (
            <div key={item.label} className="flex justify-between">
              <dt className="text-zinc-500">{item.label}</dt>
              <dd className="text-zinc-300">{item.value || "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

      {(error || submitError) && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          {submitError || error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          onClick={saveFields}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          {saving ? "Saving..." : "Save Draft"}
        </button>
        {appState.status !== "approved" && (
          <button
            onClick={handleSubmit}
            disabled={submitting || !data.name || !data.privacyPolicyUrl || !data.description}
            className="px-6 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Submitting..." : "Submit for Review"}
          </button>
        )}
      </div>
    </div>
  );
}
