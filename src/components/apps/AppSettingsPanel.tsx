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
  brandingMode?: string;
  brandingLogoUrl?: string;
  brandingPrimaryColor?: string;
  brandingSupportEmail?: string;
  customLoginDomain?: string;
  customDomainVerificationToken?: string;
  customDomainVerifiedAt?: string;
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

  // Branding state
  const [brandingMode, setBrandingMode] = useState<string>(data.brandingMode || "blackLabel");
  const [brandingLogoUrl, setBrandingLogoUrl] = useState(data.brandingLogoUrl || "");
  const [brandingPrimaryColor, setBrandingPrimaryColor] = useState(data.brandingPrimaryColor || "");
  const [brandingSupportEmail, setBrandingSupportEmail] = useState(data.brandingSupportEmail || "");
  const isWhiteLabel = brandingMode === "whiteLabel";

  // Custom domain state
  const [customDomain, setCustomDomain] = useState(data.customLoginDomain || "");
  const [domainInputValue, setDomainInputValue] = useState("");
  const [domainSaving, setDomainSaving] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(data.customDomainVerificationToken || null);
  const [domainStatus, setDomainStatus] = useState<"idle" | "pending_verification" | "verified">(
    data.customDomainVerifiedAt ? "verified" : data.customDomainVerificationToken ? "pending_verification" : "idle"
  );
  const [verifying, setVerifying] = useState(false);

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
      tokenEndpointAuthMethod !== data.tokenEndpointAuthMethod ||
      brandingMode !== (data.brandingMode || "blackLabel") ||
      brandingLogoUrl !== (data.brandingLogoUrl || "") ||
      brandingPrimaryColor !== (data.brandingPrimaryColor || "") ||
      brandingSupportEmail !== (data.brandingSupportEmail || "");
    setDirty(changed);
  }, [redirectUris, postLogoutUris, initiateLoginUri, tokenEndpointAuthMethod, brandingMode, brandingLogoUrl, brandingPrimaryColor, brandingSupportEmail, data]);

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

  const setupCustomDomain = async () => {
    if (!domainInputValue.trim()) return;
    setDomainSaving(true);
    setDomainError(null);
    try {
      const res = await fetch(`/api/v1/apps/${data.appId}/custom-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup", domain: domainInputValue.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to configure domain");
      setCustomDomain(domainInputValue.trim());
      setVerificationToken(body.verificationToken);
      setDomainStatus("pending_verification");
      setDomainInputValue("");
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDomainSaving(false);
    }
  };

  const verifyCustomDomain = async () => {
    setVerifying(true);
    setDomainError(null);
    try {
      const res = await fetch(`/api/v1/apps/${data.appId}/custom-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Verification failed");
      if (body.verified) {
        setDomainStatus("verified");
      } else {
        setDomainError("DNS record not found yet. It may take up to 48 hours to propagate.");
      }
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setVerifying(false);
    }
  };

  const removeCustomDomain = async () => {
    setDomainSaving(true);
    setDomainError(null);
    try {
      await fetch(`/api/v1/apps/${data.appId}/custom-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove" }),
      });
      setCustomDomain("");
      setVerificationToken(null);
      setDomainStatus("idle");
    } finally {
      setDomainSaving(false);
    }
  };

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
      if (!res.ok) throw new Error("Failed to save OIDC settings");

      // Save branding separately via the app PUT endpoint
      await fetch(`/api/v1/apps/${data.appId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandingMode,
          brandingLogoUrl: brandingLogoUrl || null,
          brandingPrimaryColor: brandingPrimaryColor || null,
          brandingSupportEmail: brandingSupportEmail || null,
        }),
      });

      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 3000);
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

      {/* Section 4: Identity & Branding */}
      <div className="space-y-6 p-5 rounded-xl border border-zinc-800 bg-zinc-900/30">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Identity & Branding</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Control the visual identity of your app&apos;s PymtHouse-hosted login page.
          </p>
        </div>

        {/* Branding mode toggle */}
        <div className="grid grid-cols-2 gap-3">
          {(["blackLabel", "whiteLabel"] as const).map((mode) => {
            const isSelected = brandingMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setBrandingMode(mode)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                    : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-zinc-200">
                    {mode === "blackLabel" ? "PymtHouse Branded" : "White Label"}
                  </p>
                  {isSelected && (
                    <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
                <p className="text-xs text-zinc-500">
                  {mode === "blackLabel"
                    ? "Standard PymtHouse login. No setup required."
                    : "Your logo, colors, and optional custom domain."}
                </p>
              </button>
            );
          })}
        </div>

        {/* White label options */}
        {isWhiteLabel && (
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-300">Logo URL</label>
              <input
                type="url"
                value={brandingLogoUrl}
                onChange={(e) => setBrandingLogoUrl(e.target.value)}
                placeholder="https://myapp.com/logo.svg"
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              {brandingLogoUrl && (
                <div className="mt-2 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={brandingLogoUrl} alt="Logo preview" className="h-8 max-w-[120px] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <span className="text-xs text-zinc-500">Preview</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-300">Primary Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={brandingPrimaryColor || "#10b981"}
                  onChange={(e) => setBrandingPrimaryColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-zinc-700 bg-zinc-800 cursor-pointer p-1"
                />
                <input
                  type="text"
                  value={brandingPrimaryColor}
                  onChange={(e) => setBrandingPrimaryColor(e.target.value)}
                  placeholder="#10b981"
                  className="w-32 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
                {brandingPrimaryColor && (
                  <div
                    className="flex-1 h-9 rounded-lg border border-zinc-700 flex items-center justify-center text-xs font-medium"
                    style={{ backgroundColor: brandingPrimaryColor, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                  >
                    Button preview
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-300">Support Email</label>
              <input
                type="email"
                value={brandingSupportEmail}
                onChange={(e) => setBrandingSupportEmail(e.target.value)}
                placeholder="support@myapp.com"
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          </div>
        )}
      </div>

      {/* Section 5: Custom Login Domain */}
      {isWhiteLabel && (
        <div className="space-y-4 p-5 rounded-xl border border-zinc-800 bg-zinc-900/30">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Custom Login Domain</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Host the login page at your own subdomain (e.g., <code className="text-zinc-400">login.myapp.com</code>). Requires DNS verification.
            </p>
          </div>

          {domainStatus === "idle" && (
            <div className="flex gap-2">
              <input
                type="text"
                value={domainInputValue}
                onChange={(e) => setDomainInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), setupCustomDomain())}
                placeholder="login.myapp.com"
                className="flex-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
              <button
                onClick={setupCustomDomain}
                disabled={domainSaving || !domainInputValue.trim()}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-500 disabled:opacity-40 transition-colors"
              >
                {domainSaving ? "Setting up..." : "Set Up Domain"}
              </button>
            </div>
          )}

          {domainStatus === "pending_verification" && verificationToken && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <p className="text-sm font-medium text-amber-300">DNS verification required</p>
                </div>
                <p className="text-xs text-zinc-400">
                  Add this TXT record to your DNS for <code className="text-zinc-300">{customDomain}</code>:
                </p>
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-[80px_1fr] gap-2">
                    <span className="text-zinc-500 font-medium">Type</span>
                    <code className="text-zinc-300">TXT</code>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-2">
                    <span className="text-zinc-500 font-medium">Name</span>
                    <code className="text-zinc-300">_pymthouse-verify.{customDomain}</code>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-2">
                    <span className="text-zinc-500 font-medium">Value</span>
                    <code className="text-zinc-300 break-all">{verificationToken}</code>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={verifyCustomDomain}
                  disabled={verifying}
                  className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-500 disabled:opacity-40 transition-colors"
                >
                  {verifying ? "Checking DNS..." : "Verify Domain"}
                </button>
                <button
                  onClick={removeCustomDomain}
                  disabled={domainSaving}
                  className="px-4 py-2 text-sm text-zinc-400 border border-zinc-700 rounded-lg hover:border-zinc-600 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          {domainStatus === "verified" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-emerald-300">{customDomain}</p>
                    <p className="text-xs text-zinc-500">Verified and active</p>
                  </div>
                </div>
                <button
                  onClick={removeCustomDomain}
                  disabled={domainSaving}
                  className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                Login is served at <code className="text-zinc-400">https://{customDomain}</code>. Point a CNAME at PymtHouse to route traffic.
              </p>
            </div>
          )}

          {domainError && (
            <p className="text-xs text-red-400">{domainError}</p>
          )}
        </div>
      )}

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
