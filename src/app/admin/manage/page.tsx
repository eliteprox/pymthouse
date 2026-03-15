"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";

interface Invite {
  id: string;
  code: string;
  createdBy: string;
  expiresAt: string;
  createdAt: string;
}

export default function AdminManagePage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [acceptCode, setAcceptCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadInvites() {
    try {
      const res = await fetch("/api/v1/admin/invites");
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites || []);
      }
    } catch {
      // Non-critical
    }
  }

  useEffect(() => {
    loadInvites();
  }, []);

  async function createInvite() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/v1/admin/invites", { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        setMessage(`Invite code: ${data.code}`);
        loadInvites();
      } else {
        setError(data.error || "Failed to create invite");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }

  async function acceptInvite() {
    if (!acceptCode.trim()) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/v1/admin/invites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: acceptCode.trim() }),
      });
      const data = await res.json();

      if (res.ok) {
        setMessage("You have been upgraded to admin. Refresh to see changes.");
        setAcceptCode("");
      } else {
        setError(data.error || "Failed to accept invite");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Admin Management</h2>
        <p className="text-zinc-500 mt-1">
          Create and manage admin invite codes
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Create invite */}
        <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30">
          <h3 className="font-semibold text-zinc-200 mb-2">Create Invite</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Generate an invite code to grant admin access. Codes expire in 7 days.
          </p>
          <button
            onClick={createInvite}
            disabled={loading}
            className="px-4 py-2.5 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Generate Invite Code"}
          </button>
        </div>

        {/* Accept invite */}
        <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30">
          <h3 className="font-semibold text-zinc-200 mb-2">Accept Invite</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Enter an invite code to upgrade your account to admin.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={acceptCode}
              onChange={(e) => setAcceptCode(e.target.value)}
              placeholder="Paste invite code"
              className="flex-1 px-3 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 font-mono"
            />
            <button
              onClick={acceptInvite}
              disabled={loading || !acceptCode.trim()}
              className="px-4 py-2.5 bg-zinc-700 text-zinc-200 rounded-lg text-sm font-medium hover:bg-zinc-600 transition-colors disabled:opacity-50"
            >
              Accept
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div className="mb-6 p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
          <p className="text-sm text-emerald-400 font-mono select-all">{message}</p>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-500/30 bg-red-500/10">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Active invites */}
      <div className="border border-zinc-800 rounded-xl bg-zinc-900/30">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="font-semibold text-zinc-200">Active Invites</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Unused, unexpired invite codes</p>
        </div>
        {invites.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">
            No active invites
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="text-left py-3 px-4 font-medium">Code</th>
                  <th className="text-right py-3 px-4 font-medium">Expires</th>
                  <th className="text-right py-3 px-4 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {invites.map((invite) => (
                  <tr key={invite.id} className="hover:bg-zinc-900/50 transition-colors">
                    <td className="py-3 px-4 font-mono text-zinc-300 text-xs">
                      {invite.code}
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-500 text-xs">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-500 text-xs">
                      {new Date(invite.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
