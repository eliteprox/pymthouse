"use client";

import type { AppFormData } from "../AppWizard";
import { OIDC_SCOPES } from "@/lib/oidc/scopes";

type AppMode = "user_login" | "m2m" | "per_user_m2m";

interface Props {
  data: AppFormData;
  onChange: (updates: Partial<AppFormData>) => void;
}

function deriveMode(data: AppFormData): AppMode {
  const isM2M =
    data.tokenEndpointAuthMethod !== "none" &&
    data.grantTypes.includes("client_credentials");
  if (isM2M && data.billingPattern === "per_user") return "per_user_m2m";
  if (isM2M) return "m2m";
  return "user_login";
}

const M2M_SCOPES = "openid gateway";
const USER_LOGIN_SCOPES = "openid profile email gateway offline_access";

const MODE_CARDS: {
  key: AppMode;
  label: string;
  description: string;
  goodFor: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "user_login",
    label: "User Login",
    icon: (
      <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    description: "Users sign in with their PymtHouse account. Your app acts on their behalf.",
    goodFor: "Web apps · SPAs · Mobile · CLI tools",
  },
  {
    key: "m2m",
    label: "Machine-to-Machine",
    icon: (
      <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    ),
    description: "Your backend authenticates directly with a client secret. No user interaction.",
    goodFor: "Backend services · Workers · APIs",
  },
  {
    key: "per_user_m2m",
    label: "Per-User M2M",
    icon: (
      <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    description: "Your backend exchanges user JWTs for PymtHouse tokens. Usage tracked per user.",
    goodFor: "Platforms with user accounts · Multi-tenant backends",
  },
];

export default function AppModeStep({ data, onChange }: Props) {
  const mode = deriveMode(data);
  const scopes = data.allowedScopes.split(/\s+/).filter(Boolean);
  const nonDerivedScopes = OIDC_SCOPES.filter((s) => s.value !== "offline_access");

  const applyMode = (nextMode: AppMode) => {
    if (nextMode === "user_login") {
      onChange({
        tokenEndpointAuthMethod: "none",
        grantTypes: ["authorization_code", "refresh_token"],
        allowedScopes: USER_LOGIN_SCOPES,
        billingPattern: "app_level",
        jwksUri: undefined,
      });
    } else if (nextMode === "m2m") {
      onChange({
        tokenEndpointAuthMethod: "client_secret_post",
        grantTypes: ["client_credentials"],
        allowedScopes: M2M_SCOPES,
        billingPattern: "app_level",
        jwksUri: undefined,
      });
    } else {
      onChange({
        tokenEndpointAuthMethod: "client_secret_post",
        grantTypes: ["client_credentials"],
        allowedScopes: M2M_SCOPES,
        billingPattern: "per_user",
      });
    }
  };

  const toggleGrant = (grant: string) => {
    const has = data.grantTypes.includes(grant);
    const nextGrantTypes = has
      ? data.grantTypes.filter((g) => g !== grant)
      : [...data.grantTypes, grant];
    const nextScopes = new Set(scopes);
    if (nextGrantTypes.includes("refresh_token")) {
      nextScopes.add("offline_access");
    } else {
      nextScopes.delete("offline_access");
    }
    const preferredOrder = OIDC_SCOPES.map((s) => s.value);
    const ordered = preferredOrder.filter((s) => nextScopes.has(s));
    onChange({ grantTypes: nextGrantTypes, allowedScopes: ordered.join(" ") });
  };

  const toggleScope = (scope: string) => {
    if (scope === "openid") return;
    const newScopes = scopes.includes(scope)
      ? scopes.filter((s) => s !== scope)
      : [...scopes, scope];
    onChange({ allowedScopes: newScopes.join(" ") });
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
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">App Mode</h2>
        <p className="text-sm text-zinc-500">
          Choose how your app interacts with PymtHouse. This determines authentication, billing, and token flow.
        </p>
      </div>

      {/* Mode Cards */}
      <div className="grid grid-cols-3 gap-3">
        {MODE_CARDS.map(({ key, label, description, goodFor, icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => applyMode(key)}
            className={`p-4 rounded-xl border text-left transition-all ${
              mode === key
                ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
            }`}
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

      {/* Mode-specific configuration */}
      {mode === "user_login" && (
        <div className="space-y-6 border-t border-zinc-800 pt-6">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-300">Optional Flows</label>
              <p className="text-xs text-zinc-500 mt-0.5">
                Authorization Code is always included. Enable additional flows below.
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
                  description: "Silently renew access without re-prompting the user. Includes Session Renewal scope automatically.",
                  recommended: true,
                },
                {
                  grant: "urn:ietf:params:oauth:grant-type:device_code",
                  label: "Device Authorization Flow",
                  description: "For CLI tools, smart TVs, and IoT devices. User enters a code on a separate screen.",
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
                      onChange={() => toggleGrant(grant)}
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

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-300">Scopes</label>
              <p className="text-xs text-zinc-500 mt-0.5">
                Users will see these permissions on the consent screen.
              </p>
            </div>
            <div className="space-y-2">
              {nonDerivedScopes.map((scope) => (
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
        <div className="border-t border-zinc-800 pt-6">
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/15 text-emerald-300/80 text-xs">
            <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Your backend uses{" "}
            <code className="mx-1 font-mono bg-emerald-500/10 px-1 rounded">client_credentials</code>
            to obtain a gateway token. No redirect URIs or user sign-in needed. Generate a client secret in the next step.
          </div>
        </div>
      )}

      {mode === "per_user_m2m" && (
        <div className="space-y-4 border-t border-zinc-800 pt-6">
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-violet-500/5 border border-violet-500/15 text-violet-300/80 text-xs">
            <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Your backend exchanges user JWTs for PymtHouse user-scoped tokens via RFC 8693. Usage is tracked per user with cryptographic proof of identity.
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-300">JWKS URL</label>
            <p className="text-xs text-zinc-500">
              The URL where PymtHouse can fetch your platform&apos;s JSON Web Key Set to verify user JWTs during token exchange.
            </p>
            <input
              type="url"
              value={data.jwksUri || ""}
              onChange={(e) => onChange({ jwksUri: e.target.value })}
              placeholder="https://yourplatform.com/.well-known/jwks.json"
              className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <div className="p-3 bg-zinc-800/30 rounded-lg border border-zinc-800">
            <p className="text-xs font-medium text-zinc-400 mb-1.5">How it works</p>
            <ol className="text-xs text-zinc-500 space-y-1 list-decimal list-inside">
              <li>Your platform authenticates a user and mints a JWT with their ID in the <code className="text-zinc-400">sub</code> claim</li>
              <li>Your backend sends the JWT to PymtHouse via RFC 8693 token exchange</li>
              <li>PymtHouse fetches your JWKS to verify the JWT signature</li>
              <li>PymtHouse creates an end-user record and returns a user-scoped access token</li>
              <li>Use that token for signing requests — identity is in the token, no headers needed</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
