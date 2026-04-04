"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import AppSettingsPanel from "@/components/apps/AppSettingsPanel";

export default function AppSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [appName, setAppName] = useState("");
  const [settingsData, setSettingsData] = useState<{
    appId: string;
    clientId: string;
    redirectUris: string[];
    postLogoutRedirectUris: string[];
    initiateLoginUri: string | null;
    tokenEndpointAuthMethod: string;
    hasSecret: boolean;
    domains: { id: string; domain: string }[];
    brandingMode?: string;
    brandingLogoUrl?: string;
    brandingPrimaryColor?: string;
    brandingSupportEmail?: string;
    customLoginDomain?: string;
    customDomainVerificationToken?: string;
    customDomainVerifiedAt?: string;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/v1/apps/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.oidcClient) return;
        setAppName(data.name || "App");
        const wl = data.whiteLabelConfig || {};
        setSettingsData({
          appId: data.id,
          clientId: data.oidcClient.clientId,
          redirectUris: data.oidcClient.redirectUris || [],
          postLogoutRedirectUris: data.oidcClient.postLogoutRedirectUris || [],
          initiateLoginUri: data.oidcClient.initiateLoginUri || null,
          tokenEndpointAuthMethod: data.oidcClient.tokenEndpointAuthMethod || "none",
          hasSecret: data.oidcClient.hasSecret || false,
          domains: (data.domains || []).map(
            (d: { id: string; domain: string }) => ({
              id: d.id,
              domain: d.domain,
            })
          ),
          brandingMode: wl.brandingMode || "blackLabel",
          brandingLogoUrl: wl.brandingLogoUrl || undefined,
          brandingPrimaryColor: wl.brandingPrimaryColor || undefined,
          brandingSupportEmail: wl.brandingSupportEmail || undefined,
          customLoginDomain: wl.customLoginDomain || undefined,
          customDomainVerificationToken: wl.customDomainVerificationToken || undefined,
          customDomainVerifiedAt: wl.customDomainVerifiedAt || undefined,
          billingPattern: data.billingPattern || "app_level",
          jwksUri: data.jwksUri || undefined,
        });
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="text-zinc-500 text-center py-12 animate-pulse">
          Loading settings...
        </div>
      </DashboardLayout>
    );
  }

  if (!settingsData) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-lg font-medium text-zinc-300">
            No OIDC client configured
          </h2>
          <p className="text-sm text-zinc-500 mt-2">
            Submit your app first to generate OIDC credentials.
          </p>
        </div>
      </DashboardLayout>
    );
  }

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
        <h1 className="text-2xl font-bold text-zinc-100">Application Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Configure OIDC redirect URIs, endpoints, and credentials for {appName}.
        </p>
      </div>

      <AppSettingsPanel data={settingsData} />
    </DashboardLayout>
  );
}
