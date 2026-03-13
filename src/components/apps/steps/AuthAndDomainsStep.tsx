"use client";

import { useState } from "react";
import type { AppFormData } from "../AppWizard";

const AVAILABLE_SCOPES = [
  { value: "openid", label: "OpenID", description: "Verify user identity", required: true },
  { value: "profile", label: "Profile", description: "Access name and profile info" },
  { value: "email", label: "Email", description: "Access email address" },
  { value: "plan", label: "Plan", description: "Access subscription plan" },
  { value: "entitlements", label: "Entitlements", description: "Access entitled features" },
];

interface Props {
  data: AppFormData;
  onChange: (updates: Partial<AppFormData>) => void;
  appId: string | null;
  domains: { id: string; domain: string }[];
  onDomainsChange: (domains: { id: string; domain: string }[]) => void;
}

export default function AuthAndDomainsStep({
  data,
  onChange,
  appId,
  domains,
  onDomainsChange,
}: Props) {
  const [newUri, setNewUri] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);

  const scopes = data.allowedScopes.split(/\s+/).filter(Boolean);

  const toggleScope = (scope: string) => {
    if (scope === "openid") return;
    const newScopes = scopes.includes(scope)
      ? scopes.filter((s) => s !== scope)
      : [...scopes, scope];
    onChange({ allowedScopes: newScopes.join(" ") });
  };

  const addRedirectUri = () => {
    const uri = newUri.trim();
    if (uri && !data.redirectUris.includes(uri)) {
      onChange({ redirectUris: [...data.redirectUris, uri] });
      setNewUri("");
    }
  };

  const removeRedirectUri = (uri: string) => {
    onChange({ redirectUris: data.redirectUris.filter((u) => u !== uri) });
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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">
          Auth & Domains
        </h2>
        <p className="text-sm text-zinc-500">
          Configure OIDC authentication and allowed domains for your application.
        </p>
      </div>

      {/* Auth: Client Type */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-zinc-300">Client Type</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange({ tokenEndpointAuthMethod: "none" })}
            className={`p-4 rounded-lg border text-left transition-colors ${
              data.tokenEndpointAuthMethod === "none"
                ? "border-emerald-500/50 bg-emerald-500/5"
                : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
            }`}
          >
            <p className="text-sm font-medium text-zinc-200">Public Client</p>
            <p className="text-xs text-zinc-500 mt-1">
              SPA, mobile, or desktop apps. Uses PKCE for security.
            </p>
          </button>
          <button
            type="button"
            onClick={() =>
              onChange({ tokenEndpointAuthMethod: "client_secret_post" })
            }
            className={`p-4 rounded-lg border text-left transition-colors ${
              data.tokenEndpointAuthMethod !== "none"
                ? "border-emerald-500/50 bg-emerald-500/5"
                : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
            }`}
          >
            <p className="text-sm font-medium text-zinc-200">
              Confidential Client
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Server-side apps. Uses client secret for auth.
            </p>
          </button>
        </div>
      </div>

      {/* Auth: Redirect URIs */}
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
        {data.redirectUris.length > 0 && (
          <div className="space-y-1">
            {data.redirectUris.map((uri) => (
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

      {/* Auth: Scopes */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-300">
          Allowed Scopes
        </label>
        <div className="space-y-2">
          {AVAILABLE_SCOPES.map((scope) => (
            <label
              key={scope.value}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                scopes.includes(scope.value)
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-zinc-800 bg-zinc-800/20"
              } ${scope.required ? "opacity-80" : "cursor-pointer hover:border-zinc-600"}`}
            >
              <input
                type="checkbox"
                checked={scopes.includes(scope.value)}
                onChange={() => toggleScope(scope.value)}
                disabled={scope.required}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/40"
              />
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  {scope.label}
                  {scope.required && (
                    <span className="ml-1.5 text-xs text-zinc-500">(required)</span>
                  )}
                </p>
                <p className="text-xs text-zinc-500">{scope.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Auth: Grant Types */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-300">
          Grant Types
        </label>
        <div className="space-y-2">
          <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-800/20 opacity-80">
            <input
              type="checkbox"
              checked={true}
              disabled
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500"
            />
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Authorization Code <span className="text-xs text-zinc-500">(required)</span>
              </p>
              <p className="text-xs text-zinc-500">Standard OIDC authorization code flow</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-800/20 cursor-pointer hover:border-zinc-600">
            <input
              type="checkbox"
              checked={data.grantTypes.includes("refresh_token")}
              onChange={() => {
                const has = data.grantTypes.includes("refresh_token");
                onChange({
                  grantTypes: has
                    ? data.grantTypes.filter((g) => g !== "refresh_token")
                    : [...data.grantTypes, "refresh_token"],
                });
              }}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/40"
            />
            <div>
              <p className="text-sm font-medium text-zinc-200">Refresh Token</p>
              <p className="text-xs text-zinc-500">Allow token renewal without re-authorization</p>
            </div>
          </label>
        </div>
      </div>

      {/* Domain Whitelisting */}
      <div className="pt-6 border-t border-zinc-800 space-y-4">
        <h3 className="text-sm font-medium text-zinc-300">
          Domain Whitelisting
        </h3>
        <p className="text-xs text-zinc-500">
          Allowed origins for CORS and request validation. Redirect URIs above should match these domains.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && (e.preventDefault(), addDomain())
            }
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
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
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
    </div>
  );
}
