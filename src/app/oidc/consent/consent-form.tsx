"use client";

import { useState } from "react";

interface ConsentFormProps {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
}

export default function ConsentForm({
  clientId,
  redirectUri,
  scope,
  state,
  nonce,
  codeChallenge,
  codeChallengeMethod,
}: ConsentFormProps) {
  const [loading, setLoading] = useState(false);

  const handleAuthorize = () => {
    setLoading(true);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      state,
    });
    if (nonce) params.set("nonce", nonce);
    if (codeChallenge) params.set("code_challenge", codeChallenge);
    if (codeChallengeMethod) params.set("code_challenge_method", codeChallengeMethod);

    window.location.href = `/api/v1/oidc/consent/approve?${params.toString()}`;
  };

  const handleDeny = () => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("error_description", "User denied the authorization request");
    url.searchParams.set("state", state);
    window.location.href = url.toString();
  };

  return (
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
            Authorizing...
          </>
        ) : (
          "Authorize"
        )}
      </button>
    </div>
  );
}
