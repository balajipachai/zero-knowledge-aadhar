import { createRequire } from "node:module";
import { encodeAbiParameters, keccak256, pad } from "viem";

// See src/server/zk/verifyProof.ts for why this package is required rather
// than imported: a CJS/ESM named-export interop gap under Next's server
// runtime otherwise resolves these to `undefined`.
const { hash } = createRequire(import.meta.url)("@anon-aadhaar/core") as {
  hash: (message: bigint) => string;
};

/**
 * Converts an `applications`/`drafts` row id (a Postgres uuid, 16 bytes) into
 * the bytes32 `appId` the contract and the signal formula both key on. Left-
 * padding with zero bytes is deterministic and matches whatever the relayer
 * later passes on-chain, so this function must be the *only* place either
 * side derives an appId from a uuid.
 */
export function appIdToBytes32(applicationId: string): `0x${string}` {
  const hex = `0x${applicationId.replace(/-/g, "")}` as `0x${string}`;
  if (hex.length !== 34) {
    throw new Error(`applicationId is not a valid uuid: ${applicationId}`);
  }
  return pad(hex, { size: 32 });
}

export type SignalParams = {
  chainId: number;
  registryAddress: `0x${string}`;
  cycleId: `0x${string}`;
  applicationId: string;
};

/**
 * The raw uint256 signal for one application, computed identically to
 * `GrantCycleRegistry.signalFor` on-chain:
 *   uint256(keccak256(abi.encode(chainid, address(this), cycleId, appId)))
 * Binding to chainId + the registry's own address means a proof generated
 * for one deployment can never be replayed against a different network or a
 * different cycle's registry, even if appIds collided.
 */
export function signalFor(params: SignalParams): bigint {
  const appId = appIdToBytes32(params.applicationId);
  const encoded = encodeAbiParameters(
    [
      { type: "uint256" },
      { type: "address" },
      { type: "bytes32" },
      { type: "bytes32" },
    ],
    [BigInt(params.chainId), params.registryAddress, params.cycleId, appId],
  );
  return BigInt(keccak256(encoded));
}

/**
 * The value that must equal the proof's `signalHash` public signal. Uses
 * `@anon-aadhaar/core`'s own `hash()` (not a reimplementation) so this is
 * bit-for-bit identical to whatever the browser SDK computed when the
 * applicant generated the proof with `signal={signalFor(...).toString()}`.
 */
export function signalHashFor(params: SignalParams): string {
  return hash(signalFor(params));
}
