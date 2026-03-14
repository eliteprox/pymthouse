"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function DeviceVerifyForm() {
  const searchParams = useSearchParams();
  const prefilled = searchParams.get("user_code") || "";
  const [userCode, setUserCode] = useState(prefilled);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error" | "denied"
  >("idle");
  const [deviceInfo, setDeviceInfo] = useState<{
    clientName: string;
    scopes: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"enter" | "confirm">(
    prefilled ? "confirm" : "enter"
  );

  // If prefilled, immediately look up the device code
  useEffect(() => {
    if (prefilled) {
      lookupCode(prefilled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookupCode(code: string) {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/v1/oidc/device_verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_code: code, action: "lookup" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error_description || data.error || "Invalid code");
        setStatus("error");
        return;
      }
      setDeviceInfo({ clientName: data.client_name, scopes: data.scopes });
      setStep("confirm");
      setStatus("idle");
    } catch {
      setError("Failed to verify code. Please try again.");
      setStatus("error");
    }
  }

  async function authorize(allow: boolean) {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/v1/oidc/device_verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_code: userCode,
          action: allow ? "approve" : "deny",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error_description || data.error || "Failed");
        setStatus("error");
        return;
      }
      setStatus(allow ? "success" : "denied");
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  function handleSubmitCode(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = userCode.trim().toUpperCase();
    setUserCode(cleaned);
    lookupCode(cleaned);
  }

  if (status === "success") {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">Device Authorized</h2>
        <p className="text-sm text-zinc-400">
          You can close this window and return to your device.
        </p>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">Access Denied</h2>
        <p className="text-sm text-zinc-400">
          The device will not be granted access. You can close this window.
        </p>
      </div>
    );
  }

  if (step === "enter") {
    return (
      <form onSubmit={handleSubmitCode} className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 mb-1">
            Enter Device Code
          </h2>
          <p className="text-sm text-zinc-400">
            Enter the code shown on your device to authorize access to your account.
          </p>
        </div>

        <div>
          <input
            type="text"
            value={userCode}
            onChange={(e) => setUserCode(e.target.value.toUpperCase())}
            placeholder="ABCD-1234"
            maxLength={9}
            className="w-full text-center text-2xl font-mono tracking-[0.3em] px-4 py-4 rounded-xl bg-zinc-950/60 border border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
            autoFocus
            autoComplete="off"
          />
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={userCode.length < 9 || status === "loading"}
          className="w-full px-6 py-3 text-sm font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === "loading" ? "Verifying..." : "Continue"}
        </button>
      </form>
    );
  }

  // step === "confirm"
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">
          Authorize Device
        </h2>
        <p className="text-sm text-zinc-400">
          Confirm that you want to sign in on {deviceInfo?.clientName || "this device"}.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
          Device Code
        </p>
        <p className="text-lg font-mono text-zinc-100 mt-1 tracking-wider">
          {userCode}
        </p>
      </div>

      {deviceInfo && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500 mb-3">
            Application
          </p>
          <p className="text-sm font-medium text-zinc-100">
            {deviceInfo.clientName}
          </p>
          <p className="text-xs text-zinc-500 mt-2">
            requests access to: {deviceInfo.scopes.join(", ")}
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => authorize(false)}
          disabled={status === "loading"}
          className="flex-1 px-6 py-3 text-sm font-medium rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={() => authorize(true)}
          disabled={status === "loading"}
          className="flex-1 px-6 py-3 text-sm font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        >
          {status === "loading" ? "Authorizing..." : "Authorize"}
        </button>
      </div>
    </div>
  );
}
