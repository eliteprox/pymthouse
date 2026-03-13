import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/next-auth-options";
import { db } from "@/db/index";
import { developerApps } from "@/db/schema";
import { getClient } from "@/lib/oidc/clients";
import { getScopeDefinition } from "@/lib/oidc/scopes";
import { eq } from "drizzle-orm";
import ConsentForm from "./consent-form";

type SearchParams = Record<string, string | string[] | undefined>;

function asSingleValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function getHostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function getExternalHref(value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.includes("@") && !value.startsWith("mailto:")) {
    return `mailto:${value}`;
  }

  return value;
}

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

  const developerApp = db
    .select({
      name: developerApps.name,
      developerName: developerApps.developerName,
      websiteUrl: developerApps.websiteUrl,
      privacyPolicyUrl: developerApps.privacyPolicyUrl,
      supportUrl: developerApps.supportUrl,
    })
    .from(developerApps)
    .where(eq(developerApps.oidcClientId, client.id))
    .get();

  // Intersect requested scopes with what this client actually allows,
  // so stale or unknown scopes in the request URL never appear on screen.
  const scopes = scope.split(/\s+/).filter((s) => client.allowedScopes.includes(s));
  const scopeItems = scopes.map((s) => ({
    name: s,
    label: getScopeDefinition(s)?.label || s,
    description:
      getScopeDefinition(s)?.description ||
      "Access information associated with this permission",
    required: getScopeDefinition(s)?.required || false,
  }));
  const approvedScopeString = scopes.join(" ");
  const signedInAs = session.user.name || session.user.email || "Your PymtHouse account";
  const redirectHost = getHostLabel(redirectUri);
  const websiteHost = developerApp?.websiteUrl
    ? getHostLabel(developerApp.websiteUrl)
    : null;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full border border-zinc-800 bg-zinc-900/60 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/30">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shrink-0">
            <svg
              className="w-7 h-7 text-white"
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
          <div className="min-w-0">
            <div className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300">
              Permission Request
            </div>
            <h1 className="text-2xl font-semibold text-zinc-100 mt-3">
              Review access for {client.displayName}
            </h1>
            <p className="text-sm text-zinc-400 mt-2 max-w-xl">
              Approve this only if you trust this application and expect to return
              to <span className="text-zinc-200">{redirectHost}</span>.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 mb-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              Application
            </p>
            <p className="text-sm font-medium text-zinc-100 mt-2">
              {developerApp?.name || client.displayName}
            </p>
            <p className="text-sm text-zinc-400 mt-1">
              {developerApp?.developerName
                ? `Built by ${developerApp.developerName}`
                : "Registered PymtHouse application"}
            </p>
            {websiteHost && (
              <p className="text-xs text-zinc-500 mt-2">
                Website: <span className="text-zinc-300">{websiteHost}</span>
              </p>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              Signed In As
            </p>
            <p className="text-sm font-medium text-zinc-100 mt-2">{signedInAs}</p>
            {session.user.email && (
              <p className="text-sm text-zinc-400 mt-1">{session.user.email}</p>
            )}
            <p className="text-xs text-zinc-500 mt-2">
              You can deny this request if this is not the account you want to use.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 mb-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Requested Access
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Only the permissions listed below will be shared with this app.
              </p>
            </div>
            <div className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400">
              {scopeItems.length} permission{scopeItems.length === 1 ? "" : "s"}
            </div>
          </div>
          <ul className="space-y-3">
            {scopeItems.map((item) => (
              <li
                key={item.name}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <svg
                      className="w-4 h-4 text-emerald-400"
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
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-100">
                      {item.label}
                      {item.required && (
                        <span className="ml-2 text-xs font-normal text-zinc-500">
                          Required
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-zinc-400 mt-1">
                      {item.description}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 mb-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            After You Continue
          </p>
          <p className="text-sm text-zinc-300 mt-2">
            PymtHouse will send you back to{" "}
            <span className="text-zinc-100">{redirectHost}</span> to finish sign-in.
          </p>
          <p className="text-xs text-zinc-500 mt-2 break-all">{redirectUri}</p>
        </div>

        {(developerApp?.websiteUrl ||
          developerApp?.privacyPolicyUrl ||
          developerApp?.supportUrl) && (
          <div className="flex flex-wrap gap-4 text-xs text-zinc-400 mb-6">
            {developerApp?.websiteUrl && (
              <a
                href={getExternalHref(developerApp.websiteUrl)}
                target="_blank"
                rel="noreferrer"
                className="hover:text-zinc-200 transition-colors"
              >
                Website
              </a>
            )}
            {developerApp?.privacyPolicyUrl && (
              <a
                href={getExternalHref(developerApp.privacyPolicyUrl)}
                target="_blank"
                rel="noreferrer"
                className="hover:text-zinc-200 transition-colors"
              >
                Privacy Policy
              </a>
            )}
            {developerApp?.supportUrl && (
              <a
                href={getExternalHref(developerApp.supportUrl)}
                target="_blank"
                rel="noreferrer"
                className="hover:text-zinc-200 transition-colors"
              >
                Support
              </a>
            )}
          </div>
        )}

        <ConsentForm
          clientId={clientId}
          redirectUri={redirectUri}
          scope={approvedScopeString}
          state={state}
          nonce={nonce}
          codeChallenge={codeChallenge}
          codeChallengeMethod={codeChallengeMethod}
        />

        <p className="text-xs text-zinc-500 text-center mt-4">
          By authorizing, you let {client.displayName} access only the permissions
          listed above.
        </p>
      </div>
    </main>
  );
}
