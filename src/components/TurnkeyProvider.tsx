"use client";

import {
  TurnkeyProvider as TurnkeyProviderBase,
  type TurnkeyProviderConfig,
} from "@turnkey/react-wallet-kit";

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
          console.error("Turnkey error:", error);
        },
      }}
    >
      {children}
    </TurnkeyProviderBase>
  );
}
