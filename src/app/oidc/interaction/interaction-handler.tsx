"use client";

import { useEffect, useState } from "react";

interface InteractionHandlerProps {
  uid: string;
}

export default function InteractionHandler({ uid }: InteractionHandlerProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function completeLoginInteraction() {
      try {
        const res = await fetch(`/api/v1/oidc/interaction/${uid}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error_description || data.error || "Failed to complete sign-in");
        }

        if (!data.redirectTo) {
          throw new Error("OIDC provider did not return a redirect target");
        }

        window.location.href = data.redirectTo;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to complete sign-in");
        }
      }
    }

    completeLoginInteraction();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full border border-zinc-800 bg-zinc-900/40 rounded-xl p-6 text-center">
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-red-300 mb-2">Sign-In Could Not Continue</h1>
            <p className="text-sm text-zinc-400">{error}</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-zinc-100 mb-2">Completing Sign-In</h1>
            <p className="text-sm text-zinc-400">
              Finalizing your authorization request. This page will redirect automatically.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
