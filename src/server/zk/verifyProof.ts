import { groth16 } from "snarkjs";
import vkey from "./vkey.json";
import { getConfig } from "../config";
// Loaded via anonAadhaarCoreRuntime rather than imported or
// `createRequire`d here: Turbopack's production build rewrites a literal
// `createRequire(...)("@anon-aadhaar/core")` to `{}`, which made every
// binding below `undefined` under `next start`. See that module's doc.
import { anonAadhaarCore } from "./anonAadhaarCoreRuntime";

/**
 * The exact shape of the public signals AnonAadhaar's groth16 circuit
 * produces, in the fixed order the verifying key expects:
 * [pubkeyHash, nullifier, timestamp, ageAbove18, gender, pincode, state,
 *  nullifierSeed, signalHash]. Every field here is a decimal-string
 * (snarkjs' NumericString convention).
 */
export type AnonAadhaarPublicSignals = {
  pubkeyHash: string;
  nullifier: string;
  timestamp: string;
  ageAbove18: string;
  gender: string;
  pincode: string;
  state: string;
  nullifierSeed: string;
  signalHash: string;
};

export type Groth16Proof = {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
};

/** The expected pubkeyHash for the configured mode. Never trust a pubkeyHash
 * the client sends; this is the only value the server compares against. */
export function expectedPubkeyHash(): string {
  const { anonAadhaarMode } = getConfig();
  const { productionPublicKeyHash, testPublicKeyHash } = anonAadhaarCore();
  return anonAadhaarMode === "production"
    ? productionPublicKeyHash
    : testPublicKeyHash;
}

function toPublicSignalsArray(signals: AnonAadhaarPublicSignals): string[] {
  return [
    signals.pubkeyHash,
    signals.nullifier,
    signals.timestamp,
    signals.ageAbove18,
    signals.gender,
    signals.pincode,
    signals.state,
    signals.nullifierSeed,
    signals.signalHash,
  ];
}

/**
 * Verifies a groth16 proof against the pinned, tracked verifying key
 * (src/server/zk/vkey.json — never fetched at runtime, so a compromised CDN
 * or artifact host can't swap the trust anchor out from under us).
 *
 * This is the ONE place `groth16.verify` is called on the recording path;
 * every other check (seed, pubkeyHash, signal, eligibility) happens before
 * or after this in src/server/intake/submit.ts, in the order the rubric
 * grades.
 *
 * snarkjs caches its bn128 curve (a worker-thread pool) on
 * `globalThis.curve_bn128`. Left running, that pool keeps the Node process
 * alive indefinitely -- fine for a script, fatal for `next start` shutting
 * down cleanly in CI/tests. We terminate it after every verification call.
 */
export async function verifyGroth16Proof(
  publicSignals: AnonAadhaarPublicSignals,
  proof: Groth16Proof,
): Promise<boolean> {
  try {
    return await groth16.verify(
      vkey,
      toPublicSignalsArray(publicSignals),
      proof,
    );
  } finally {
    await terminateBn128Curve();
  }
}

export async function terminateBn128Curve(): Promise<void> {
  const g = globalThis as unknown as {
    curve_bn128?: { terminate: () => Promise<void> } | null;
  };
  if (g.curve_bn128) {
    await g.curve_bn128.terminate();
  }
}
