"use client";

interface BillingPatternData {
  billingPattern: "app_level" | "per_user";
  jwksUri?: string;
}

interface Props {
  data: BillingPatternData;
  onChange: (updates: Partial<BillingPatternData>) => void;
}

export default function BillingPatternStep({ data, onChange }: Props) {
  const isPerUser = data.billingPattern === "per_user";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">Billing Pattern</h2>
        <p className="text-sm text-zinc-500">
          Choose how PymtHouse tracks usage for your application. This determines whether usage
          is attributed to your app as a whole or to individual users on your platform.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange({ billingPattern: "app_level", jwksUri: undefined })}
          className={`p-4 rounded-xl border text-left transition-all ${
            !isPerUser
              ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
              : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-zinc-200">App-Level Billing</p>
            {!isPerUser && (
              <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            All usage is attributed to your app. Your backend uses a single M2M token via client_credentials.
            You handle per-user billing internally.
          </p>
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Good for</p>
            <p className="text-xs text-zinc-500">Simple backends, services that manage their own user billing</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChange({ billingPattern: "per_user" })}
          className={`p-4 rounded-xl border text-left transition-all ${
            isPerUser
              ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
              : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-zinc-200">Per-User Attribution</p>
            {isPerUser && (
              <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Your backend exchanges user JWTs for PymtHouse tokens via RFC 8693 token exchange.
            Usage is tracked per-user with cryptographic proof of identity.
          </p>
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Good for</p>
            <p className="text-xs text-zinc-500">Platforms with user accounts that want PymtHouse to track per-user usage</p>
          </div>
        </button>
      </div>

      <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-xs ${
        !isPerUser
          ? "bg-emerald-500/5 border border-emerald-500/15 text-emerald-300/80"
          : "bg-violet-500/5 border border-violet-500/15 text-violet-300/80"
      }`}>
        <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {!isPerUser
          ? "Your backend will use client_credentials to get a single app-scoped token. Query usage via the billing API."
          : "Your backend will exchange user JWTs for PymtHouse user-scoped tokens. Register your JWKS URL below so PymtHouse can verify your JWTs."}
      </div>

      {isPerUser && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-300">JWKS URL</label>
            <p className="text-xs text-zinc-500 mt-0.5">
              The URL where PymtHouse can fetch your platform&apos;s JSON Web Key Set to verify user JWTs during token exchange.
            </p>
          </div>
          <input
            type="url"
            value={data.jwksUri || ""}
            onChange={(e) => onChange({ jwksUri: e.target.value })}
            placeholder="https://yourplatform.com/.well-known/jwks.json"
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
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
