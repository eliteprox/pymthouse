"use client";

import type { AppFormData } from "../AppWizard";
import { OIDC_SCOPES } from "@/lib/oidc/scopes";

interface Props {
  data: AppFormData;
  onChange: (updates: Partial<AppFormData>) => void;
  readOnly?: boolean;
}

export default function AppModeStep({ data, onChange, readOnly = false }: Props) {
  const scopes = data.allowedScopes.split(/\s+/).filter(Boolean);
  const interactiveScopes = OIDC_SCOPES.filter((scope) =>
    ["openid", "sign:job", "users:token", "admin"].includes(scope.value),
  );

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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">Auth & Scopes</h2>
        <p className="text-sm text-zinc-500">
          Configure grants and scopes for this provider app.
        </p>
      </div>

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

        <div className="rounded-xl border border-zinc-700/80 bg-zinc-800/20 p-4 space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(data.backendDeviceHelper)}
              onChange={(e) => {
                const checked = e.target.checked;
                const nextScopes =
                  checked && !scopes.includes("users:token")
                    ? [...scopes, "users:token"]
                    : scopes;
                onChange({
                  backendDeviceHelper: checked,
                  allowedScopes: nextScopes.join(" "),
                });
              }}
              disabled={readOnly}
              className="w-4 h-4 mt-0.5 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/40 shrink-0 disabled:opacity-50"
            />
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Backend device helper (confidential client)
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Provisions a separate <code className="font-mono text-zinc-400">m2m_</code> client for
                server-to-server device approval and Builder APIs (<code className="font-mono text-zinc-400">users:token</code>,{" "}
                <code className="font-mono text-zinc-400">users:write</code>). Your public client stays
                unauthenticated for SDK / CLI device login—required for Option B (NaaP-side approval).
              </p>
            </div>
          </label>
          {data.backendDeviceHelper && (
            <div className="rounded-lg border border-zinc-700/70 bg-zinc-800/30 px-3 py-2 text-xs text-zinc-400">
              Companion confidential client scopes are fixed to{" "}
              <code className="font-mono text-zinc-300">users:token users:write device:approve</code>.
            </div>
          )}
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
                <div>
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope.value)}
                    onChange={() => toggleScope(scope.value)}
                    disabled={scope.required || readOnly}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/40 shrink-0"
                  />
                </div>
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
    </div>
  );
}
