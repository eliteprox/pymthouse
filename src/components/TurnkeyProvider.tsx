"use client";

import {
  TurnkeyProvider as TurnkeyProviderBase,
  type TurnkeyProviderConfig,
} from "@turnkey/react-wallet-kit";

// Wallet Kit auto-calls fetchUser/fetchWallets on mount whenever it thinks
// a session might exist. On /login (or after a stale/expired session) these
// legitimately fail and surface as generic `TurnkeyError: Failed to fetch …`.
// The kit already handles these internally (triggers logout on SESSION_EXPIRED),
// so they are noise rather than actionable errors.
const BENIGN_TURNKEY_MESSAGES = new Set([
  "Failed to fetch wallets",
  "Failed to fetch user",
]);

const BENIGN_TURNKEY_CODES = new Set([
  "NO_SESSION_FOUND",
  "SESSION_EXPIRED",
  "CLIENT_NOT_INITIALIZED",
]);

export default function TurnkeyProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const organizationId = process.env.NEXT_PUBLIC_ORGANIZATION_ID;
  const authProxyConfigId = process.env.NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID;

  if (!organizationId || !authProxyConfigId) {
    return <>{children}</>;
  }

  const turnkeyConfig: TurnkeyProviderConfig = {
    organizationId,
    authProxyConfigId,
  };

  return (
    <TurnkeyProviderBase
      config={turnkeyConfig}
      callbacks={{
        onError: (error) => {
          const message = (error as { message?: string })?.message ?? "";
          const code = (error as { code?: string })?.code ?? "";
          if (
            BENIGN_TURNKEY_MESSAGES.has(message) ||
            BENIGN_TURNKEY_CODES.has(code)
          ) {
            console.debug("Turnkey (benign):", code || message);
            return;
          }
          console.error("Turnkey error:", error);
        },
      }}
    >
      {children}
    </TurnkeyProviderBase>
  );
}
