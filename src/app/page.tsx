import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next-auth-options";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/index";
import { developerApps, oidcClients } from "@/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";

const DEFAULT_DOCS_URL =
  "https://github.com/eliteprox/pymthouse/tree/main/docs";

const CATEGORY_COLORS: Record<string, string> = {
  "AI Video": "bg-purple-500/15 text-purple-400 border-purple-500/20",
  Streaming: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  Gaming: "bg-red-500/15 text-red-400 border-red-500/20",
  Social: "bg-pink-500/15 text-pink-400 border-pink-500/20",
  Tools: "bg-amber-500/15 text-amber-400 border-amber-500/20",
};

const DEFAULT_CATEGORY_COLOR =
  "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";

type HomeApp = {
  id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  developerName: string | null;
};

type PublishedAppRow = HomeApp & { featured: boolean };

function AppCard({ app }: { app: HomeApp }) {
  return (
    <Link
      href={`/marketplace/${app.id}`}
      className="block p-5 border border-zinc-800 rounded-xl bg-zinc-900/30 hover:border-zinc-700 transition-colors group"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-11 h-11 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-xl flex items-center justify-center text-emerald-400 text-sm font-bold shrink-0">
          {app.name[0]?.toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-emerald-400 transition-colors truncate">
            {app.name}
          </h3>
          {app.subtitle && (
            <p className="text-xs text-zinc-500 truncate">{app.subtitle}</p>
          )}
        </div>
      </div>
      {app.description && (
        <p className="text-xs text-zinc-400 mb-3 line-clamp-2 leading-relaxed">
          {app.description}
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {app.category && (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
              CATEGORY_COLORS[app.category] || DEFAULT_CATEGORY_COLOR
            }`}
          >
            {app.category}
          </span>
        )}
        {app.developerName && (
          <span className="text-[11px] text-zinc-500">by {app.developerName}</span>
        )}
      </div>
    </Link>
  );
}

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  const docsUrl =
    process.env.NEXT_PUBLIC_DOCS_URL?.trim() || DEFAULT_DOCS_URL;

  const rows = await db
    .select({
      id: developerApps.id,
      name: developerApps.name,
      subtitle: developerApps.subtitle,
      description: developerApps.description,
      category: developerApps.category,
      developerName: developerApps.developerName,
      marketplaceFeatured: developerApps.marketplaceFeatured,
      publishedAt: developerApps.publishedAt,
    })
    .from(developerApps)
    .leftJoin(oidcClients, eq(developerApps.oidcClientId, oidcClients.id))
    .where(
      and(
        eq(developerApps.status, "approved"),
        isNotNull(developerApps.publishedAt),
      ),
    )
    .orderBy(desc(developerApps.publishedAt));

  const mapped: PublishedAppRow[] = rows
    .filter((r): r is typeof r & { id: string } => Boolean(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      subtitle: r.subtitle,
      description: r.description,
      category: r.category,
      developerName: r.developerName,
      featured: r.marketplaceFeatured === 1,
    }));

  const featuredRows = mapped.filter((a) => a.featured).slice(0, 6);
  const featuredIds = new Set(featuredRows.map((a) => a.id));
  const moreRows = mapped.filter((a) => !featuredIds.has(a.id));

  const featuredApps: HomeApp[] = featuredRows.map(
    ({ featured: _f, ...app }) => app,
  );
  const moreApps: HomeApp[] = moreRows.map(({ featured: _f, ...app }) => app);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="border-b border-zinc-800/50">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-emerald-400">pymt</span>house
          </h1>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg hover:border-zinc-600 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-16 sm:py-24 text-center">
        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
          Identity & Payment
          <br />
          <span className="text-emerald-400">Infrastructure</span>
        </h2>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto mb-10">
          Hosted billing, identity, and signer proxy infrastructure for early
          Livepeer-powered providers.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="px-6 py-2.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
          >
            Start Building
          </Link>
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2.5 text-sm font-medium text-zinc-100 border border-zinc-600 rounded-lg hover:border-zinc-500 hover:bg-zinc-900/50 transition-colors"
          >
            Docs
          </a>
          <Link
            href="/marketplace"
            className="px-6 py-2.5 text-sm font-medium text-zinc-100 border border-zinc-600 rounded-lg hover:border-zinc-500 hover:bg-zinc-900/50 transition-colors"
          >
            Marketplace
          </Link>
        </div>
      </div>

      {(featuredApps.length > 0 || moreApps.length > 0) && (
        <div className="max-w-5xl mx-auto px-6 pb-16 space-y-14">
          {featuredApps.length > 0 && (
            <section>
              <div className="flex items-end justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-100">
                    Featured apps
                  </h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    Hand-picked listings from the marketplace
                  </p>
                </div>
                <Link
                  href="/marketplace"
                  className="text-sm text-emerald-400 hover:text-emerald-300 shrink-0"
                >
                  View all
                </Link>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {featuredApps.map((app) => (
                  <AppCard key={app.id} app={app} />
                ))}
              </div>
            </section>
          )}

          {moreApps.length > 0 && (
            <section>
              <div className="flex items-end justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-100">
                    {featuredApps.length > 0 ? "More apps" : "Published apps"}
                  </h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    Recently approved on the marketplace
                  </p>
                </div>
                <Link
                  href="/marketplace"
                  className="text-sm text-emerald-400 hover:text-emerald-300 shrink-0"
                >
                  Browse marketplace
                </Link>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {moreApps.map((app) => (
                  <AppCard key={app.id} app={app} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4">
              <svg
                className="w-5 h-5 text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-zinc-200 mb-2">OIDC Identity</h3>
            <p className="text-sm text-zinc-500">
              Standards-based OIDC for provider admins, client integrations, and
              provider-managed user token issuance.
            </p>
          </div>

          <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4">
              <svg
                className="w-5 h-5 text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-zinc-200 mb-2">User Management</h3>
            <p className="text-sm text-zinc-500">
              Provision provider-scoped app users and issue short-lived runtime
              tokens for them.
            </p>
          </div>

          <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center mb-4">
              <svg
                className="w-5 h-5 text-amber-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-zinc-200 mb-2">Payments</h3>
            <p className="text-sm text-zinc-500">
              Plan-aware key validation, remote signer proxying, and auditable
              usage recording.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
