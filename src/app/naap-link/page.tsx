import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/next-auth-options";

function asSingleValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return value || null;
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function NaapLinkPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const redirectUrl = asSingleValue(params.redirect_url);
  const state = asSingleValue(params.state);

  if (!redirectUrl || !state) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full border border-zinc-800 bg-zinc-900/40 rounded-xl p-6">
          <h1 className="text-lg font-semibold text-red-300 mb-2">
            Invalid NaaP link request
          </h1>
          <p className="text-sm text-zinc-400">
            Missing required query params. Please start the billing-provider
            linking flow from NaaP.
          </p>
        </div>
      </main>
    );
  }

  const session = await getServerSession(authOptions);
  const qs = new URLSearchParams({ redirect_url: redirectUrl, state });

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/naap-link?${qs.toString()}`)}`);
  }

  redirect(`/api/v1/naap/auth?${qs.toString()}`);
}
