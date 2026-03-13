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
          Loading submissions...
        </div>
      ) : pendingApps.length === 0 && otherApps.length === 0 ? (
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
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-zinc-300 mb-2">
            No app submissions
          </h2>
          <p className="text-sm text-zinc-500">
            Apps submitted by developers will appear here for review.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {pendingApps.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-zinc-200 mb-4">
                Pending Review ({pendingApps.length})
              </h2>
              <div className="space-y-4">
                {pendingApps.map((app) => (
                  <ReviewCard
                    key={app.id}
                    app={app}
                    reviewing={reviewing === app.id}
                    notes={notesByAppId[app.id] ?? ""}
                    setNotes={(v) =>
                      setNotesByAppId((prev) => ({ ...prev, [app.id]: v }))
                    }
                    onReview={handleReview}
                  />
                ))}
              </div>
            </div>
          )}

          {otherApps.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-zinc-200 mb-4">
                Previously Reviewed ({otherApps.length})
              </h2>
              <div className="space-y-4">
                {otherApps.map((app) => (
                  <ReviewCard
                    key={app.id}
                    app={app}
                    reviewing={false}
                    revoking={revoking === app.id}
                    notes=""
                    setNotes={() => {}}
                    onReview={async () => {}}
                    onRevoke={app.status === "approved" ? handleRevoke : undefined}
                    readOnly
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}

function ReviewCard({
  app,
  reviewing,
  revoking,
  notes,
  setNotes,
  onReview,
  onRevoke,
  readOnly = false,
}: {
  app: AdminApp;
  reviewing: boolean;
  revoking?: boolean;
  notes: string;
  setNotes: (v: string) => void;
  onReview: (id: string, action: "approve" | "reject") => Promise<void>;
  onRevoke?: (id: string) => Promise<void>;
  readOnly?: boolean;
}) {
  const statusColor = STATUS_COLORS[app.status] || "bg-zinc-700 text-zinc-300";

  return (
    <div className="p-5 border border-zinc-800 rounded-xl bg-zinc-900/30">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-base font-semibold text-zinc-100">{app.name}</h3>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}
            >
              {app.status.replace("_", " ")}
            </span>
          </div>
          {app.subtitle && (
            <p className="text-sm text-zinc-500 mt-0.5">{app.subtitle}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-zinc-400">
            <span>{app.developerName || app.ownerName || "—"}</span>
            {app.ownerEmail && (
              <span className="text-zinc-500">{app.ownerEmail}</span>
            )}
            {app.category && <span>{app.category}</span>}
            {app.submittedAt && (
              <span>
                Submitted{" "}
                {new Date(app.submittedAt).toLocaleDateString(undefined, {
                  dateStyle: "short",
                })}
              </span>
            )}
          </div>
          {app.clientId && (
            <code className="mt-2 block text-xs text-zinc-600 font-mono">
              {app.clientId}
            </code>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/apps/${app.id}`}
            className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg hover:border-zinc-600 transition-colors"
          >
            View
          </Link>
          {app.status === "approved" && onRevoke && (
            <button
              onClick={() => onRevoke(app.id)}
              disabled={revoking}
              className="px-3 py-1.5 text-sm text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded-lg hover:border-amber-500/50 transition-colors disabled:opacity-50"
            >
              {revoking ? "..." : "Revoke"}
            </button>
          )}
          {!readOnly && (
            <>
              <button
                onClick={() => onReview(app.id, "reject")}
                disabled={reviewing}
                className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 border border-red-500/30 rounded-lg hover:border-red-500/50 transition-colors disabled:opacity-50"
              >
                {reviewing ? "..." : "Reject"}
              </button>
              <button
                onClick={() => onReview(app.id, "approve")}
                disabled={reviewing}
                className="px-3 py-1.5 text-sm text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-lg hover:border-emerald-500/50 transition-colors disabled:opacity-50"
              >
                {reviewing ? "..." : "Approve"}
              </button>
            </>
          )}
        </div>
      </div>
      {!readOnly && (
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <label className="block text-xs text-zinc-500 mb-2">
            Notes (optional, shown to developer on reject)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes for the developer..."
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none"
            rows={2}
          />
        </div>
      )}
    </div>
  );
}
