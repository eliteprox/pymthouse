import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/next-auth-options";
import DeviceVerifyForm from "./device-verify-form";
import { resolveHostContext } from "@/lib/oidc/host-resolution";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function DeviceVerificationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);
  const hostContext = await resolveHostContext();

  if (!session?.user) {
    const qs = new URLSearchParams();
    const userCode =
      typeof params.user_code === "string" ? params.user_code : undefined;
    if (userCode) qs.set("user_code", userCode);
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/oidc/device${qs.toString() ? `?${qs.toString()}` : ""}`)}`
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full border border-zinc-800 bg-zinc-900/60 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/30">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
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
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="inline-flex items-center rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-violet-300">
              Device Authorization
            </div>
            <h1 className="text-2xl font-semibold text-zinc-100 mt-3">
              Sign in on another device
            </h1>
            <p className="text-sm text-zinc-400 mt-2">
              Signed in as{" "}
              <span className="text-zinc-200">
                {session.user.name || session.user.email}
              </span>
            </p>
          </div>
        </div>

        <DeviceVerifyForm />

        <p className="text-xs text-zinc-600 text-center mt-6">
          Identity powered by{" "}
          <span className="text-zinc-500">
            {hostContext.branding.displayName}
          </span>
        </p>
      </div>
    </main>
  );
}
