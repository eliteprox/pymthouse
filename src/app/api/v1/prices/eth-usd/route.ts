import { NextResponse } from "next/server";
import { getEthUsdOracle } from "@/lib/prices/eth-usd-oracle";

export async function GET() {
  const ethUsd = await getEthUsdOracle();

  return NextResponse.json(
    { ethUsd },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=30",
      },
    },
  );
}
