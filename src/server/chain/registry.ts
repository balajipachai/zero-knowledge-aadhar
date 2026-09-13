import {
  createPublicClient,
  createWalletClient,
  http,
  zeroHash,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getConfig } from "../config";
import { expectedPubkeyHash } from "../zk/verifyProof";
import registryAbi from "./abi/GrantCycleRegistry.json";
import anonAadhaarAbi from "./abi/AnonAadhaar.json";

let publicClient: ReturnType<typeof createPublicClient> | undefined;
let walletClient: ReturnType<typeof createWalletClient> | undefined;

function chain(chainId: number) {
  // Minimal inline chain definition -- avoids depending on viem/chains'
  // list matching whatever `CHAIN_ID` the deployment actually used (a local
  // Hardhat node reports whatever chainId its config says, not necessarily
  // one of viem's presets).
  return {
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [getConfig().rpcUrl] } },
  } as const;
}

export function getPublicClient() {
  if (!publicClient) {
    const cfg = getConfig();
    publicClient = createPublicClient({
      chain: chain(cfg.chainId),
      transport: http(cfg.rpcUrl),
    });
  }
  return publicClient;
}

export function getRelayerWalletClient() {
  if (!walletClient) {
    const cfg = getConfig();
    const account = privateKeyToAccount(cfg.relayerPrivateKey);
    walletClient = createWalletClient({
      account,
      chain: chain(cfg.chainId),
      transport: http(cfg.rpcUrl),
    });
  }
  return walletClient;
}

export function getRelayerAddress(): Address {
  return privateKeyToAccount(getConfig().relayerPrivateKey).address;
}

export const GrantCycleRegistryAbi = registryAbi;
export const AnonAadhaarAbi = anonAadhaarAbi;

async function readRegistry<T>(functionName: string): Promise<T> {
  const cfg = getConfig();
  return getPublicClient().readContract({
    address: cfg.registryAddress,
    abi: GrantCycleRegistryAbi,
    functionName,
  }) as Promise<T>;
}

let cachedWindow: { opensAt: bigint; closesAt: bigint } | undefined;

/** `opensAt`/`closesAt` are immutable on the registry contract, so once
 * read for a given deployment they never change -- safe to cache for the
 * life of the process. */
export async function getCycleWindow(): Promise<{
  opensAt: bigint;
  closesAt: bigint;
}> {
  if (!cachedWindow) {
    const [opensAt, closesAt] = await Promise.all([
      readRegistry<bigint>("opensAt"),
      readRegistry<bigint>("closesAt"),
    ]);
    cachedWindow = { opensAt, closesAt };
  }
  return cachedWindow;
}

export function resetChainCachesForTests(): void {
  cachedWindow = undefined;
  publicClient = undefined;
  walletClient = undefined;
}

/** Reads whether a given nullifier has already been used on-chain, for the
 * defense-in-depth duplicate check alongside the DB lookup. Returns the
 * appId that used it, or the zero bytes32 if unused. */
export async function onChainNullifierUsedBy(nullifier: bigint): Promise<Hex> {
  const cfg = getConfig();
  return getPublicClient().readContract({
    address: cfg.registryAddress,
    abi: GrantCycleRegistryAbi,
    functionName: "nullifierUsedBy",
    args: [nullifier],
  }) as Promise<Hex>;
}

// Use viem's own zeroHash constant rather than a hand-typed 64-zero
// literal -- a single miscounted zero here would silently make every
// nullifier look "already used" (see git history / NOTES-FOR-REVIEW.md).
export function isZeroBytes32(value: Hex): boolean {
  return value.toLowerCase() === zeroHash.toLowerCase();
}

export type AnchorResult =
  | { status: "anchored"; txHash: Hex }
  | { status: "pending"; reason: string };

/**
 * Sends `recordApplication` as the relayer and waits for a receipt. The
 * contract re-verifies everything independently (see
 * GrantCycleRegistry.recordApplication) -- this is not a rubber stamp of
 * the off-chain decision, it's the second, adversarial check.
 */
export async function anchorApplication(params: {
  appId: Hex;
  nullifier: bigint;
  timestamp: bigint;
  revealArray: [bigint, bigint, bigint, bigint];
  groth16Proof: [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
  ];
}): Promise<AnchorResult> {
  const cfg = getConfig();
  const wallet = getRelayerWalletClient();
  try {
    const txHash = await wallet.writeContract({
      address: cfg.registryAddress,
      abi: GrantCycleRegistryAbi,
      functionName: "recordApplication",
      args: [
        params.appId,
        params.nullifier,
        params.timestamp,
        params.revealArray,
        params.groth16Proof,
      ],
      chain: null,
      account: wallet.account!,
    });
    // Bounded wait: an RPC that never confirms (a stuck node, a dropped
    // connection) must not hang this request forever. On timeout, the
    // catch below turns it into `{status: 'pending', ...}` just like any
    // other failure -- scripts/reconcile-anchors.ts picks it up later.
    const receipt = await getPublicClient().waitForTransactionReceipt({
      hash: txHash,
      timeout: 90_000,
    });
    if (receipt.status !== "success") {
      return { status: "pending", reason: "transaction reverted on-chain" };
    }
    return { status: "anchored", txHash };
  } catch (err) {
    return {
      status: "pending",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export type InvariantCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Boot-time invariant check. Confirms the on-chain registry this deployment
 * points at actually matches our own configuration -- the nullifier seed,
 * the cycle id, the relayer address, and (transitively, via the registry's
 * `anonAadhaar` address) the AnonAadhaar public-key hash for our configured
 * mode. If any of these drift (wrong network, stale REGISTRY_ADDRESS after
 * a redeploy, relayer rotated on-chain but not in env, ...) intake refuses
 * to serve requests rather than silently verifying proofs against the wrong
 * anchor.
 */
export async function checkChainInvariants(): Promise<InvariantCheckResult> {
  const cfg = getConfig();

  try {
    const [onChainSeed, onChainCycleId, onChainRelayer, anonAadhaarAddress] =
      await Promise.all([
        readRegistry<bigint>("nullifierSeed"),
        readRegistry<Hex>("cycleId"),
        readRegistry<Address>("relayer"),
        readRegistry<Address>("anonAadhaar"),
      ]);

    if (onChainSeed !== cfg.nullifierSeed) {
      return {
        ok: false,
        reason: `on-chain nullifierSeed (${onChainSeed}) != config NULLIFIER_SEED (${cfg.nullifierSeed})`,
      };
    }
    if (onChainCycleId.toLowerCase() !== cfg.cycleId.toLowerCase()) {
      return {
        ok: false,
        reason: `on-chain cycleId (${onChainCycleId}) != config CYCLE_ID (${cfg.cycleId})`,
      };
    }
    if (onChainRelayer.toLowerCase() !== getRelayerAddress().toLowerCase()) {
      return {
        ok: false,
        reason: `on-chain relayer (${onChainRelayer}) != address derived from RELAYER_PRIVATE_KEY (${getRelayerAddress()})`,
      };
    }

    const onChainPubkeyHash = (await getPublicClient().readContract({
      address: anonAadhaarAddress,
      abi: AnonAadhaarAbi,
      functionName: "storedPublicKeyHash",
    })) as bigint;

    if (onChainPubkeyHash.toString() !== expectedPubkeyHash()) {
      return {
        ok: false,
        reason: `on-chain storedPublicKeyHash (${onChainPubkeyHash}) != expected for ANON_AADHAAR_MODE=${cfg.anonAadhaarMode} (${expectedPubkeyHash()})`,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: `failed to read chain invariants: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
