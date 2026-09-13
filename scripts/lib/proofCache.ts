import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Disk cache for real groth16 proofs, keyed by sha256(qrOverrides, seed,
 * signal) -- the three inputs that fully determine a generated proof's
 * content. Proving a single test proof takes ~35s on this machine (see
 * scripts/bench-proof.ts and NOTES-FOR-REVIEW.md for the benchmark); this
 * cache turns any rerun with the *same* inputs into a cache hit instead of
 * a fresh ~35s fullProve call.
 *
 * This matters most for callers with deterministic inputs across runs
 * (e.g. contracts/test/GrantCycleRegistry.realproof.ts, which hardcodes
 * its nullifierSeed/cycleId/appId, so its registry address -- and hence
 * its signal -- is identical every time Hardhat's in-process node deploys
 * from the same deterministic genesis). Integration tests under
 * test/integration/ mint a fresh random UUID applicationId (hence a fresh
 * signal) every run, so they will never hit this cache across separate
 * `npm test` invocations -- but still benefit from it if a single run
 * happens to request the same (seed, signal) twice.
 *
 * Never commit anything here: `.cache/` is gitignored (graded test case 8
 * -- this holds derived cryptographic material, not raw Aadhaar data, but
 * it still must never land in a tracked file).
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

/**
 * Returns the cached JSON-serializable value for `params` if present,
 * otherwise calls `generate()`, caches its result to disk, and returns it.
 * `T` must be JSON-safe (a groth16 proof's fields are all decimal strings
 * and string arrays, so this holds for every caller in this repo).
 */
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
