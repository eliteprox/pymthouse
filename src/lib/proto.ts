import protobuf from "protobufjs";
import path from "path";

let orchestratorInfoType: protobuf.Type | null = null;

async function loadProto(): Promise<protobuf.Type> {
  if (orchestratorInfoType) return orchestratorInfoType;

  const protoPath = path.resolve(process.cwd(), "proto/lp_rpc.proto");
  const root = await protobuf.load(protoPath);
  orchestratorInfoType = root.lookupType("net.OrchestratorInfo");
  return orchestratorInfoType;
}

export interface PriceInfo {
  pricePerUnit: number;
  pixelsPerUnit: number;
  capability?: number;
  constraint?: string;
}

export interface DecodedOrchestratorInfo {
  transcoder?: string;
  address?: Uint8Array;
  priceInfo?: PriceInfo;
  capabilitiesPrices?: PriceInfo[];
}

/**
 * Decode an OrchestratorInfo protobuf from base64-encoded bytes.
 * The gateway sends this as a base64 string in the JSON request body.
 */
export async function decodeOrchestratorInfo(
  orchestratorBytes: Buffer | Uint8Array | string
): Promise<DecodedOrchestratorInfo> {
  const type = await loadProto();

  let buf: Uint8Array;
  if (typeof orchestratorBytes === "string") {
    buf = Buffer.from(orchestratorBytes, "base64");
  } else {
    buf = orchestratorBytes;
  }

  const message = type.decode(buf);
  const obj = type.toObject(message, {
    longs: Number,
    bytes: Buffer,
    defaults: true,
  });

  return {
    transcoder: obj.transcoder || undefined,
    address: obj.address || undefined,
    priceInfo: obj.priceInfo
      ? {
          pricePerUnit: obj.priceInfo.pricePerUnit || 0,
          pixelsPerUnit: obj.priceInfo.pixelsPerUnit || 1,
          capability: obj.priceInfo.capability,
          constraint: obj.priceInfo.constraint,
        }
      : undefined,
    capabilitiesPrices: obj.capabilitiesPrices?.map(
      (p: Record<string, unknown>) => ({
        pricePerUnit: (p.pricePerUnit as number) || 0,
        pixelsPerUnit: (p.pixelsPerUnit as number) || 1,
        capability: p.capability as number | undefined,
        constraint: p.constraint as string | undefined,
      })
    ),
  };
}

/**
 * Calculate fee in wei from pixel count and price info.
 *
 * feeWei = pixels * pricePerUnit / pixelsPerUnit
 */
export function calculateFeeWei(
  pixels: bigint,
  pricePerUnit: bigint,
  pixelsPerUnit: bigint
): bigint {
  if (pixelsPerUnit === 0n) return 0n;
  return (pixels * pricePerUnit) / pixelsPerUnit;
}

/**
 * Calculate platform cut from fee.
 *
 * platformCutWei = feeWei * cutPercent / 100
 */
export function calculatePlatformCut(
  feeWei: bigint,
  cutPercent: number
): bigint {
  const cutBasis = BigInt(Math.round(cutPercent * 100));
  return (feeWei * cutBasis) / 10000n;
}

/**
 * For lv2v (live video-to-video) jobs without explicit InPixels,
 * calculate pixels from elapsed time.
 *
 * Default: 1280x720 @ 30fps = 27,648,000 pixels/sec
 */
export function calculateLv2vPixels(secondsElapsed: number): bigint {
  const PIXELS_PER_SEC = 1280 * 720 * 30; // 27,648,000
  return BigInt(Math.floor(PIXELS_PER_SEC * secondsElapsed));
}
