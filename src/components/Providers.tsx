"use client";

import { SessionProvider } from "next-auth/react";
import TurnkeyProviderWrapper from "./TurnkeyProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TurnkeyProviderWrapper>{children}</TurnkeyProviderWrapper>
    </SessionProvider>
  );
}
