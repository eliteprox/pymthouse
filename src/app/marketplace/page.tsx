"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

interface MarketplaceApp {
  id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  developerName: string | null;
  websiteUrl: string | null;
  supportUrl: string | null;
  clientId: string | null;
  createdAt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  "AI Video": "bg-purple-500/15 text-purple-400 border-purple-500/20",
  Streaming: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  Gaming: "bg-red-500/15 text-red-400 border-red-500/20",
  Social: "bg-pink-500/15 text-pink-400 border-pink-500/20",
  Tools: "bg-amber-500/15 text-amber-400 border-amber-500/20",
};

const DEFAULT_CATEGORY_COLOR =
  "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";

export default function MarketplacePage() {
  const { data: session } = useSession();
  const [apps, setApps] = useState<MarketplaceApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/marketplace")
      .then((r) => r.json())
      .then((data) => setApps(data.apps || []))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const app of apps) {
      if (app.category) cats.add(app.category);
    }
    return Array.from(cats).sort();
  }, [apps]);

  const filtered = useMemo(() => {
    let result = apps;
    if (selectedCategory) {
      result = result.filter((a) => a.category === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.subtitle?.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q) ||
          a.developerName?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [apps, search, selectedCategory]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <Link href="/" className="text-xl font-bold tracking-tight">
              <span className="text-emerald-400">pymt</span>house
            </Link>
            <p className="text-xs text-zinc-500 mt-0.5">App Marketplace</p>
          </div>
          {session?.user ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:text-zinc-100 border border-zinc-700 rounded-lg hover:border-zinc-600 transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">
                {session.user.name?.[0]?.toUpperCase() || "?"}
              </span>
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg hover:border-zinc-600 transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Page title and search */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-100">Marketplace</h1>
          <p className="text-zinc-500 mt-2 max-w-xl">
            Discover apps built by developers on the Livepeer network.
            All apps are free to use during the beta period.
          </p>
        </div>

        {/* Free usage banner */}
        <div className="mb-8 flex items-start gap-3 p-4 rounded-xl border border-teal-500/20 bg-teal-500/5">
          <svg
            className="w-5 h-5 text-teal-400 mt-0.5 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="text-sm font-medium text-teal-300">
              Free for a limited time
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              All apps on the marketplace are currently free to use. Usage is
              tracked and billing will be introduced in a future update.
            </p>
          </div>
        </div>

        {/* Search and filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search apps..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-transparent"
            />
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  selectedCategory === null
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() =>
                    setSelectedCategory(selectedCategory === cat ? null : cat)
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    selectedCategory === cat
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* App grid */}
        {loading ? (
          <div className="text-zinc-500 text-center py-16 animate-pulse">
            Loading apps...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-zinc-800 rounded-xl bg-zinc-900/20">
            <div className="w-16 h-16 bg-zinc-800 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-zinc-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-zinc-300 mb-2">
              {apps.length === 0
                ? "No apps available yet"
                : "No apps match your search"}
            </h2>
            <p className="text-sm text-zinc-500 max-w-sm mx-auto">
              {apps.length === 0
                ? "Check back soon as developers publish their apps."
                : "Try adjusting your search or filter criteria."}
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((app) => (
              <Link
                key={app.id}
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
                      <p className="text-xs text-zinc-500 truncate">
                        {app.subtitle}
                      </p>
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
                    <span className="text-[11px] text-zinc-500">
                      by {app.developerName}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
