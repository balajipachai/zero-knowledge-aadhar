import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Disk cache for real groth16 proofs generated in contracts/ tests, keyed
 * by sha256(qrOverrides, seed, signal). Mirrors ../../scripts/lib/
 * proofCache.ts (duplicated rather than cross-imported -- see this
 * directory's other helper for why). GrantCycleRegistry.realproof.ts uses
 * a hardcoded nullifierSeed/cycleId/appId, so its registry address (and
 * hence its signal) is identical every run of Hardhat's in-process node
 * from the same deterministic genesis -- making this an actual cache hit
 * across `npx hardhat test` reruns, not just within one run.
 *
 * `.cache/` is gitignored; nothing here is ever committed.
 */

const CACHE_DIR = path.join(process.cwd(), ".cache", "proof-cache");

export type ProofCacheKeyParams = {
  nullifierSeed: string | bigint;
  signal: string;
  overrides?: Record<string, unknown>;
};

function cacheKey(params: ProofCacheKeyParams): string {
  const h = createHash("sha256");
  h.update(
    JSON.stringify({
      nullifierSeed: params.nullifierSeed.toString(),
      signal: params.signal,
      overrides: params.overrides ?? {},
    }),
  );
  return h.digest("hex");
}

export async function withProofCache<T>(
  params: ProofCacheKeyParams,
  generate: () => Promise<T>,
): Promise<T> {
  const key = cacheKey(params);
  const file = path.join(CACHE_DIR, `${key}.json`);

  if (existsSync(file)) {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as T;
  }

  const result = await generate();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, JSON.stringify(result));
  return result;
}
