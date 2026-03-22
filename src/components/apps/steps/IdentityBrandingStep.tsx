"use client";

import { useState } from "react";
import type { AppFormData } from "../AppWizard";

interface Props {
  data: AppFormData;
  onChange: (updates: Partial<AppFormData>) => void;
  appId: string | null;
}

export default function IdentityBrandingStep({ data, onChange, appId }: Props) {
  const isWhiteLabel = data.brandingMode === "whiteLabel";

  // Custom domain management state (local, calls API when appId is set)
  const [customDomain, setCustomDomain] = useState(data.customLoginDomain || "");
  const [domainSaving, setDomainSaving] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(data.customDomainVerificationToken || null);
  const [domainStatus, setDomainStatus] = useState<"idle" | "pending_verification" | "verified">(
    data.customDomainVerifiedAt ? "verified" : data.customDomainVerificationToken ? "pending_verification" : "idle"
  );
  const [verifying, setVerifying] = useState(false);

  const setupDomain = async () => {
    if (!appId || !customDomain.trim()) return;
    setDomainSaving(true);
    setDomainError(null);
    try {
      const res = await fetch(`/api/v1/apps/${appId}/custom-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup", domain: customDomain.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to configure domain");
      setVerificationToken(body.verificationToken);
      setDomainStatus("pending_verification");
      onChange({ customLoginDomain: customDomain.trim(), customDomainVerificationToken: body.verificationToken });
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDomainSaving(false);
    }
  };

  const verifyDomain = async () => {
    if (!appId) return;
    setVerifying(true);
    setDomainError(null);
    try {
      const res = await fetch(`/api/v1/apps/${appId}/custom-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Verification failed");
      if (body.verified) {
        setDomainStatus("verified");
        onChange({ customDomainVerifiedAt: body.verifiedAt });
      } else {
        setDomainError("DNS record not found yet. It may take up to 48 hours to propagate.");
      }
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setVerifying(false);
    }
  };

  const removeDomain = async () => {
    if (!appId) return;
    setDomainSaving(true);
    setDomainError(null);
    try {
      await fetch(`/api/v1/apps/${appId}/custom-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove" }),
      });
      setCustomDomain("");
      setVerificationToken(null);
      setDomainStatus("idle");
      onChange({ customLoginDomain: undefined, customDomainVerificationToken: undefined, customDomainVerifiedAt: undefined });
    } finally {
      setDomainSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">Identity & Branding</h2>
        <p className="text-sm text-zinc-500">
          Control how PymtHouse presents the login experience to your users.
        </p>
      </div>

      {/* Branding Mode */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-zinc-300">Login Page Branding</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Choose whether users see PymtHouse branding or your own brand during login.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange({ brandingMode: "blackLabel" })}
            className={`p-4 rounded-xl border text-left transition-all ${
              !isWhiteLabel
                ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-zinc-700 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-zinc-200">PymtHouse Branded</p>
              </div>
              {!isWhiteLabel && (
                <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              Login is hosted at <code className="text-zinc-400">pymthouse.com</code> with standard PymtHouse styling. No setup required.
            </p>
            <span className="inline-block text-[10px] font-medium text-zinc-400 bg-zinc-800 border border-zinc-700 rounded-full px-2 py-0.5">
              Default · No setup
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChange({ brandingMode: "whiteLabel" })}
            className={`p-4 rounded-xl border text-left transition-all ${
              isWhiteLabel
                ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-zinc-700 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-zinc-200">White Label</p>
              </div>
              {isWhiteLabel && (
                <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              Your logo, colors, and optionally your own domain. Users see your brand — PymtHouse is invisible.
            </p>
            <span className="inline-block text-[10px] font-medium text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full px-2 py-0.5">
              Custom branding
            </span>
          </button>
        </div>
      </div>

      {/* White Label Configuration */}
      {isWhiteLabel && (
        <div className="space-y-6 p-5 rounded-xl border border-zinc-700 bg-zinc-900/40">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
            <h3 className="text-sm font-semibold text-zinc-200">Branding Customization</h3>
          </div>

          {/* Logo URL */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">Logo URL</label>
            <p className="text-xs text-zinc-500">HTTPS URL to your logo image (PNG or SVG, ideally 200×50px or square).</p>
            <input
              type="url"
              value={data.brandingLogoUrl || ""}
              onChange={(e) => onChange({ brandingLogoUrl: e.target.value || undefined })}
              placeholder="https://myapp.com/logo.svg"
              className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
            {data.brandingLogoUrl && (
              <div className="mt-2 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.brandingLogoUrl} alt="Logo preview" className="h-8 max-w-[120px] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <span className="text-xs text-zinc-500">Logo preview</span>
              </div>
            )}
          </div>

          {/* Primary Color */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">Primary Color</label>
            <p className="text-xs text-zinc-500">Used for buttons and interactive elements on the login page.</p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={data.brandingPrimaryColor || "#10b981"}
                onChange={(e) => onChange({ brandingPrimaryColor: e.target.value })}
                className="w-10 h-10 rounded-lg border border-zinc-700 bg-zinc-800 cursor-pointer p-1"
              />
              <input
                type="text"
                value={data.brandingPrimaryColor || ""}
                onChange={(e) => onChange({ brandingPrimaryColor: e.target.value || undefined })}
                placeholder="#10b981"
                className="w-36 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
              {data.brandingPrimaryColor && (
                <div
                  className="flex-1 h-9 rounded-lg border border-zinc-700 flex items-center justify-center text-xs font-medium"
                  style={{ backgroundColor: data.brandingPrimaryColor, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                >
                  Button preview
                </div>
              )}
            </div>
          </div>

          {/* Support Email */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">Support Email</label>
            <p className="text-xs text-zinc-500">Shown on the login page for users who need help signing in.</p>
            <input
              type="email"
              value={data.brandingSupportEmail || ""}
              onChange={(e) => onChange({ brandingSupportEmail: e.target.value || undefined })}
              placeholder="support@myapp.com"
              className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>
        </div>
      )}

      {/* Custom Login Domain */}
      {isWhiteLabel && (
        <div className="space-y-4 p-5 rounded-xl border border-zinc-700 bg-zinc-900/40">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
            <h3 className="text-sm font-semibold text-zinc-200">Custom Login Domain</h3>
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide ml-1">Optional</span>
          </div>
          <p className="text-xs text-zinc-500">
            Host the PymtHouse login page at your own subdomain (e.g., <code className="text-zinc-400">login.myapp.com</code>). Requires a DNS TXT record for ownership verification.
          </p>

          {domainStatus === "idle" && (
            <div className="flex gap-2">
              <input
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), setupDomain())}
                placeholder="login.myapp.com"
                className="flex-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
              <button
                onClick={setupDomain}
                disabled={domainSaving || !customDomain.trim() || !appId}
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
                  Add the following TXT record to your DNS for <code className="text-zinc-300">{customDomain}</code>:
                </p>
                <div className="space-y-2">
                  <div className="grid grid-cols-[80px_1fr] gap-2 text-xs">
                    <span className="text-zinc-500 font-medium">Type</span>
                    <code className="text-zinc-300">TXT</code>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-2 text-xs">
                    <span className="text-zinc-500 font-medium">Name</span>
                    <code className="text-zinc-300">_pymthouse-verify.{customDomain}</code>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-2 text-xs">
                    <span className="text-zinc-500 font-medium">Value</span>
                    <code className="text-zinc-300 break-all">{verificationToken}</code>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={verifyDomain}
                  disabled={verifying}
                  className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-500 disabled:opacity-40 transition-colors"
                >
                  {verifying ? "Checking DNS..." : "Verify Domain"}
                </button>
                <button
                  onClick={removeDomain}
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
                    <p className="text-xs text-zinc-500">Domain verified and active</p>
                  </div>
                </div>
                <button
                  onClick={removeDomain}
                  disabled={domainSaving}
                  className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                Your login page is now hosted at <code className="text-zinc-400">https://{customDomain}</code>. Configure your DNS to proxy requests to PymtHouse.
              </p>
            </div>
          )}

          {domainError && (
            <p className="text-xs text-red-400">{domainError}</p>
          )}

          {!appId && (
            <p className="text-xs text-zinc-500 italic">
              Save the app first to configure a custom domain.
            </p>
          )}
        </div>
      )}

      {/* Summary preview for black-label */}
      {!isWhiteLabel && (
        <div className="p-4 bg-zinc-800/30 border border-zinc-800 rounded-xl space-y-2">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Login page preview</p>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-zinc-300">Users will see the standard <span className="text-emerald-400">PymtHouse</span> login page</p>
              <p className="text-xs text-zinc-500">Hosted at <code>pymthouse.com/login</code> · No custom branding</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
