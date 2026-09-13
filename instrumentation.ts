/**
 * Next.js instrumentation hook: `register()` runs once when the server
 * process starts, before it serves any request. We use it to run the
 * boot-time chain-invariant check (src/server/boot.ts) so a
 * misconfigured/stale REGISTRY_ADDRESS is caught at startup instead of on
 * an applicant's first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runBootChecks } = await import("@/src/server/boot");
    await runBootChecks();
  }
}
