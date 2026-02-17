"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SignerConfigFormProps {
  config: {
    name: string;
    network: string;
    ethRpcUrl: string;
    defaultCutPercent: number;
    billingMode: string;
    naapApiKey: string | null;
  };
}

export default function SignerConfigForm({ config }: SignerConfigFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: config.name,
    network: config.network,
    ethRpcUrl: config.ethRpcUrl,
    defaultCutPercent: config.defaultCutPercent,
    billingMode: config.billingMode,
    naapApiKey: config.naapApiKey || "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/v1/signer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          naapApiKey: formData.naapApiKey || null,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message || "Config saved");
        router.refresh();
      } else {
        setError(data.error || "Failed to save config");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="font-semibold text-zinc-200">Configuration</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">
            Signer Name
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value })
            }
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">
            Network
          </label>
          <select
            value={formData.network}
            onChange={(e) =>
              setFormData({ ...formData, network: e.target.value })
            }
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="arbitrum-one-mainnet">Arbitrum One (Mainnet)</option>
            <option value="mainnet">Ethereum Mainnet</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-zinc-500 mb-1.5">
            Ethereum RPC URL
          </label>
          <input
            type="url"
            required
            value={formData.ethRpcUrl}
            onChange={(e) =>
              setFormData({ ...formData, ethRpcUrl: e.target.value })
            }
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 font-mono text-xs"
            placeholder="https://arb1.arbitrum.io/rpc"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">
            Platform Cut (%)
          </label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={formData.defaultCutPercent}
            onChange={(e) =>
              setFormData({
                ...formData,
                defaultCutPercent: parseFloat(e.target.value),
              })
            }
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">
            Billing Mode
          </label>
          <select
            value={formData.billingMode}
            onChange={(e) =>
              setFormData({ ...formData, billingMode: e.target.value })
            }
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="delegated">Delegated</option>
            <option value="prepay">Prepay</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-zinc-500 mb-1.5">
            NaaP API Key (optional)
          </label>
          <input
            type="text"
            value={formData.naapApiKey}
            onChange={(e) =>
              setFormData({ ...formData, naapApiKey: e.target.value })
            }
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 font-mono text-xs"
            placeholder="Leave empty to disable metrics reporting"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Config"}
        </button>

        {message && (
          <span className="text-sm text-amber-400">{message}</span>
        )}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </form>
  );
}
