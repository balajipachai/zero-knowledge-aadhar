import { defineConfig } from "vitest/config";

const rootDir = import.meta.dirname;

// Two projects, run separately (npm run test:unit / test:integration):
// - "unit": fast, no external services, mocks nothing on the recording
//   path (it doesn't touch the recording path at all -- pure functions:
//   schema, signal formula, config parsing).
// - "integration": HTTP against a real `next start`, a real local Hardhat
//   node, and the test Postgres DB, with real proofs generated in test
//   setup. See test/integration/globalSetup.ts.
export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["test/integration/**/*.test.ts"],
          globalSetup: ["test/integration/globalSetup.ts"],
          // Real proof generation is CPU/memory-heavy (~35s/proof standalone
          // -- see scripts/bench-proof.ts, NOTES-FOR-REVIEW.md); a slower or
          // more loaded machine than the one that benchmark ran on should
          // still finish rather than spuriously time out.
          testTimeout: 1_800_000,
          hookTimeout: 1_800_000,
          // Real proof generation is CPU-heavy (groth16 witness + MSM over
          // a large circuit); running integration files in parallel worker
          // processes would contend for the same CPU with no benefit.
          fileParallelism: false,
        },
      },
    ],
  },
});
