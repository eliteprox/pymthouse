"use client";

import { createContext, useContext, ReactNode } from "react";

const MarketplaceLayoutContext = createContext<boolean>(false);

export function MarketplaceLayoutProvider({
  insideDashboard,
  children,
}: {
  insideDashboard: boolean;
  children: ReactNode;
}) {
  return (
    <MarketplaceLayoutContext.Provider value={insideDashboard}>
      {children}
    </MarketplaceLayoutContext.Provider>
  );
}

export function useInsideDashboard() {
  return useContext(MarketplaceLayoutContext);
}
