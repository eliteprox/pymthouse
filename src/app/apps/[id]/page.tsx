"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import AppSettingsScreen from "@/components/apps/AppSettingsScreen";
import type { AppFormData, AppState } from "@/components/apps/AppWizard";
import { DEFAULT_OIDC_SCOPES } from "@/lib/oidc/scopes";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-zinc-700 text-zinc-300" },
  submitted: { label: "Submitted", color: "bg-blue-500/20 text-blue-400" },
  in_review: { label: "In Review", color: "bg-amber-500/20 text-amber-400" },
  approved: { label: "Approved", color: "bg-emerald-500/20 text-emerald-400" },
  rejected: { label: "Rejected", color: "bg-red-500/20 text-red-400" },
};

export default function AppDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [appData, setAppData] = useState<{
    formData: Partial<AppFormData>;
    state: AppState;
    domains: { id: string; domain: string }[];
    postLogoutRedirectUris: string[];
    initiateLoginUri: string | null;
    canEdit: boolean;
    canSubmitForReview: boolean;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/v1/apps/${id}`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (!data) {
          setAppData(null);
          return;
        }
        setAppData({
          formData: {
            name: data.name || "",
            description: data.description || "",
            developerName: data.developerName || "",
            websiteUrl: data.websiteUrl || "",
            redirectUris: data.oidcClient?.redirectUris || [],
            allowedScopes: data.oidcClient?.allowedScopes || DEFAULT_OIDC_SCOPES,
            grantTypes: data.oidcClient?.grantTypes?.split(",").filter(Boolean) || [
              "authorization_code",
              "refresh_token",
            ],
            tokenEndpointAuthMethod:
              data.oidcClient?.tokenEndpointAuthMethod || "none",
          },
          state: {
            id: data.id,
            clientId: data.oidcClient?.clientId || null,
            status: data.status,
            hasSecret: data.oidcClient?.hasSecret || false,
          },
          domains: (data.domains || []).map(
            (d: { id: string; domain: string }) => ({
              id: d.id,
              domain: d.domain,
            }),
          ),
          postLogoutRedirectUris: data.oidcClient?.postLogoutRedirectUris || [],
          initiateLoginUri: data.oidcClient?.initiateLoginUri ?? null,
          canEdit: data.canEdit === true,
          canSubmitForReview: data.canSubmitForReview === true,
        });
      })
      .catch(() => setAppData(null))
      .finally(() => setLoading(false));
  }, [id]);

  const handleReviewSubmitted = useCallback(() => {
    setAppData((prev) =>
      prev
        ? {
            ...prev,
            state: { ...prev.state, status: "submitted" },
          }
        : null,
    );
  }, []);

  const handleRevertedToDraft = useCallback(() => {
    setAppData((prev) =>
      prev
        ? {
            ...prev,
            state: { ...prev.state, status: "draft" },
          }
        : null,
    );
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="text-zinc-500 text-center py-12 animate-pulse">
          Loading app…
        </div>
      </DashboardLayout>
    );
  }

  if (!appData) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-lg font-medium text-zinc-300">App not found</h2>
        </div>
      </DashboardLayout>
    );
  }

  const statusInfo =
    STATUS_LABELS[appData.state.status] || STATUS_LABELS.draft;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-100">
              {appData.formData.name || "App"}
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}
            >
              {statusInfo.label}
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Edit integration settings, credentials, and run OIDC tests. The create
            wizard is only used when you add a new app.
          </p>
        </div>
        {appData.state.clientId && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => router.push("/billing")}
              className="px-4 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 transition-colors"
            >
              Billing &amp; usage
            </button>
            <button
              type="button"
              onClick={() => router.push(`/apps/${id}/plans`)}
              className="px-4 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 transition-colors"
            >
              Plans
            </button>
          </div>
        )}
      </div>

      <AppSettingsScreen
        appId={id}
        initialData={appData.formData}
        initialState={appData.state}
        initialDomains={appData.domains}
        initialPostLogoutRedirectUris={appData.postLogoutRedirectUris}
        initialInitiateLoginUri={appData.initiateLoginUri}
        canEdit={appData.canEdit}
        canSubmitForReview={appData.canSubmitForReview}
        onReviewSubmitted={handleReviewSubmitted}
        onRevertedToDraft={handleRevertedToDraft}
      />
    </DashboardLayout>
  );
}
