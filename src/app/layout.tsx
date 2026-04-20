import type { Metadata } from "next";
import "@turnkey/react-wallet-kit/styles.css";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "pymthouse - Identity & Payment Infrastructure",
  description:
    "Whitelabel identity and payment infrastructure for Livepeer orchestrators",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-zinc-950 text-zinc-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
