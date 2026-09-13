/**
 * Standalone proving-performance benchmark. Generates exactly ONE real
 * groth16 proof end-to-end (the same generateArgs -> prove pipeline the
 * browser SDK and the integration tests use) and prints wall-clock timing
 * for each phase. Run directly with tsx -- NOT through vitest or
 * node:test's worker isolation -- and in the background, since a single
 * proof can take minutes on a memory-constrained machine:
 *
 *   NODE_OPTIONS="--max-old-space-size=8192" npx tsx scripts/bench-proof.ts \
 *     >> .cache/bench-proof.log 2>&1 &
 *
 * Reads the same public/ zk artifacts and upstream test signing key as
 * scripts/lib/generateProof.ts. Never writes proof output anywhere tracked.
 */
import { generateTestProof } from "./lib/generateProof";

async function main() {
  const label = process.env.BENCH_LABEL ?? "run";
  console.log(`[bench:${label}] pid=${process.pid} node=${process.version}`);
  console.log(`[bench:${label}] NODE_OPTIONS=${process.env.NODE_OPTIONS ?? "(unset)"}`);
  console.log(`[bench:${label}] free heap before: ${JSON.stringify(process.memoryUsage())}`);

  const nullifierSeed = "424242";
  const signal = "1";

  const t0 = performance.now();
  const proof = await generateTestProof({ nullifierSeed, signal });
  const t1 = performance.now();

  console.log(`[bench:${label}] TOTAL fullProve wall time: ${((t1 - t0) / 1000).toFixed(1)}s`);
  console.log(`[bench:${label}] ageAbove18=${proof.ageAbove18} nullifier=${proof.nullifier.slice(0, 12)}...`);
  console.log(`[bench:${label}] memory after: ${JSON.stringify(process.memoryUsage())}`);

  // snarkjs leaves its bn128 curve worker pool running; terminate so the
  // process actually exits instead of hanging.
  const g = globalThis as unknown as { curve_bn128?: { terminate: () => Promise<void> } | null };
  if (g.curve_bn128) await g.curve_bn128.terminate();
  process.exit(0);
}

main().catch((err) => {
  console.error(`[bench] FAILED:`, err);
  process.exit(1);
});
