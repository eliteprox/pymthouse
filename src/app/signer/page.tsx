export const dynamic = "force-dynamic";

import { db } from "@/db/index";
import { signerConfig, streamSessions, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import DashboardLayout from "@/components/DashboardLayout";
import SignerControlPanel from "@/components/SignerControlPanel";
import SignerConfigForm from "@/components/SignerConfigForm";
import SignerLogs from "@/components/SignerLogs";

function formatWei(wei: string | null): string {
  if (!wei || wei === "0") return "0 WEI";
  const value = BigInt(wei);
  const eth = Number(value) / 1e18;
  if (eth < 0.001) return `${wei} WEI`;
  return `${eth.toFixed(6)} ETH`;
}

export default function SignerPage() {
  const signer = db
    .select()
    .from(signerConfig)
    .where(eq(signerConfig.id, "default"))
    .get();

  if (!signer) {
    return (
      <DashboardLayout>
        <div className="text-center py-16 text-zinc-500">
          Signer config not initialized. Restart the app.
        </div>
      </DashboardLayout>
    );
  }

  const activeSessions = db
    .select()
    .from(streamSessions)
    .where(eq(streamSessions.status, "active"))
    .all();

  const allSessions = db.select().from(streamSessions).all();
  const allTxns = db.select().from(transactions).all();

  let totalFeeWei = 0n;
  for (const s of allSessions) {
    totalFeeWei += BigInt(s.totalFeeWei);
  }

  const statusColors: Record<string, string> = {
    running: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    stopped: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    error: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  // Read env vars for display (these drive docker-compose)
  const envEthRpc =
    process.env.ETH_RPC_URL || "http://nyc-router.eliteencoder.net:3517";
  const envNetwork = process.env.SIGNER_NETWORK || "arbitrum-one-mainnet";
  const envEthAddr = process.env.SIGNER_ETH_ADDR || "";

  return (
    <DashboardLayout>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-2xl font-bold tracking-tight">Signer Admin</h2>
          <span
            className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${
              statusColors[signer.status] || statusColors.stopped
            }`}
          >
            {signer.status}
          </span>
        </div>
        <p className="text-zinc-500 font-mono text-sm">
          {signer.ethAddress || "No address -- signer not connected"}
        </p>
      </div>

      {signer.lastError && (
        <div className="mb-6 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          <span className="font-medium">Last error:</span> {signer.lastError}
        </div>
      )}

      {/* go-livepeer container config -- mirrors what the container shows */}
      <div className="border border-zinc-800 rounded-xl bg-zinc-900/30 mb-8 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="font-semibold text-zinc-200">
            go-livepeer Remote Signer
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Live container configuration
          </p>
        </div>
        <div className="font-mono text-sm">
          <ConfigRow label="Network" value={envNetwork} />
          <ConfigRow label="HttpAddr" value="0.0.0.0:8935" />
          <ConfigRow label="CliAddr" value="0.0.0.0:4935" />
          <ConfigRow label="EthUrl" value={envEthRpc} />
          <ConfigRow
            label="EthAcctAddr"
            value={signer.ethAddress || envEthAddr || "(auto-generated)"}
            mono
          />
          <ConfigRow label="EthPassword" value="***" />
          <ConfigRow label="Datadir" value="/data" />
          <ConfigRow label="RemoteSigner" value="true" />
          <ConfigRow label="Verbosity" value="99" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Deposit" value={formatWei(signer.depositWei)} />
        <StatCard label="Reserve" value={formatWei(signer.reserveWei)} />
        <StatCard
          label="Active Streams"
          value={activeSessions.length.toString()}
          color="text-emerald-400"
        />
        <StatCard label="Total Streams" value={allSessions.length.toString()} />
        <StatCard label="Total Volume" value={formatWei(totalFeeWei.toString())} />
        <StatCard label="Transactions" value={allTxns.length.toString()} />
        <StatCard
          label="Platform Cut"
          value={`${signer.defaultCutPercent}%`}
        />
        <StatCard label="Billing Mode" value={signer.billingMode} />
      </div>

      {/* Control plane */}
      <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30 mb-8">
        <SignerControlPanel currentStatus={signer.status} />
      </div>

      {/* Container logs */}
      <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30 mb-8">
        <SignerLogs />
      </div>

      {/* pymthouse configuration */}
      <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30">
        <SignerConfigForm
          config={{
            name: signer.name,
            network: signer.network,
            ethRpcUrl: signer.ethRpcUrl,
            defaultCutPercent: signer.defaultCutPercent,
            billingMode: signer.billingMode,
            naapApiKey: signer.naapApiKey,
          }}
        />
      </div>
    </DashboardLayout>
  );
}

function ConfigRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex border-b border-zinc-800/50 last:border-b-0">
      <div className="w-40 shrink-0 px-5 py-2.5 text-zinc-500 bg-zinc-900/50">
        {label}
      </div>
      <div
        className={`flex-1 px-5 py-2.5 text-zinc-300 ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color = "text-zinc-200",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/30">
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-sm font-medium ${color}`}>{value}</p>
    </div>
  );
}
