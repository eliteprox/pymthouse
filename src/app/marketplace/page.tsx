"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { AppCard } from "@/components/AppCard";
import { useInsideDashboard } from "@/context/MarketplaceLayoutContext";

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
  featured?: boolean;
}

export default function MarketplacePage() {
  const insideDashboard = useInsideDashboard();
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

  const innerContent = (
    <>
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
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
    </>
  );

  if (insideDashboard) {
    return innerContent;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <Link href="/" className="text-xl font-bold tracking-tight">
              <span className="text-emerald-400">pymt</span>house
            </Link>
            <p className="text-xs text-zinc-500 mt-0.5">App Marketplace</p>
          </div>
          <Link
            href="/login"
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg hover:border-zinc-600 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6 py-10">{innerContent}</div>
    </div>
  );
}
