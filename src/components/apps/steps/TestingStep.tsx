"use client";

import { useState, useCallback } from "react";

interface Props {
  appId: string | null;
  clientId: string | null;
  redirectUris: string[];
  hasSecret: boolean;
  onSecretGenerated: () => void;
}

export default function TestingStep({
  appId,
  clientId,
  redirectUris,
  hasSecret,
  onSecretGenerated,
}: Props) {
  const [secret, setSecret] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const discoveryUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/.well-known/openid-configuration`
      : "";

  const generateSecret = useCallback(async () => {
    if (!appId) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/v1/apps/${appId}/credentials`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setSecret(data.clientSecret);
        onSecretGenerated();
      }
    } finally {
      setGenerating(false);
    }
  }, [appId, onSecretGenerated]);

  const copyToClipboard = useCallback(
    async (text: string, label: string) => {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    },
    []
  );

  const selectedRedirectUri = redirectUris[0] || "";
  const testUrl =
    clientId && selectedRedirectUri && typeof window !== "undefined"
      ? `${window.location.origin}/api/v1/oidc/authorize?${new URLSearchParams({
          client_id: clientId,
          redirect_uri: selectedRedirectUri,
          response_type: "code",
          scope: "openid profile email",
          state: "test",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
        }).toString()}`
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">Testing</h2>
        <p className="text-sm text-zinc-500">
          Use these credentials to test your OIDC integration. Generate a client
          secret if your app is a confidential client.
        </p>
      </div>

      {/* Client ID */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
          Client ID
        </label>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-emerald-400 text-sm font-mono">
            {clientId || "Create app first"}
          </code>
          {clientId && (
            <button
              onClick={() => copyToClipboard(clientId, "clientId")}
              className="px-3 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 transition-colors"
            >
              {copied === "clientId" ? "Copied!" : "Copy"}
            </button>
          )}
        </div>
      </div>

      {/* Client Secret */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
          Client Secret
        </label>
        {secret ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <code className="flex-1 px-3 py-2 bg-zinc-800/50 border border-amber-500/30 rounded-lg text-amber-400 text-sm font-mono break-all">
                {secret}
              </code>
              <button
                onClick={() => copyToClipboard(secret, "secret")}
                className="px-3 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 transition-colors shrink-0"
              >
                {copied === "secret" ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-amber-400/80">
              Store this secret securely. It will not be shown again.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {hasSecret && (
              <p className="text-sm text-zinc-500">
                A secret has been generated. Generate a new one to rotate it.
              </p>
            )}
            <button
              onClick={generateSecret}
              disabled={generating || !appId}
              className="px-4 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 disabled:opacity-40 transition-colors"
            >
              {generating
                ? "Generating..."
                : hasSecret
                ? "Rotate Secret"
                : "Generate Secret"}
            </button>
          </div>
        )}
      </div>

      {/* Discovery URL */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
          OIDC Discovery URL
        </label>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-300 text-sm font-mono truncate">
            {discoveryUrl}
          </code>
          {discoveryUrl && (
            <button
              onClick={() => copyToClipboard(discoveryUrl, "discovery")}
              className="px-3 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 transition-colors shrink-0"
            >
              {copied === "discovery" ? "Copied!" : "Copy"}
            </button>
          )}
        </div>
      </div>

      {/* Test Flow */}
      {testUrl && (
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Test Authorization Flow
          </label>
          <button
            onClick={() => window.open(testUrl, "_blank")}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-500 transition-colors"
          >
            Open Test Flow
          </button>
          <p className="text-xs text-zinc-500 mt-1.5">
            Opens a new tab with a test authorization request. Make sure you have
            a redirect URI configured that can receive the callback.
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Using redirect URI:{" "}
            <code className="text-zinc-400">{selectedRedirectUri}</code>
          </p>
        </div>
      )}
      {!testUrl && clientId && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          Add at least one redirect URI in the Auth & Domains step before testing
          the authorization flow.
        </div>
      )}

      {/* Integration Checklist */}
      <div className="p-4 bg-zinc-800/30 rounded-lg border border-zinc-800">
        <p className="text-sm font-medium text-zinc-300 mb-3">
          Integration Checklist
        </p>
        <div className="space-y-2">
          {[
            "Redirect URI is configured and accessible",
            "Token exchange works (authorization_code grant)",
            "UserInfo endpoint returns expected claims",
            "Refresh token flow works (if enabled)",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border border-zinc-600" />
              <span className="text-sm text-zinc-400">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
