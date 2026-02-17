"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UserActionsProps {
  userId: string;
}

export default function UserActions({ userId }: UserActionsProps) {
  const router = useRouter();
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [tokenLabel, setTokenLabel] = useState("");
  const [creditAmount, setCreditAmount] = useState("");

  async function issueToken() {
    setLoading("token");
    setError(null);
    setNewToken(null);

    try {
      const res = await fetch("/api/v1/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endUserId: userId,
          label: tokenLabel || undefined,
          scopes: "gateway",
          expiresInDays: 90,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setNewToken(data.token);
        setTokenLabel("");
        router.refresh();
      } else {
        setError(data.error || "Failed to issue token");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(null);
    }
  }

  async function addCredits() {
    if (!creditAmount) return;
    setLoading("credits");
    setError(null);

    try {
      const res = await fetch("/api/v1/end-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: userId,
          action: "add_credits",
          amountWei: creditAmount,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setCreditAmount("");
        router.refresh();
      } else {
        setError(data.error || "Failed to add credits");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <h3 className="font-semibold text-zinc-200">Actions</h3>

      {/* Issue gateway token */}
      <div>
        <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">
          Issue Gateway Token
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={tokenLabel}
            onChange={(e) => setTokenLabel(e.target.value)}
            placeholder="Token label (optional)"
            className="flex-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50"
          />
          <button
            onClick={issueToken}
            disabled={!!loading}
            className="px-4 py-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm font-medium hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
          >
            {loading === "token" ? "Issuing..." : "Issue Token"}
          </button>
        </div>
        {newToken && (
          <div className="mt-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
            <p className="text-xs text-emerald-400 mb-1 font-medium">
              Token created -- copy it now, it won't be shown again:
            </p>
            <code className="text-xs text-emerald-300 break-all select-all">
              {newToken}
            </code>
          </div>
        )}
      </div>

      {/* Add credits */}
      <div>
        <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">
          Add Credits (wei)
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={creditAmount}
            onChange={(e) => setCreditAmount(e.target.value)}
            placeholder="Amount in wei"
            className="flex-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 font-mono"
          />
          <button
            onClick={addCredits}
            disabled={!!loading || !creditAmount}
            className="px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg text-sm font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50"
          >
            {loading === "credits" ? "Adding..." : "Add Credits"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
