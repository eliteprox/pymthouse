"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import SignerConfigForm from "@/components/SignerConfigForm";

export default function AppSignerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [appName, setAppName] = useState("App");
  const [config, setConfig] = useState<{
    name: string;
    signerUrl: string | null;
    signerApiKey: string | null;
    network: string;
    ethRpcUrl: string;
    ethAcctAddr: string | null;
    signerPort: number;
    defaultCutPercent: number;
    billingMode: string;
    naapApiKey: string | null;
    remoteDiscovery: number;
    orchWebhookUrl: string | null;
    liveAICapReportInterval: string | null;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/v1/apps/${id}`).then((response) => response.json()),
      fetch(`/api/v1/apps/${id}/signer`).then((response) => response.json()),
    ])
      .then(([app, signer]) => {
        setAppName(app.name || "App");
        setConfig(signer.signer);
      })
      .finally(() => setLoading(false));
  }, [id]);

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
        <h1 className="text-2xl font-bold text-zinc-100">Provider Signer</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Configure the remote signer used for discovery and payment signatures.
        </p>
      </div>

      {loading || !config ? (
        <div className="text-zinc-500 text-center py-12 animate-pulse">Loading signer config...</div>
      ) : (
        <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30">
          <SignerConfigForm appId={id} config={config} />
        </div>
      )}
    </DashboardLayout>
  );
}
