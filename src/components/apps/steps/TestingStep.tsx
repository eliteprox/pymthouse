"use client";

import { useState, useCallback } from "react";
import { getScopeDefinition } from "@/lib/oidc/scopes";

interface Props {
  appId: string | null;
  clientId: string | null;
  redirectUris: string[];
  onRedirectUrisChange: (uris: string[]) => void;
  allowedScopes: string;
  domains: { id: string; domain: string }[];
  onDomainsChange: (domains: { id: string; domain: string }[]) => void;
  hasSecret: boolean;
  onSecretGenerated: () => void;
}

export default function TestingStep({
  appId,
  clientId,
  redirectUris,
  onRedirectUrisChange,
  allowedScopes,
  domains,
  onDomainsChange,
  hasSecret,
  onSecretGenerated,
}: Props) {
  const [newUri, setNewUri] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const addRedirectUri = () => {
    const uri = newUri.trim();
    if (uri && !redirectUris.includes(uri)) {
      onRedirectUrisChange([...redirectUris, uri]);
      setNewUri("");
    }
  };

  const removeRedirectUri = (uri: string) => {
    onRedirectUrisChange(redirectUris.filter((u) => u !== uri));
  };

  const addDomain = async () => {
    if (!appId || !newDomain.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/v1/apps/${appId}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain.trim() }),
      });
      if (res.ok) {
        const resData = await res.json();
        onDomainsChange([...domains, { id: resData.id, domain: resData.domain }]);
        setNewDomain("");
      }
    } finally {
      setAdding(false);
    }
  };

  const removeDomain = async (domainId: string) => {
    if (!appId) return;
    await fetch(`/api/v1/apps/${appId}/domains?domainId=${domainId}`, {
      method: "DELETE",
    });
    onDomainsChange(domains.filter((d) => d.id !== domainId));
  };

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
  const selectedScopes = allowedScopes
    .split(/\s+/)
    .filter(Boolean)
    .map((scope) => getScopeDefinition(scope)?.label || scope);
  const testUrl =
    clientId && selectedRedirectUri && typeof window !== "undefined"
      ? `${window.location.origin}/api/v1/oidc/authorize?${new URLSearchParams({
          client_id: clientId,
          redirect_uri: selectedRedirectUri,
          response_type: "code",
          scope: allowedScopes,
          state: "test",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
        }).toString()}`
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">Domains & Testing</h2>
        <p className="text-sm text-zinc-500">
          Configure redirect URIs and allowed domains, then test your OIDC integration.
        </p>
      </div>

      {/* Redirect URIs */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-300">
          Redirect URIs
        </label>
        <p className="text-xs text-zinc-500">
          URIs where PymtHouse can redirect after authorization. Wildcards (*) are supported.
        </p>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newUri}
            onChange={(e) => setNewUri(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRedirectUri())}
            placeholder="https://myapp.com/callback"
            className="flex-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          <button
            onClick={addRedirectUri}
            disabled={!newUri.trim()}
            className="px-3 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 disabled:opacity-40 transition-colors"
          >
            Add
          </button>
        </div>
        {redirectUris.length > 0 && (
          <div className="space-y-1">
            {redirectUris.map((uri) => (
              <div
                key={uri}
                className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 rounded-lg"
              >
                <code className="text-xs text-zinc-300 truncate">{uri}</code>
                <button
                  onClick={() => removeRedirectUri(uri)}
                  className="text-zinc-500 hover:text-red-400 ml-2 shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Domain Whitelisting */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-zinc-300">Domain Whitelisting</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Allowed origins for CORS and request validation. Redirect URIs above should match these domains.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDomain())}
            placeholder="example.com"
            className="flex-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          <button
            onClick={addDomain}
            disabled={adding || !newDomain.trim() || !appId}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-500 disabled:opacity-40 transition-colors"
          >
            {adding ? "Adding..." : "Add Domain"}
          </button>
        </div>
        {domains.length > 0 ? (
          <div className="space-y-2">
            {domains.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 rounded-lg border border-zinc-800"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <code className="text-sm text-zinc-200">{d.domain}</code>
                </div>
                <button
                  onClick={() => removeDomain(d.id)}
                  className="text-zinc-500 hover:text-red-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-zinc-500 text-sm">
            No domains added yet. Add your application&apos;s domains above.
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-800" />

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
              {generating ? "Generating..." : hasSecret ? "Rotate Secret" : "Generate Secret"}
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
            Requested scopes:{" "}
            <span className="text-zinc-400">{selectedScopes.join(", ")}</span>
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Using redirect URI:{" "}
            <code className="text-zinc-400">{selectedRedirectUri}</code>
          </p>
        </div>
      )}
      {!testUrl && clientId && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          Add at least one redirect URI above before testing the authorization flow.
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
