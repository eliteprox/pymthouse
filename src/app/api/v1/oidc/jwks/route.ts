import { NextResponse } from "next/server";
import { getPublicJWKS } from "@/lib/oidc/jwks";

export async function GET(): Promise<NextResponse> {
  const jwks = await getPublicJWKS();

  return NextResponse.json(jwks, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/json",
    },
  });
}
