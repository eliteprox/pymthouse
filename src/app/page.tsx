import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Nav */}
      <nav className="border-b border-zinc-800/50">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-emerald-400">pymt</span>house
          </h1>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-6 py-24 text-center">
        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
          Identity & Payment
          <br />
          <span className="text-emerald-400">Infrastructure</span>
        </h2>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto mb-10">
          Whitelabel identity and payment infrastructure for Livepeer
          orchestrators. Connect your wallet, register your app, and start
          building.
        </p>
        <Link
          href="/login"
          className="inline-flex px-6 py-3 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors"
        >
          Create Account
        </Link>
      </div>

      {/* Feature cards */}
      <div className="max-w-5xl mx-auto px-6 pb-24">
        <div className="space-y-6">
          {/* Featured Marketplace Card */}
          <Link
            href="/marketplace"
            className="block border-2 border-emerald-500/40 rounded-2xl p-8 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 hover:from-emerald-500/15 hover:to-teal-500/10 transition-all group"
          >
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-zinc-100 group-hover:text-emerald-400 transition-colors">
                    App Marketplace
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Free Beta
                  </span>
                </div>
                <p className="text-zinc-400 mb-4">
                  Discover and integrate approved apps built by developers on the Livepeer network. 
                  Browse AI video tools, streaming solutions, and more — all free during our beta period.
                </p>
                <div className="inline-flex items-center gap-2 text-sm font-medium text-emerald-400 group-hover:gap-3 transition-all">
                  Browse Apps
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          {/* Other Feature Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h3 className="font-semibold text-zinc-200 mb-2">OIDC Identity</h3>
              <p className="text-sm text-zinc-500">
                Full OpenID Connect provider with PKCE, device flow, and
                custom scopes for role-based access.
              </p>
            </div>

            <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-zinc-200 mb-2">User Management</h3>
              <p className="text-sm text-zinc-500">
                Manage app users, credit balances, and usage tracking with
                a developer-friendly dashboard.
              </p>
            </div>

            <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-zinc-200 mb-2">Payments</h3>
              <p className="text-sm text-zinc-500">
                Built-in payment clearinghouse with ETH-based billing,
                credit management, and transaction logging.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
