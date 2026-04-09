import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db/index";
import { signerConfig } from "@/db/schema";
import { getAuthorizedProviderApp } from "@/lib/provider-apps";

async function getOrCreateSignerConfig(appId: string) {
  const existingRows = await db
    .select()
    .from(signerConfig)
    .where(eq(signerConfig.clientId, appId))
    .limit(1);
  const existing = existingRows[0];

  if (existing) return existing;

  const created = {
    id: uuidv4(),
    clientId: appId,
    name: "provider signer",
    signerUrl: "",
    signerApiKey: null,
    ethAddress: null,
    ethAcctAddr: null,
    network: "arbitrum-one-mainnet",
    ethRpcUrl: "https://arb1.arbitrum.io/rpc",
    signerPort: 8081,
    status: "stopped",
    depositWei: "0",
    reserveWei: "0",
    defaultCutPercent: 15,
    billingMode: "delegated",
    naapApiKey: null,
    remoteDiscovery: 0,
    orchWebhookUrl: null,
    liveAICapReportInterval: null,
    lastStartedAt: null,
    lastError: null,
    createdAt: new Date().toISOString(),
  };

  await db.insert(signerConfig).values(created);
  return created;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getAuthorizedProviderApp(id);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ signer: await getOrCreateSignerConfig(id) });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getAuthorizedProviderApp(id);
  if (!auth) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const current = await getOrCreateSignerConfig(id);
  const body = await request.json();

  await db
    .update(signerConfig)
    .set({
      name: body.name ?? current.name,
      signerUrl: body.signerUrl ?? current.signerUrl,
      signerApiKey: body.signerApiKey ?? current.signerApiKey,
      network: body.network ?? current.network,
      ethRpcUrl: body.ethRpcUrl ?? current.ethRpcUrl,
      ethAcctAddr: body.ethAcctAddr ?? current.ethAcctAddr,
      signerPort: body.signerPort ?? current.signerPort,
      defaultCutPercent: body.defaultCutPercent ?? current.defaultCutPercent,
      billingMode: body.billingMode ?? current.billingMode,
      naapApiKey: body.naapApiKey ?? current.naapApiKey,
      remoteDiscovery:
        body.remoteDiscovery === undefined
          ? current.remoteDiscovery
          : body.remoteDiscovery
            ? 1
            : 0,
      orchWebhookUrl: body.orchWebhookUrl ?? current.orchWebhookUrl,
      liveAICapReportInterval: body.liveAICapReportInterval ?? current.liveAICapReportInterval,
    })
    .where(eq(signerConfig.id, current.id));

  return NextResponse.json({ success: true });
}
