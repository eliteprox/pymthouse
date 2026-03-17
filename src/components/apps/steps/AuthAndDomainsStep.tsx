"use client";

import type { AppFormData } from "../AppWizard";
import { OIDC_SCOPES } from "@/lib/oidc/scopes";

interface Props {
  data: AppFormData;
  onChange: (updates: Partial<AppFormData>) => void;
}

export default function AuthAndDomainsStep({ data, onChange }: Props) {
  const scopes = data.allowedScopes.split(/\s+/).filter(Boolean);

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
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">
          Auth & Scopes
        </h2>
        <p className="text-sm text-zinc-500">
          Configure the OIDC client type, requested account data, and grant types.
        </p>
      </div>

      {/* Client Type */}
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

      {/* Allowed Scopes */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-300">
          Allowed Scopes
        </label>
        <p className="text-xs text-zinc-500">
          Select only the information your app needs. These same permissions will
          appear on the user consent screen.
        </p>
        <div className="space-y-2">
          {OIDC_SCOPES.map((scope) => (
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

      {/* Grant Types */}
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
          <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-800/20 cursor-pointer hover:border-zinc-600">
            <input
              type="checkbox"
              checked={data.grantTypes.includes("urn:ietf:params:oauth:grant-type:device_code")}
              onChange={() => {
                const grant = "urn:ietf:params:oauth:grant-type:device_code";
                const has = data.grantTypes.includes(grant);
                onChange({
                  grantTypes: has
                    ? data.grantTypes.filter((g) => g !== grant)
                    : [...data.grantTypes, grant],
                });
              }}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/40"
            />
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Device Authorization Flow
              </p>
              <p className="text-xs text-zinc-500">
                For CLI tools, smart TVs, and IoT devices — no redirect URI needed.
                User enters a code on a separate device to authorize.
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
