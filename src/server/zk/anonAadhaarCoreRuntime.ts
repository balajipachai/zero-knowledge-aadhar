/**
 * Loads `@anon-aadhaar/core`'s real CJS exports at actual Node runtime,
 * bypassing bundler static analysis entirely.
 *
 * History: `createRequire(import.meta.url)("@anon-aadhaar/core")` (a
 * literal specifier passed to a call the bundler's parser can recognize)
 * works fine under `next dev`, under plain Node/tsx (scripts/,
 * contracts/test/), and under Vitest's unit-test project -- but under
 * Turbopack's PRODUCTION build (`next build` + `next start`, exactly what
 * the integration test harness runs), the literal call site gets
 * statically rewritten and the result silently becomes a bare `{}`, making
 * every named export `undefined`. This was invisible until real proofs
 * were fast enough to actually exercise the integration suite: the
 * boot-time chain-invariant check failed with
 * "expected for ANON_AADHAAR_MODE=test (undefined)", traced back to
 * `expectedPubkeyHash()` destructuring `{}`. Listing the package in
 * `next.config.ts`'s `serverExternalPackages` does not avoid this either
 * (same literal-call rewrite fires regardless of externality).
 *
 * The fix: obtain `require` via indirect eval. `eval("require")` cannot be
 * statically analyzed by any bundler -- the callee is a computed
 * expression, not the literal identifier `require`/`createRequire` a
 * parser pattern-matches on -- so it reliably returns Node's real,
 * unbundled `require` function at runtime, in both dev and production.
 * This is the one place in the repo that loads this package; every other
 * module (verifyProof.ts, signal.ts, submit.ts) imports the bindings it
 * needs from here instead of calling `createRequire` itself.
 */
export type AnonAadhaarCoreExports = {
  productionPublicKeyHash: string;
  testPublicKeyHash: string;
  hash: (message: bigint) => string;
  packGroth16Proof: (proof: unknown) => string[];
};

let cached: AnonAadhaarCoreExports | undefined;

export function anonAadhaarCore(): AnonAadhaarCoreExports {
  if (!cached) {
    // eslint-disable-next-line no-eval -- see module doc comment above.
    const dynamicRequire = eval("require") as NodeRequire;
    cached = dynamicRequire("@anon-aadhaar/core") as AnonAadhaarCoreExports;
  }
  return cached;
}
