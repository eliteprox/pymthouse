import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/next-auth-options";
import { getClient } from "@/lib/oidc/clients";
import ConsentForm from "./consent-form";

type SearchParams = Record<string, string | string[] | undefined>;

function asSingleValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  openid: "Verify your identity",
  profile: "Access your name and profile info",
  email: "Access your email address",
  plan: "Access your subscription plan",
  entitlements: "Access your entitled features and capabilities",
};

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const clientId = asSingleValue(params.client_id);
  const redirectUri = asSingleValue(params.redirect_uri);
  const scope = asSingleValue(params.scope);
  const state = asSingleValue(params.state);
  const nonce = asSingleValue(params.nonce);
  const codeChallenge = asSingleValue(params.code_challenge);
  const codeChallengeMethod = asSingleValue(params.code_challenge_method);

  if (!clientId || !redirectUri || !scope || !state) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full border border-red-500/20 bg-zinc-900/40 rounded-xl p-6">
          <h1 className="text-lg font-semibold text-red-300 mb-2">
            Invalid Authorization Request
          </h1>
          <p className="text-sm text-zinc-400">
            Missing required parameters. Please start the authorization flow from the client application.
          </p>
        </div>
      </main>
    );
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    const qs = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      ...(nonce && { nonce }),
      ...(codeChallenge && { code_challenge: codeChallenge }),
      ...(codeChallengeMethod && { code_challenge_method: codeChallengeMethod }),
    });
    redirect(`/login?callbackUrl=${encodeURIComponent(`/oidc/consent?${qs.toString()}`)}`);
  }

  const client = getClient(clientId);
  if (!client) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full border border-red-500/20 bg-zinc-900/40 rounded-xl p-6">
          <h1 className="text-lg font-semibold text-red-300 mb-2">
            Unknown Application
          </h1>
          <p className="text-sm text-zinc-400">
            The requesting application is not registered.
          </p>
        </div>
      </main>
    );
  }

  const scopes = scope.split(/\s+/).filter(Boolean);
  const scopeItems = scopes.map((s) => ({
    name: s,
    description: SCOPE_DESCRIPTIONS[s] || `Access ${s} data`,
  }));

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full border border-zinc-800 bg-zinc-900/40 rounded-xl p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-100">
            Authorize {client.displayName}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            {client.displayName} wants to access your account
          </p>
        </div>

        <div className="bg-zinc-800/50 rounded-lg p-4 mb-6">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
            This will allow the application to:
          </p>
          <ul className="space-y-2">
            {scopeItems.map((item) => (
              <li key={item.name} className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-sm text-zinc-300">{item.description}</span>
              </li>
            ))}
          </ul>
        </div>

        <ConsentForm
          clientId={clientId}
          redirectUri={redirectUri}
          scope={scope}
          state={state}
          nonce={nonce}
          codeChallenge={codeChallenge}
          codeChallengeMethod={codeChallengeMethod}
        />

        <p className="text-xs text-zinc-500 text-center mt-4">
          By authorizing, you agree to share the above information with {client.displayName}.
        </p>
      </div>
    </main>
  );
}
