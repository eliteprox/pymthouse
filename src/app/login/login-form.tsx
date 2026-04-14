"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";

function PrivyLoginButton({ callbackUrl }: { callbackUrl: string }) {
  const { login, authenticated, getAccessToken } = usePrivy();
  const [bridging, setBridging] = useState(false);
  const [bridgeRequested, setBridgeRequested] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (bridgeRequested && authenticated && !bridging && !failed) {
      setBridging(true);
      setError(null);

      (async () => {
        try {
          const token = await getAccessToken();
          if (!token) {
            setError("Could not get access token");
            setFailed(true);
            setBridgeRequested(false);
            setBridging(false);
            return;
          }

          const result = await signIn("privy-wallet", {
            privyToken: token,
            redirect: false,
          });

          if (result?.error) {
            setError("Authentication failed — check server logs");
            setFailed(true);
            setBridgeRequested(false);
            setBridging(false);
          } else if (result?.ok) {
            setBridgeRequested(false);
            router.push(callbackUrl);
          }
        } catch {
          setError("Authentication failed");
          setFailed(true);
          setBridgeRequested(false);
          setBridging(false);
        }
      })();
    }
  }, [bridgeRequested, authenticated, bridging, failed, getAccessToken, router, callbackUrl]);

  return (
    <div>
      <button
        onClick={() => {
          setFailed(false);
          setError(null);
          setBridgeRequested(true);
          login();
        }}
        disabled={bridging}
        className="w-full px-4 py-3 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {bridging ? "Connecting..." : "Sign In / Create Account"}
      </button>
      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-3">
          {error}
        </p>
      )}
    </div>
  );
}

export function LoginForm({
  callbackUrl,
  isAdmin,
}: {
  callbackUrl: string;
  isAdmin: boolean;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(isAdmin);

  useEffect(() => {
    if (status === "authenticated" && session) {
      router.push(callbackUrl);
    }
  }, [session, status, router, callbackUrl]);

  useEffect(() => {
    if (isAdmin) setShowAdmin(true);
  }, [isAdmin]);

  async function handleTokenLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    setError(null);

    const result = await signIn("token", {
      token: token.trim(),
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid token or insufficient permissions.");
      setLoading(false);
    } else if (result?.ok) {
      router.push(callbackUrl);
    }
  }

  if (status === "authenticated") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <div className="animate-pulse text-zinc-500">Redirecting...</div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-emerald-400">pymt</span>house
          </h1>
          <p className="text-zinc-500 mt-2 text-sm">
            Identity & Payment Infrastructure
          </p>
        </div>

        {/* Privy login -- primary (email, wallet, social) */}
        <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30 mb-4">
          <h2 className="text-lg font-semibold text-zinc-200 mb-1">
            Developer Sign In
          </h2>
          <p className="text-sm text-zinc-500 mb-5">
            Sign in with your email, wallet, or social account.
          </p>
          <PrivyLoginButton callbackUrl={callbackUrl} />
        </div>

        {/* Admin / OAuth section -- collapsed by default */}
        <div className="border border-zinc-800 rounded-xl bg-zinc-900/30">
          <button
            onClick={() => setShowAdmin(!showAdmin)}
            className="w-full px-6 py-4 flex items-center justify-between text-left"
          >
            <span className="text-xs text-zinc-500 uppercase tracking-wider">
              Admin / OAuth Login
            </span>
            <svg
              className={`w-4 h-4 text-zinc-500 transition-transform ${showAdmin ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showAdmin && (
            <div className="px-6 pb-6 space-y-4">
              {/* Token login */}
              <form onSubmit={handleTokenLogin} className="space-y-3">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value);
                    setError(null);
                  }}
                  placeholder="pmth_..."
                  className="w-full px-3 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 font-mono placeholder:font-sans placeholder:text-zinc-600"
                />
                {error && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading || !token.trim()}
                  className="w-full px-4 py-2.5 bg-zinc-700 text-zinc-200 rounded-lg text-sm font-medium hover:bg-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Signing in..." : "Sign in with Token"}
                </button>
              </form>

              <div className="border-t border-zinc-800 pt-4">
                <p className="text-xs text-zinc-500 mb-3">OAuth providers</p>
                <div className="space-y-2">
                  <button
                    onClick={() => signIn("google", { callbackUrl })}
                    className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-zinc-700 rounded-lg hover:bg-zinc-800/50 transition-colors text-sm font-medium text-zinc-300"
                  >
                    Google
                  </button>
                  <button
                    onClick={() => signIn("github", { callbackUrl })}
                    className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-zinc-700 rounded-lg hover:bg-zinc-800/50 transition-colors text-sm font-medium text-zinc-300"
                  >
                    GitHub
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="mt-6 border-t border-zinc-800 pt-4">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-zinc-500 uppercase tracking-wider mb-2">Explore</p>
              <div className="space-y-1.5">
                <Link href="/" className="block text-zinc-400 hover:text-zinc-200 transition-colors">
                  Home
                </Link>
                <Link href="/marketplace" className="block text-zinc-400 hover:text-zinc-200 transition-colors">
                  Marketplace
                </Link>
              </div>
            </div>
            <div>
              <p className="text-zinc-500 uppercase tracking-wider mb-2">Platform</p>
              <div className="space-y-1.5">
                <Link href="/dashboard" className="block text-zinc-400 hover:text-zinc-200 transition-colors">
                  Dashboard
                </Link>
              </div>
            </div>
            <div>
              <p className="text-zinc-500 uppercase tracking-wider mb-2">Help</p>
              <div className="space-y-1.5">
                <a
                  href="https://github.com/eliteprox/pymthouse"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  GitHub
                </a>
                <a
                  href="mailto:john@eliteencoder.net"
                  className="block text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Support
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
