"use client";

import { useState, useCallback } from "react";
import { getScopeDefinition, OIDC_SCOPES } from "@/lib/oidc/scopes";

interface Props {
  appId: string | null;
  clientId: string | null;
  grantTypes: string[];
  redirectUris: string[];
  onRedirectUrisChange: (uris: string[]) => void;
  allowedScopes: string;
  domains: { id: string; domain: string }[];
  onDomainsChange: (domains: { id: string; domain: string }[]) => void;
  hasSecret: boolean;
  /** Confidential M2M sibling (Builder + device approval token exchange); null until provisioned. */
  backendHelper: { clientId: string; hasSecret: boolean } | null;
  onSecretGenerated: () => void;
  onBackendSecretGenerated?: () => void;
  readOnly?: boolean;
}

export default function TestingStep({
  appId,
  clientId,
  grantTypes,
  redirectUris,
  onRedirectUrisChange,
  allowedScopes,
  domains,
  onDomainsChange,
  hasSecret,
  backendHelper,
  onSecretGenerated,
  onBackendSecretGenerated,
  readOnly = false,
}: Props) {
  const [newUri, setNewUri] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [backendSecret, setBackendSecret] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingBackend, setGeneratingBackend] = useState(false);
  const [secretFetchError, setSecretFetchError] = useState<string | null>(null);
  const [backendSecretFetchError, setBackendSecretFetchError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [redirectPersistError, setRedirectPersistError] = useState<string | null>(null);
  const [redirectSaving, setRedirectSaving] = useState(false);

  const hasAuthCodeFlow = grantTypes.includes("authorization_code");
  const isM2MOnly = grantTypes.includes("client_credentials") && !hasAuthCodeFlow;

  const persistRedirectUris = async (nextUris: string[]) => {
    if (readOnly) return false;
    if (!appId) return true;
    setRedirectSaving(true);
    setRedirectPersistError(null);
    try {
      const res = await fetch(`/api/v1/apps/${appId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirectUris: nextUris }),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = `Failed to save redirect URIs (${res.status})`;
        try {
          const data = text ? JSON.parse(text) : {};
          if (data.error) message = data.error;
        } catch {
          /* keep generic */
        }
        setRedirectPersistError(message);
        return false;
      }
      return true;
    } finally {
      setRedirectSaving(false);
    }
  };

  const addRedirectUri = async () => {
    if (readOnly) return;
    const uri = newUri.trim();
    if (!uri || redirectUris.includes(uri)) return;
    const previous = redirectUris;
    const next = [...redirectUris, uri];
    onRedirectUrisChange(next);
    setNewUri("");

    if (appId) {
      const ok = await persistRedirectUris(next);
      if (!ok) {
        onRedirectUrisChange(previous);
        return;
      }
    }

    // Auto-add the domain to the whitelist if not already present
    if (appId) {
      try {
        const origin = new URL(uri).origin;
        if (origin !== "null" && !domains.some((d) => d.domain === origin)) {
          const res = await fetch(`/api/v1/apps/${appId}/domains`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain: origin }),
          });
          if (res.ok) {
            const resData = await res.json();
            onDomainsChange([...domains, { id: resData.id, domain: resData.domain }]);
          }
        }
      } catch {
        // Invalid URL or wildcard URI — skip auto-whitelisting
      }
    }
  };

  const removeRedirectUri = async (uri: string) => {
    if (readOnly) return;
    const previous = redirectUris;
    const next = redirectUris.filter((u) => u !== uri);
    onRedirectUrisChange(next);
    if (appId) {
      const ok = await persistRedirectUris(next);
      if (!ok) onRedirectUrisChange(previous);
    }
  };

  const addDomain = async () => {
    if (readOnly || !appId || !newDomain.trim()) return;
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
    if (readOnly || !appId) return;
    await fetch(`/api/v1/apps/${appId}/domains?domainId=${domainId}`, {
      method: "DELETE",
    });
    onDomainsChange(domains.filter((d) => d.id !== domainId));
  };

  const discoveryUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/.well-known/openid-configuration`
      : "";

  const parseCredentialsError = async (res: Response): Promise<string> => {
    const text = await res.text();
    try {
      const data = text ? JSON.parse(text) : {};
      if (typeof data.error === "string" && data.error) return data.error;
    } catch {
      /* keep generic */
    }
    return text.trim() || res.statusText || `Failed to generate secret (${res.status})`;
  };

  const generateSecret = useCallback(async () => {
    if (readOnly || !appId) return;
    setGenerating(true);
    setSecretFetchError(null);
    try {
      const res = await fetch(`/api/v1/apps/${appId}/credentials`, {
        method: "POST",
      });
      if (!res.ok) {
        setSecretFetchError(await parseCredentialsError(res));
        return;
      }
      const data = (await res.json()) as { clientSecret?: string };
      setSecret(data.clientSecret ?? null);
      onSecretGenerated();
    } finally {
      setGenerating(false);
    }
  }, [appId, onSecretGenerated, readOnly]);

  const generateBackendSecret = useCallback(async () => {
    if (readOnly || !appId) return;
    setGeneratingBackend(true);
    setBackendSecretFetchError(null);
    try {
      const res = await fetch(`/api/v1/apps/${appId}/credentials`, {
        method: "POST",
      });
      if (!res.ok) {
        setBackendSecretFetchError(await parseCredentialsError(res));
        return;
      }
      const data = (await res.json()) as { clientSecret?: string };
      setBackendSecret(data.clientSecret ?? null);
      onBackendSecretGenerated?.();
    } finally {
      setGeneratingBackend(false);
    }
  }, [appId, onBackendSecretGenerated, readOnly]);

  const copyToClipboard = useCallback(
    async (text: string, label: string) => {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    },
    []
  );

  const selectedRedirectUri = redirectUris[0] || "";

  // Strip scopes that have been removed from the catalog so stale DB values
  // never leak into displayed snippets or test URLs.
  const validScopeValues = new Set(OIDC_SCOPES.map((s) => s.value));
  const effectiveScopes = allowedScopes
    .split(/\s+/)
    .filter((s) => s && validScopeValues.has(s))
    .join(" ");

  const selectedScopes = effectiveScopes
    .split(/\s+/)
    .filter(Boolean)
    .map((scope) => getScopeDefinition(scope)?.label || scope);
  const testUrl =
    clientId && selectedRedirectUri && typeof window !== "undefined"
      ? `${window.location.origin}/api/v1/oidc/authorize?${new URLSearchParams({
          client_id: clientId,
          redirect_uri: selectedRedirectUri,
          response_type: "code",
          scope: effectiveScopes,
          state: "test",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
        }).toString()}`
      : null;

  const m2mClientIdForSnippet = isM2MOnly ? clientId : backendHelper?.clientId ?? null;

  const scopesForM2mSnippet =
    allowedScopes
      .split(/\s+/)
      .filter((s) => s && validScopeValues.has(s) && s !== "openid")
      .join(" ") || "YOUR_CONFIGURED_SCOPES";

  const m2mCurlSnippet = m2mClientIdForSnippet
    ? `curl -X POST ${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/oidc/token \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=client_credentials" \\
  -d "client_id=${m2mClientIdForSnippet}" \\
  -d "client_secret=YOUR_CLIENT_SECRET" \\
  -d "scope=${scopesForM2mSnippet}"`
    : "";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">Credentials & Testing</h2>
        <p className="text-sm text-zinc-500">
          {isM2MOnly
            ? "Generate your client secret, then test your M2M token request."
            : "Your app is available for development as soon as it is created—no separate approval step. Configure redirect URIs and allowed domains, then test your OIDC integration."}
        </p>
      </div>

      {/* M2M Quick-start */}
      {isM2MOnly && clientId && (
        <div className="space-y-4 p-5 rounded-xl border border-zinc-800 bg-zinc-900/30">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-500" />
            <h3 className="text-sm font-semibold text-zinc-200">Client Credentials Quick-start</h3>
          </div>
          <p className="text-xs text-zinc-500">
            Once you have a secret, exchange your credentials for an access token:
          </p>
          <div className="relative">
            <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 font-mono overflow-x-auto whitespace-pre">
              {m2mCurlSnippet}
            </pre>
            <button
              onClick={() => copyToClipboard(m2mCurlSnippet, "curl")}
              className="absolute top-2 right-2 px-2 py-1 bg-zinc-700 text-zinc-200 rounded text-xs hover:bg-zinc-600 transition-colors"
            >
              {copied === "curl" ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="flex items-start gap-2 text-xs text-zinc-500">
            <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            The response will include an <code className="text-zinc-400 mx-0.5">access_token</code>. Pass it as a Bearer token on all API calls.
          </div>
          <p className="text-xs text-zinc-500">
            The <code className="text-zinc-400">scope</code> value is derived from your app&apos;s allowed scopes (Auth &amp; Scopes). Replace it in the command if your configured scopes differ.
          </p>
        </div>
      )}

      {/* Authorization Code Flow Section */}
      {hasAuthCodeFlow && (
        <div className="space-y-6 p-5 rounded-xl border border-zinc-800 bg-zinc-900/30">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <h3 className="text-sm font-semibold text-zinc-200">Authorization Code Flow</h3>
          </div>

          {/* Redirect URIs */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-300">
              Redirect URIs
            </label>
            <p className="text-xs text-zinc-500">
              URIs where PymtHouse can redirect after authorization. Wildcards (*) are supported.
              {appId
                ? " Each add or remove is saved immediately so you can test the authorization flow."
                : " Save the app on earlier steps first, then add URIs here."}
            </p>
            {redirectPersistError && (
              <p className="text-xs text-red-400">{redirectPersistError}</p>
            )}
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newUri}
                onChange={(e) => setNewUri(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRedirectUri())}
                placeholder="https://myapp.com/callback"
                disabled={readOnly}
                className="flex-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={() => void addRedirectUri()}
                disabled={readOnly || !newUri.trim() || redirectSaving}
                className="px-3 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 disabled:opacity-40 transition-colors"
              >
                {redirectSaving ? "Saving..." : "Add"}
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
                      type="button"
                      onClick={() => void removeRedirectUri(uri)}
                      disabled={readOnly || redirectSaving}
                      className="text-zinc-500 hover:text-red-400 ml-2 shrink-0 disabled:opacity-40"
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
              <h4 className="text-sm font-medium text-zinc-300">Domain Whitelisting</h4>
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
                disabled={readOnly}
                className="flex-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={addDomain}
                disabled={readOnly || adding || !newDomain.trim() || !appId}
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
                      disabled={readOnly}
                      className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-zinc-500 text-sm">
                No domains added yet. Add your application&apos;s domains above.
              </div>
            )}
          </div>

          {/* Test Auth Code Flow */}
          <div className="border-t border-zinc-800 pt-4">
            {testUrl && (
              <>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Test Authorization Code Flow
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
              </>
            )}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-zinc-800" />

      {isM2MOnly ? (
        <>
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
                  type="button"
                  onClick={() => copyToClipboard(clientId, "clientId")}
                  className="px-3 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 transition-colors"
                >
                  {copied === "clientId" ? "Copied!" : "Copy"}
                </button>
              )}
            </div>
          </div>

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
                    type="button"
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
                  type="button"
                  onClick={() => void generateSecret()}
                  disabled={readOnly || generating || !appId}
                  className="px-4 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 disabled:opacity-40 transition-colors"
                >
                  {generating ? "Generating..." : hasSecret ? "Rotate Secret" : "Generate Secret"}
                </button>
              </div>
            )}
            {secretFetchError && (
              <p className="text-xs text-red-400 mt-2">{secretFetchError}</p>
            )}
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Public / SDK client ID
            </label>
            <p className="text-xs text-zinc-500 mb-2">
              Use this in SDKs, CLIs, and the device authorization flow. It stays public (no secret).
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-emerald-400 text-sm font-mono">
                {clientId || "Create app first"}
              </code>
              {clientId && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(clientId, "clientId")}
                  className="px-3 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 transition-colors"
                >
                  {copied === "clientId" ? "Copied!" : "Copy"}
                </button>
              )}
            </div>
          </div>

          {backendHelper ? (
            <div className="mt-6 p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 space-y-3">
              <h3 className="text-sm font-semibold text-cyan-200/90">Backend helper (confidential)</h3>
              <p className="text-xs text-zinc-500">
                Use Basic auth with this client for Builder APIs and server-side device approval. Never embed in public apps.
              </p>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Client ID</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-cyan-300 text-sm font-mono">
                    {backendHelper.clientId}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(backendHelper.clientId, "m2mClientId")}
                    className="px-3 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 transition-colors"
                  >
                    {copied === "m2mClientId" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Client Secret</label>
                {backendSecret ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <code className="flex-1 px-3 py-2 bg-zinc-800/50 border border-amber-500/30 rounded-lg text-amber-400 text-sm font-mono break-all">
                        {backendSecret}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(backendSecret, "backendSecret")}
                        className="px-3 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 shrink-0"
                      >
                        {copied === "backendSecret" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <p className="text-xs text-amber-400/80">
                      Store this secret securely. It will not be shown again.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    {backendHelper.hasSecret && (
                      <p className="text-sm text-zinc-500">
                        A secret exists. Generate a new one to rotate.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void generateBackendSecret()}
                      disabled={readOnly || generatingBackend || !appId}
                      className="px-4 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 disabled:opacity-40 transition-colors"
                    >
                      {generatingBackend
                        ? "Generating..."
                        : backendHelper.hasSecret
                          ? "Rotate Secret"
                          : "Generate Secret"}
                    </button>
                  </div>
                )}
                {backendSecretFetchError && (
                  <p className="text-xs text-red-400 mt-2">{backendSecretFetchError}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 mt-4">
              Enable <strong className="text-zinc-400">Backend device helper</strong> in Auth &amp; Scopes,
              save, then return here to create a confidential <code className="font-mono text-zinc-400">m2m_</code> client
              for Builder APIs and NaaP-side device approval.
            </p>
          )}
        </>
      )}

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

      {/* Integration Checklist */}
      <div className="p-4 bg-zinc-800/30 rounded-lg border border-zinc-800">
        <p className="text-sm font-medium text-zinc-300 mb-3">
          Integration Checklist
        </p>
        <div className="space-y-2">
          {[
            ...(hasAuthCodeFlow
              ? [
                  "Redirect URI is configured and accessible",
                  "Token exchange works (authorization_code grant)",
                ]
              : []),
            "User token issuance works for a provisioned app user",
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
