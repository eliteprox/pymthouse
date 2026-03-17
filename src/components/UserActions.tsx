"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UserActionsProps {
  userId: string;
}

export default function UserActions({ userId }: UserActionsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState("");

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
