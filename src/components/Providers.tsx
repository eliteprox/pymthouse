"use client";

import { SessionProvider } from "next-auth/react";
import PrivyProviderWrapper from "./PrivyProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PrivyProviderWrapper>{children}</PrivyProviderWrapper>
    </SessionProvider>
  );
}
