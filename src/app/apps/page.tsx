"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";

interface AppSummary {
  id: string;
  name: string;
  subtitle: string | null;
  category: string | null;
  status: string;
  logoLightUrl: string | null;
  clientId: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-300",
  submitted: "bg-blue-500/20 text-blue-400",
  in_review: "bg-amber-500/20 text-amber-400",
  approved: "bg-emerald-500/20 text-emerald-400",
  rejected: "bg-red-500/20 text-red-400",
};

export default function AppsPage() {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/apps")
      .then((r) => r.json())
      .then((data) => setApps(data.apps || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">My Apps</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Manage your developer applications
          </p>
        </div>
        <Link
          href="/apps/new"
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors"
        >
          Create New App
        </Link>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-center py-12 animate-pulse">
          Loading apps...
        </div>
      ) : apps.length === 0 ? (
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
            No apps yet
          </h2>
          <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">
            Create your first app to start building with PymtHouse&apos;s OIDC
            authentication and Livepeer network capabilities.
          </p>
          <Link
            href="/apps/new"
            className="inline-flex px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors"
          >
            Create Your First App
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <Link
              key={app.id}
              href={`/apps/${app.id}`}
              className="block p-5 border border-zinc-800 rounded-xl bg-zinc-900/30 hover:border-zinc-700 transition-colors group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-linear-to-br from-emerald-500/20 to-teal-500/20 rounded-lg flex items-center justify-center text-emerald-400 text-sm font-bold">
                  {app.name[0]?.toUpperCase()}
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    STATUS_COLORS[app.status] || STATUS_COLORS.draft
                  }`}
                >
                  {app.status.replace("_", " ")}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-emerald-400 transition-colors">
                {app.name}
              </h3>
              {app.subtitle && (
                <p className="text-xs text-zinc-500 mt-0.5">{app.subtitle}</p>
              )}
              <div className="flex items-center gap-3 mt-3 text-xs text-zinc-500">
                {app.category && <span>{app.category}</span>}
                {app.clientId && (
                  <code className="text-zinc-600 font-mono">
                    {app.clientId.slice(0, 12)}...
                  </code>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
