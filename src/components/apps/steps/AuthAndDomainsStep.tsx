"use client";

import type { AppFormData } from "../AppWizard";
import { OIDC_SCOPES } from "@/lib/oidc/scopes";

interface Props {
  data: AppFormData;
  onChange: (updates: Partial<AppFormData>) => void;
}

const isPublic = (method: string) => method === "none";

export default function AuthAndDomainsStep({ data, onChange }: Props) {
  const scopes = data.allowedScopes.split(/\s+/).filter(Boolean);
  const clientIsPublic = isPublic(data.tokenEndpointAuthMethod);

  const toggleScope = (scope: string) => {
    if (scope === "openid") return;
    const newScopes = scopes.includes(scope)
      ? scopes.filter((s) => s !== scope)
      : [...scopes, scope];
    onChange({ allowedScopes: newScopes.join(" ") });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">Auth & Scopes</h2>
        <p className="text-sm text-zinc-500">
          Configure how your app authenticates with PymtHouse and what data it can access.
        </p>
      </div>

      {/* Client Type */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-zinc-300">Client Type</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Determines how your app exchanges tokens. This affects whether a client secret is required.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange({ tokenEndpointAuthMethod: "none" })}
            className={`p-4 rounded-xl border text-left transition-all ${
              clientIsPublic
                ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-zinc-200">Public Client</p>
              {clientIsPublic && (
                <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              For browser SPAs, native mobile apps, and CLI tools. No client secret stored — security comes from PKCE.
            </p>
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Good for</p>
              <p className="text-xs text-zinc-500">React / Next.js SPAs · iOS / Android · Electron · CLI tools</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChange({ tokenEndpointAuthMethod: "client_secret_post" })}
            className={`p-4 rounded-xl border text-left transition-all ${
              !clientIsPublic
                ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-zinc-200">Confidential Client</p>
              {!clientIsPublic && (
                <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              For server-side apps that can securely store a client secret. Secret is sent with every token request.
            </p>
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Good for</p>
              <p className="text-xs text-zinc-500">Node.js · Python · Go · Ruby backends · Server-rendered apps</p>
            </div>
          </button>
        </div>

        {/* Contextual note */}
        <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-xs ${
          clientIsPublic
            ? "bg-emerald-500/5 border border-emerald-500/15 text-emerald-300/80"
            : "bg-amber-500/5 border border-amber-500/15 text-amber-300/80"
        }`}>
          <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {clientIsPublic
            ? "PKCE (Proof Key for Code Exchange) will be enforced automatically. You will not need a client secret."
            : "You will generate a client secret in the next step. Store it securely — it cannot be retrieved after creation."}
        </div>
      </div>

      {/* Allowed Scopes */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-zinc-300">Allowed Scopes</label>
          <p className="text-xs text-zinc-500 mt-0.5">
            Select only the data your app needs. Users will see these permissions on the consent screen.
          </p>
        </div>
        <div className="space-y-2">
          {OIDC_SCOPES.map((scope) => (
            <label
              key={scope.value}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                scopes.includes(scope.value)
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-zinc-800 bg-zinc-800/20"
              } ${scope.required ? "opacity-70" : "cursor-pointer hover:border-zinc-600"}`}
            >
              <input
                type="checkbox"
                checked={scopes.includes(scope.value)}
                onChange={() => toggleScope(scope.value)}
                disabled={scope.required}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/40 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-200">
                  {scope.label}
                  {scope.required && (
                    <span className="ml-1.5 text-[10px] font-normal text-zinc-500 uppercase tracking-wide">(required)</span>
                  )}
                </p>
                <p className="text-xs text-zinc-500">{scope.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Grant Types */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-zinc-300">Grant Types</label>
          <p className="text-xs text-zinc-500 mt-0.5">
            Choose the flows your app uses to obtain tokens.
          </p>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-800/20 opacity-70 cursor-not-allowed">
            <input type="checkbox" checked readOnly disabled className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500" />
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Authorization Code
                <span className="ml-1.5 text-[10px] font-normal text-zinc-500 uppercase tracking-wide">(required)</span>
              </p>
              <p className="text-xs text-zinc-500">Standard redirect-based OIDC login flow</p>
            </div>
          </label>

          {[
            {
              grant: "refresh_token",
              label: "Refresh Token",
              description: "Let the app silently renew access without re-prompting the user.",
              recommended: true,
            },
            {
              grant: "urn:ietf:params:oauth:grant-type:device_code",
              label: "Device Authorization Flow",
              description: "For CLI tools, smart TVs, and IoT devices. User enters a code on a separate screen — no redirect URI needed.",
              recommended: false,
            },
          ].map(({ grant, label, description, recommended }) => {
            const checked = data.grantTypes.includes(grant);
            return (
              <label
                key={grant}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  checked ? "border-emerald-500/30 bg-emerald-500/5" : "border-zinc-800 bg-zinc-800/20 hover:border-zinc-600"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange({
                      grantTypes: checked
                        ? data.grantTypes.filter((g) => g !== grant)
                        : [...data.grantTypes, grant],
                    })
                  }
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/40 mt-0.5 shrink-0"
                />
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    {label}
                    {recommended && (
                      <span className="ml-2 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5">
                        Recommended
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
