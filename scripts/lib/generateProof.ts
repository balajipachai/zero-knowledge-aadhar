import path from "node:path";
import { ArtifactsOrigin, generateArgs, init, prove } from "@anon-aadhaar/core";
import { buildTestQrData, getCertificatePem, type TestQrOverrides } from "./testFixtures";
import { withProofCache } from "./proofCache";

let initialized = false;

async function ensureInit(): Promise<void> {
  if (initialized) return;
  await init({
    wasmURL: path.join(process.cwd(), "public", "aadhaar-verifier.wasm"),
    zkeyURL: path.join(process.cwd(), "public", "circuit_final.zkey"),
    vkeyURL: path.join(process.cwd(), "public", "vkey.json"),
    artifactsOrigin: ArtifactsOrigin.local,
  });
  initialized = true;
}

export type GenerateTestProofParams = {
  nullifierSeed: string | bigint;
  /** Decimal-string uint256 signal, computed the same way the server
   * computes it (see src/server/zk/signal.ts's signalFor) so a proof
   * generated here binds to a specific applicationId exactly like a real
   * applicant's browser-generated proof would. */
  signal: string;
  overrides?: TestQrOverrides;
};

/**
 * Generates a REAL groth16 proof end-to-end, entirely in Node, using
 * upstream's test signing key (via testFixtures.ts) and our own local zk
 * artifacts (public/*.wasm, *.zkey) -- exactly the same
 * generateArgs -> prove pipeline the browser SDK runs, just off-device.
 * This is what integration tests use in place of a human scanning a QR
 * code; it is NEVER used on the recording path itself, only in test setup.
 */
export async function generateTestProof(params: GenerateTestProofParams) {
  return withProofCache(
    {
      nullifierSeed: params.nullifierSeed,
      signal: params.signal,
      overrides: params.overrides,
    },
    async () => {
      await ensureInit();
      const qrData = await buildTestQrData(params.overrides ?? {});
      const certificate = await getCertificatePem();

      const args = await generateArgs({
        qrData,
        certificateFile: certificate,
        nullifierSeed: params.nullifierSeed,
        fieldsToRevealArray: ["revealAgeAbove18"],
        signal: params.signal,
      });

      const pcd = await prove(args);
      return pcd.proof;
    },
  );
}
