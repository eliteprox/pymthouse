"use client";

import { useState, useCallback, useEffect } from "react";

interface AppSettingsData {
  appId: string;
  clientId: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  initiateLoginUri: string | null;
  tokenEndpointAuthMethod: string;
  hasSecret: boolean;
  domains: { id: string; domain: string }[];
}

interface Props {
  data: AppSettingsData;
}

export default function AppSettingsPanel({ data }: Props) {
  const [redirectUris, setRedirectUris] = useState<string[]>(data.redirectUris);
  const [postLogoutUris, setPostLogoutUris] = useState<string[]>(data.postLogoutRedirectUris);
  const [initiateLoginUri, setInitiateLoginUri] = useState(data.initiateLoginUri || "");
  const [tokenEndpointAuthMethod, setTokenEndpointAuthMethod] = useState(data.tokenEndpointAuthMethod);
  const [domains, setDomains] = useState(data.domains);
  const [hasSecret, setHasSecret] = useState(data.hasSecret);

  const [newUri, setNewUri] = useState("");
  const [newPostLogoutUri, setNewPostLogoutUri] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const discoveryUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/.well-known/openid-configuration`
      : "";

  // Track unsaved changes
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const changed =
      JSON.stringify(redirectUris) !== JSON.stringify(data.redirectUris) ||
      JSON.stringify(postLogoutUris) !== JSON.stringify(data.postLogoutRedirectUris) ||
      (initiateLoginUri || "") !== (data.initiateLoginUri || "") ||
      tokenEndpointAuthMethod !== data.tokenEndpointAuthMethod;
    setDirty(changed);
  }, [redirectUris, postLogoutUris, initiateLoginUri, tokenEndpointAuthMethod, data]);

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const addRedirectUri = () => {
    const uri = newUri.trim();
    if (!uri || redirectUris.includes(uri)) return;
    setRedirectUris([...redirectUris, uri]);
    setNewUri("");
  };

  const addPostLogoutUri = () => {
    const uri = newPostLogoutUri.trim();
    if (!uri || postLogoutUris.includes(uri)) return;
    setPostLogoutUris([...postLogoutUris, uri]);
    setNewPostLogoutUri("");
  };

  const addDomain = async () => {
    if (!newDomain.trim()) return;
    setAddingDomain(true);
    try {
      const res = await fetch(`/api/v1/apps/${data.appId}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain.trim() }),
      });
      if (res.ok) {
        const resData = await res.json();
        setDomains([...domains, { id: resData.id, domain: resData.domain }]);
        setNewDomain("");
      }
    } finally {
      setAddingDomain(false);
    }
  };

  const removeDomain = async (domainId: string) => {
    await fetch(`/api/v1/apps/${data.appId}/domains?domainId=${domainId}`, {
      method: "DELETE",
    });
    setDomains(domains.filter((d) => d.id !== domainId));
  };

  const generateSecret = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/v1/apps/${data.appId}/credentials`, {
        method: "POST",
      });
      if (res.ok) {
        const resData = await res.json();
        setSecret(resData.clientSecret);
        setHasSecret(true);
      }
    } finally {
      setGenerating(false);
    }
  }, [data.appId]);

  const saveSettings = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/v1/apps/${data.appId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirectUris,
          postLogoutRedirectUris: postLogoutUris,
          initiateLoginUri: initiateLoginUri || null,
          tokenEndpointAuthMethod,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setDirty(false);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Section 1: Redirect URIs & Domains */}
      <div className="space-y-6 p-5 rounded-xl border border-zinc-800 bg-zinc-900/30">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Redirect URIs & Domains</h3>
          <p className="text-xs text-zinc-500 mt-1">
            URIs where users are sent after authorization. Domain whitelist is auto-populated from these URIs.
          </p>
        </div>

        {/* Redirect URIs */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-300">
            Redirect URIs
          </label>
          <div className="flex gap-2">
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
                    onClick={() => setRedirectUris(redirectUris.filter((u) => u !== uri))}
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

        {/* Post-Logout Redirect URIs */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-300">
            Post-Logout Redirect URIs
          </label>
          <p className="text-xs text-zinc-500">
            URIs where users are sent after signing out. Enables RP-initiated logout.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPostLogoutUri}
              onChange={(e) => setNewPostLogoutUri(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPostLogoutUri())}
              placeholder="https://myapp.com/logged-out"
              className="flex-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <button
              onClick={addPostLogoutUri}
              disabled={!newPostLogoutUri.trim()}
              className="px-3 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </div>
          {postLogoutUris.length > 0 && (
            <div className="space-y-1">
              {postLogoutUris.map((uri) => (
                <div
                  key={uri}
                  className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 rounded-lg"
                >
                  <code className="text-xs text-zinc-300 truncate">{uri}</code>
                  <button
                    onClick={() => setPostLogoutUris(postLogoutUris.filter((u) => u !== uri))}
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

        {/* Domain Whitelist */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-300">
            Domain Whitelist
          </label>
          <p className="text-xs text-zinc-500">
            Allowed origins for CORS. Automatically populated when you save redirect URIs. Add additional domains manually if needed.
          </p>
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
              disabled={addingDomain || !newDomain.trim()}
              className="px-3 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 disabled:opacity-40 transition-colors"
            >
              {addingDomain ? "Adding..." : "Add"}
            </button>
          </div>
          {domains.length > 0 ? (
            <div className="space-y-1">
              {domains.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <code className="text-xs text-zinc-300">{d.domain}</code>
                  </div>
                  <button
                    onClick={() => removeDomain(d.id)}
                    className="text-zinc-500 hover:text-red-400 ml-2 shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 italic">No domains yet. They&apos;ll be auto-added when you save.</p>
          )}
        </div>
      </div>

      {/* Section 2: OAuth Endpoints */}
      <div className="space-y-6 p-5 rounded-xl border border-zinc-800 bg-zinc-900/30">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">OAuth Endpoints</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Advanced OIDC endpoint configuration.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-300">
            Initiate Login URI
          </label>
          <p className="text-xs text-zinc-500">
            URI to redirect users when they want to log in to your app from a third-party context.
          </p>
          <input
            type="text"
            value={initiateLoginUri}
            onChange={(e) => setInitiateLoginUri(e.target.value)}
            placeholder="https://myapp.com/login"
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-300">
            Token Endpoint Auth Method
          </label>
          <select
            value={tokenEndpointAuthMethod}
            onChange={(e) => setTokenEndpointAuthMethod(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="none">None (Public client, PKCE required)</option>
            <option value="client_secret_post">Client Secret (POST body)</option>
            <option value="client_secret_basic">Client Secret (Basic auth header)</option>
          </select>
        </div>
      </div>

      {/* Section 3: Credentials */}
      <div className="space-y-6 p-5 rounded-xl border border-zinc-800 bg-zinc-900/30">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Credentials</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Your client credentials for OIDC integration.
          </p>
        </div>

        {/* Client ID */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-zinc-300">Client ID</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-emerald-400 text-sm font-mono">
              {data.clientId}
            </code>
            <button
              onClick={() => copyToClipboard(data.clientId, "clientId")}
              className="px-3 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 transition-colors"
            >
              {copied === "clientId" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Client Secret */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-zinc-300">Client Secret</label>
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
                disabled={generating}
                className="px-4 py-2 bg-zinc-700 text-zinc-200 rounded-lg text-sm hover:bg-zinc-600 disabled:opacity-40 transition-colors"
              >
                {generating ? "Generating..." : hasSecret ? "Rotate Secret" : "Generate Secret"}
              </button>
            </div>
          )}
        </div>

        {/* Discovery URL */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-zinc-300">OIDC Discovery URL</label>
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
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={saveSettings}
          disabled={saving || !dirty}
          className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 disabled:opacity-40 transition-colors"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        {saved && (
          <span className="text-sm text-emerald-400">Settings saved successfully.</span>
        )}
        {dirty && !saved && (
          <span className="text-sm text-zinc-500">You have unsaved changes.</span>
        )}
      </div>
    </div>
  );
}
