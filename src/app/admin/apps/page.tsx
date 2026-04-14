"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardLayout from "@/components/DashboardLayout";

interface AdminApp {
  id: string;
  name: string;
  subtitle: string | null;
  category: string | null;
  status: string;
  developerName: string | null;
  submittedAt: string | null;
  pendingRevisionSubmittedAt?: string | null;
  createdAt: string;
  ownerEmail: string | null;
  ownerName: string | null;
  clientId: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-500/20 text-blue-400",
  in_review: "bg-amber-500/20 text-amber-400",
  approved: "bg-emerald-500/20 text-emerald-400",
  rejected: "bg-red-500/20 text-red-400",
};

export default function AdminAppsReviewPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [apps, setApps] = useState<AdminApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [notesByAppId, setNotesByAppId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const userRole = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;

  useEffect(() => {
    if (status === "unauthenticated" || (status === "authenticated" && userRole !== "admin")) {
      if (status === "authenticated") {
        router.push("/");
      }
      return;
    }
    if (status !== "authenticated") return;

    fetch("/api/v1/admin/apps")
      .then((r) => r.json())
      .then((data) => setApps(data.apps || []))
      .catch(() => setApps([]))
      .finally(() => setLoading(false));
  }, [status, userRole, router]);

  const handleReview = async (appId: string, action: "approve" | "reject") => {
    setReviewing(appId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/apps/${appId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes: notesByAppId[appId] || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update app");
        return;
      }
      setNotesByAppId((prev) => ({ ...prev, [appId]: "" }));
      setApps((prev) =>
        prev.map((a) =>
          a.id === appId
            ? {
                ...a,
                status: data.status,
                // Clear pending revision when admin approves or rejects it
                pendingRevisionSubmittedAt:
                  data.revisionApproved !== undefined ? null : a.pendingRevisionSubmittedAt,
              }
            : a
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setReviewing(null);
    }
  };

  const handleRevoke = async (appId: string) => {
    setRevoking(appId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/apps/${appId}/revoke`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to revoke app");
        return;
      }
      setApps((prev) =>
        prev.map((a) => (a.id === appId ? { ...a, status: data.status } : a))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setRevoking(null);
    }
  };

  if (status === "loading" || (status === "authenticated" && userRole !== "admin")) {
    return (
      <DashboardLayout>
        <div className="text-zinc-500 text-center py-12 animate-pulse">
          Loading...
        </div>
      </DashboardLayout>
    );
  }

  // Pending: initial submission or approved app with a revision in review
  const pendingApps = apps.filter(
    (a) =>
      ["submitted", "in_review"].includes(a.status) ||
      (a.status === "approved" && a.pendingRevisionSubmittedAt)
  );
  const otherApps = apps.filter(
    (a) =>
      ["approved", "rejected"].includes(a.status) &&
      !(a.status === "approved" && a.pendingRevisionSubmittedAt)
  );

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">App Submissions</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Review and approve developer app submissions
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-500/20 bg-red-500/5 text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500 text-center py-12 animate-pulse">
          Loading apps...
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Apps */}
          <div>
            <h2 className="text-lg font-semibold text-zinc-200 mb-4">
              Pending Review ({pendingApps.length})
            </h2>
            {pendingApps.length === 0 ? (
              <div className="text-zinc-500 text-center py-8 border border-zinc-800 rounded-xl bg-zinc-900/30">
                No pending submissions
              </div>
            ) : (
              <div className="space-y-4">
                {pendingApps.map((app) => (
                  <div
                    key={app.id}
                    className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-semibold text-zinc-200">
                            {app.name}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              STATUS_COLORS[app.status] || "bg-zinc-700/30 text-zinc-400"
                            }`}
                          >
                            {app.status.replace("_", " ")}
                          </span>
                          {app.pendingRevisionSubmittedAt && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400">
                              pending revision
                            </span>
                          )}
                        </div>
                        {app.subtitle && (
                          <p className="text-sm text-zinc-400">{app.subtitle}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                          {app.developerName && <span>by {app.developerName}</span>}
                          {app.category && (
                            <>
                              <span>•</span>
                              <span>{app.category}</span>
                            </>
                          )}
                          {app.ownerEmail && (
                            <>
                              <span>•</span>
                              <span>{app.ownerEmail}</span>
                            </>
                          )}
                        </div>
                        {app.submittedAt && (
                          <p className="text-xs text-zinc-600 mt-1">
                            Submitted: {new Date(app.submittedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <Link
                        href={`/apps/${app.id}`}
                        className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg hover:border-zinc-600 transition-colors"
                      >
                        View Details
                      </Link>
                    </div>

                    <div className="mt-4">
                      <label className="block text-xs text-zinc-500 mb-2">
                        Reviewer Notes (optional)
                      </label>
                      <textarea
                        value={notesByAppId[app.id] || ""}
                        onChange={(e) =>
                          setNotesByAppId((prev) => ({ ...prev, [app.id]: e.target.value }))
                        }
                        placeholder="Add notes about this submission..."
                        rows={2}
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      />
                    </div>

                    <div className="flex items-center gap-3 mt-4">
                      <button
                        onClick={() => handleReview(app.id, "approve")}
                        disabled={reviewing === app.id}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {reviewing === app.id ? "Processing..." : "Approve"}
                      </button>
                      <button
                        onClick={() => handleReview(app.id, "reject")}
                        disabled={reviewing === app.id}
                        className="px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Other Apps */}
          <div>
            <h2 className="text-lg font-semibold text-zinc-200 mb-4">
              All Apps ({otherApps.length})
            </h2>
            {otherApps.length === 0 ? (
              <div className="text-zinc-500 text-center py-8 border border-zinc-800 rounded-xl bg-zinc-900/30">
                No apps yet
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {otherApps.map((app) => (
                  <div
                    key={app.id}
                    className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/30"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-semibold text-zinc-200">
                            {app.name}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              STATUS_COLORS[app.status] || "bg-zinc-700/30 text-zinc-400"
                            }`}
                          >
                            {app.status}
                          </span>
                        </div>
                        {app.subtitle && (
                          <p className="text-xs text-zinc-400">{app.subtitle}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                          {app.category && <span>{app.category}</span>}
                          {app.ownerEmail && (
                            <>
                              <span>•</span>
                              <span>{app.ownerEmail}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Link
                        href={`/apps/${app.id}`}
                        className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg hover:border-zinc-600 transition-colors shrink-0"
                      >
                        View
                      </Link>
                    </div>

                    {app.status === "approved" && (
                      <button
                        onClick={() => handleRevoke(app.id)}
                        disabled={revoking === app.id}
                        className="mt-3 w-full px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {revoking === app.id ? "Revoking..." : "Revoke Approval"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
