"use client";

import { useState } from "react";

interface ConsentFormProps {
  uid: string;
}

export default function ConsentForm({ uid }: ConsentFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitConsent(action: "approve" | "deny") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/oidc/interaction/${uid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error_description || data.error || "Failed");
        setLoading(false);
        return;
      }
      if (data.redirectTo) {
        window.location.href = data.redirectTo;
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const handleAuthorize = () => submitConsent("approve");
  const handleDeny = () => submitConsent("deny");

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          {error}
        </div>
      )}
      <div className="flex gap-3">
        <button
        type="button"
        onClick={handleDeny}
        disabled={loading}
        className="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
      >
        Deny
      </button>
      <button
        type="button"
        onClick={handleAuthorize}
        disabled={loading}
        className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Continuing...
          </>
        ) : (
          "Authorize and Continue"
        )}
      </button>
      </div>
    </div>
  );
}
