/**
 * signer-cli.ts
 *
 * Client for go-livepeer's CLI API (port 4935 by default).
 * This is the same port that livepeer_cli connects to.
 * Must only be called server-side; the port is bound to 127.0.0.1 on the host.
 */

export function getSignerCliUrl(): string {
  if (process.env.SIGNER_CLI_URL) return process.env.SIGNER_CLI_URL;
  return "http://localhost:4935";
}

export interface SenderInfo {
  deposit: string;
  withdrawRound: string;
  reserve: {
    fundsRemaining: string;
    claimedInCurrentRound: string;
  };
}

export interface SignerCliStatus {
  reachable: boolean;
  senderInfo: SenderInfo | null;
  ethBalance: string | null;
  tokenBalance: string | null;
  fetchedAt: string;
}

async function cliGet<T>(path: string): Promise<T> {
  const url = `${getSignerCliUrl()}${path}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`CLI GET ${path} failed: ${res.status}`);
  }
  const text = await res.text();
  if (!text) throw new Error(`CLI GET ${path} returned empty body`);
  return JSON.parse(text) as T;
}

/**
 * GET /senderInfo — returns deposit, reserve, and withdraw round.
 * This is what livepeer_cli uses to show gateway payment state.
 */
export async function getSenderInfo(): Promise<SenderInfo | null> {
  try {
    const raw = await cliGet<Record<string, unknown>>("/senderInfo");
    // Normalize: go-livepeer may return PascalCase or camelCase field names
    const deposit = String(raw.deposit ?? raw.Deposit ?? "0");
    const withdrawRound = String(raw.withdrawRound ?? raw.WithdrawRound ?? "0");
    const reserve = (raw.reserve ?? raw.Reserve) as
      | Record<string, unknown>
      | undefined;
    return {
      deposit,
      withdrawRound,
      reserve: {
        fundsRemaining: String(
          reserve?.fundsRemaining ?? reserve?.FundsRemaining ?? "0"
        ),
        claimedInCurrentRound: String(
          reserve?.claimedInCurrentRound ?? reserve?.ClaimedInCurrentRound ?? "0"
        ),
      },
    };
  } catch {
    return null;
  }
}

/**
 * GET /ethBalance — ETH balance of the signer account.
 */
export async function getEthBalance(): Promise<string | null> {
  try {
    const raw = await cliGet<unknown>("/ethBalance");
    return String(raw);
  } catch {
    return null;
  }
}

/**
 * GET /tokenBalance — LPT token balance of the signer account.
 */
export async function getTokenBalance(): Promise<string | null> {
  try {
    const raw = await cliGet<unknown>("/tokenBalance");
    return String(raw);
  } catch {
    return null;
  }
}

/**
 * Fetch all live CLI state in parallel.
 */
export async function fetchSignerCliStatus(): Promise<SignerCliStatus> {
  const [senderInfo, ethBalance, tokenBalance] = await Promise.all([
    getSenderInfo(),
    getEthBalance(),
    getTokenBalance(),
  ]);
  return {
    reachable: senderInfo !== null,
    senderInfo,
    ethBalance,
    tokenBalance,
    fetchedAt: new Date().toISOString(),
  };
}
