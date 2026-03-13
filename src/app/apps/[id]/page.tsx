"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import AppWizard, {
  type AppFormData,
  type AppState,
} from "@/components/apps/AppWizard";
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
  const [loading, setLoading] = useState(true);
  const [appData, setAppData] = useState<{
    formData: Partial<AppFormData>;
    state: AppState;
    domains: { id: string; domain: string }[];
    reviewerNotes?: string;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/v1/apps/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setAppData({
          formData: {
            name: data.name || "",
            subtitle: data.subtitle || "",
            description: data.description || "",
            category: data.category || "",
            developerName: data.developerName || "",
            websiteUrl: data.websiteUrl || "",
            supportUrl: data.supportUrl || "",
            privacyPolicyUrl: data.privacyPolicyUrl || "",
            tosUrl: data.tosUrl || "",
            demoRecordingUrl: data.demoRecordingUrl || "",
            linksToPurchases: !!data.linksToPurchases,
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
            pendingRevisionSubmittedAt: data.pendingRevisionSubmittedAt ?? null,
          },
          domains: (data.domains || []).map(
            (d: { id: string; domain: string }) => ({
              id: d.id,
              domain: d.domain,
            })
          ),
          reviewerNotes: data.reviewerNotes,
        });
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="text-zinc-500 text-center py-12 animate-pulse">
          Loading app...
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

  const statusInfo = STATUS_LABELS[appData.state.status] || STATUS_LABELS.draft;

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-100">
              {appData.formData.name}
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}
            >
              {statusInfo.label}
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Manage your application settings and OIDC configuration
          </p>
        </div>
      </div>

      {appData.reviewerNotes && appData.state.status === "rejected" && (
        <div className="mb-6 p-4 rounded-lg border border-red-500/20 bg-red-500/5">
          <p className="text-sm font-medium text-red-300 mb-1">
            Reviewer Notes
          </p>
          <p className="text-sm text-zinc-400">{appData.reviewerNotes}</p>
        </div>
      )}

      <AppWizard
        initialData={appData.formData}
        initialState={appData.state}
        initialDomains={appData.domains}
      />
    </DashboardLayout>
  );
}
