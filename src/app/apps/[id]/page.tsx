"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  const router = useRouter();
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
            billingPattern: data.billingPattern || "app_level",
            jwksUri: data.jwksUri || undefined,
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
        {appData.state.clientId && (
          <button
            onClick={() => router.push(`/apps/${id}/settings`)}
            className="px-4 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
        )}
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
