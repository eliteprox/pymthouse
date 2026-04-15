"use client";

import type { AppFormData } from "../AppWizard";
import { OIDC_SCOPES } from "@/lib/oidc/scopes";

type AppMode = "user_login" | "m2m";

interface Props {
  data: AppFormData;
  onChange: (updates: Partial<AppFormData>) => void;
  readOnly?: boolean;
}

function deriveMode(data: AppFormData): AppMode {
  const isM2M =
    data.tokenEndpointAuthMethod !== "none" &&
    data.grantTypes.includes("client_credentials");
  return isM2M ? "m2m" : "user_login";
}

const M2M_SCOPES = "users:read users:write users:token sign:job";
const USER_LOGIN_SCOPES = "openid sign:job";

const MODE_CARDS: {
  key: AppMode;
  label: string;
  description: string;
  goodFor: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "user_login",
    label: "Interactive OIDC",
    icon: (
      <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    description: "Authorization Code + PKCE for provider admins and supported client integrations.",
    goodFor: "Web apps · dashboards · integrations",
  },
  {
    key: "m2m",
    label: "Client Credentials",
    icon: (
      <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    ),
    description: "Confidential backend access for user provisioning and token issuance APIs.",
    goodFor: "Private backends · workers · APIs",
  },
];

export default function AppModeStep({ data, onChange, readOnly = false }: Props) {
  const mode = deriveMode(data);
  const scopes = data.allowedScopes.split(/\s+/).filter(Boolean);
  const interactiveScopes = OIDC_SCOPES.filter((scope) =>
    ["openid", "sign:job", "admin"].includes(scope.value),
  );
  const machineScopes = OIDC_SCOPES.filter((scope) =>
    ["users:read", "users:write", "users:token", "sign:job"].includes(scope.value),
  );

  const applyMode = (nextMode: AppMode) => {
    if (readOnly) return;
    if (nextMode === "user_login") {
      onChange({
        tokenEndpointAuthMethod: "none",
        grantTypes: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
        allowedScopes: USER_LOGIN_SCOPES,
      });
      return;
    }

    onChange({
      tokenEndpointAuthMethod: "client_secret_post",
      grantTypes: ["client_credentials"],
      allowedScopes: M2M_SCOPES,
    });
  };

  const toggleGrant = (grant: string) => {
    if (readOnly) return;
    const has = data.grantTypes.includes(grant);
    onChange({
      grantTypes: has
        ? data.grantTypes.filter((value) => value !== grant)
        : [...data.grantTypes, grant],
    });
  };

  const toggleScope = (scope: string) => {
    if (readOnly) return;
    if (scope === "openid") return;
    const nextScopes = scopes.includes(scope)
      ? scopes.filter((value) => value !== scope)
      : [...scopes, scope];
    onChange({ allowedScopes: nextScopes.join(" ") });
  };

  const checkIcon = (
    <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">Auth & Scopes</h2>
        <p className="text-sm text-zinc-500">
          Choose the minimal MVP auth shape for this provider app.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {MODE_CARDS.map(({ key, label, description, goodFor, icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => applyMode(key)}
            disabled={readOnly}
            className={`p-4 rounded-xl border text-left transition-all ${
              mode === key
                ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
            } ${readOnly ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-start justify-between mb-2">
              {icon}
              {mode === key && checkIcon}
            </div>
            <p className="text-sm font-semibold text-zinc-200 mt-2 mb-1">{label}</p>
            <p className="text-xs text-zinc-500 mb-3">{description}</p>
            <div className="space-y-0.5">
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Good for</p>
              <p className="text-xs text-zinc-500">{goodFor}</p>
            </div>
          </button>
        ))}
      </div>

      {mode === "user_login" && (
        <div className="space-y-6 border-t border-zinc-800 pt-6">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-300">Grant Types</label>
              <p className="text-xs text-zinc-500 mt-0.5">
                Authorization Code + PKCE is always enabled for interactive apps.
              </p>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-800/20 opacity-70 cursor-not-allowed">
                <input type="checkbox" checked readOnly disabled className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    Authorization Code + PKCE
                    <span className="ml-1.5 text-[10px] font-normal text-zinc-500 uppercase tracking-wide">(required)</span>
                  </p>
                  <p className="text-xs text-zinc-500">Browser redirect flow — the foundation of interactive sign-in. Always required.</p>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                data.grantTypes.includes("refresh_token")
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-zinc-800 bg-zinc-800/20 hover:border-zinc-600"
              }`}>
                <input
                  type="checkbox"
                  checked={data.grantTypes.includes("refresh_token")}
                  onChange={() => toggleGrant("refresh_token")}
                  disabled={readOnly}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/40 mt-0.5 shrink-0 disabled:opacity-50"
                />
                <div>
                  <p className="text-sm font-medium text-zinc-200">Refresh Token</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Allow direct refresh at the token endpoint after the initial interactive sign-in.
                  </p>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                data.grantTypes.includes("urn:ietf:params:oauth:grant-type:device_code")
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-zinc-800 bg-zinc-800/20 hover:border-zinc-600"
              }`}>
                <input
                  type="checkbox"
                  checked={data.grantTypes.includes("urn:ietf:params:oauth:grant-type:device_code")}
                  onChange={() => toggleGrant("urn:ietf:params:oauth:grant-type:device_code")}
                  disabled={readOnly}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/40 mt-0.5 shrink-0 disabled:opacity-50"
                />
                <div>
                  <p className="text-sm font-medium text-zinc-200">Device Authorization Flow
                    <span className="ml-1.5 text-[10px] font-normal text-zinc-500 uppercase tracking-wide">(RFC 8628)</span>
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Allow CLI tools, SDKs, and headless clients to authenticate via a user code on a secondary device.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-300">Scopes</label>
              <p className="text-xs text-zinc-500 mt-0.5">
                Keep interactive scopes narrow for the MVP runtime path.
              </p>
            </div>
            <div className="space-y-2">
              {interactiveScopes.map((scope) => (
                <label
                  key={scope.value}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    scopes.includes(scope.value)
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-zinc-800 bg-zinc-800/20"
                  } ${scope.required || readOnly ? "opacity-70" : "cursor-pointer hover:border-zinc-600"}`}
                >
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope.value)}
                    onChange={() => toggleScope(scope.value)}
                    disabled={scope.required || readOnly}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/40 shrink-0"
                  />
                  <div>
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
        </div>
      )}

      {mode === "m2m" && (
        <div className="space-y-4 border-t border-zinc-800 pt-6">
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-cyan-500/5 border border-cyan-500/15 text-cyan-300/80 text-xs">
            <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Your backend uses <code className="mx-1 font-mono bg-cyan-500/10 px-1 rounded">client_credentials</code> to manage app users and request user-scoped tokens.
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-300">Scopes</label>
              <p className="text-xs text-zinc-500 mt-0.5">
                These scopes control which provider-management APIs your backend can call, and which scopes may be included in user-scoped tokens you issue.
              </p>
            </div>
            <div className="space-y-2">
              {machineScopes.map((scope) => (
                <label
                  key={scope.value}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    scopes.includes(scope.value)
                      ? "border-cyan-500/30 bg-cyan-500/5"
                      : "border-zinc-800 bg-zinc-800/20"
                  } ${readOnly ? "opacity-70" : "cursor-pointer hover:border-zinc-600"}`}
                >
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope.value)}
                    onChange={() => toggleScope(scope.value)}
                    disabled={readOnly}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500/40 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{scope.label}</p>
                    <p className="text-xs text-zinc-500">{scope.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="p-3 bg-zinc-800/30 rounded-lg border border-zinc-800">
            <p className="text-xs font-medium text-zinc-400 mb-1.5">How it works</p>
            <ol className="text-xs text-zinc-500 space-y-1 list-decimal list-inside">
              <li>Your backend authenticates with client credentials.</li>
              <li>You provision users via the app user management API.</li>
              <li>You request a short-lived token for a provisioned app user (include <code className="font-mono">sign:job</code> for remote signer access).</li>
              <li>The SDK uses that user-bound token for discovery and signing.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
