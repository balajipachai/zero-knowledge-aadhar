import { checkChainInvariants } from "./chain/registry";

// Success is cached forever: the invariants this checks (nullifierSeed,
// cycleId, relayer, storedPublicKeyHash) are all immutable on-chain state
// for a given deployment, so once true, it stays true for the life of the
// process. Failure is deliberately NOT cached the same way -- an RPC blip,
// a node restarting, a transient network partition -- none of those should
// brick intake until the process is restarted. Instead, every call after a
// failure re-runs the check, with concurrent callers deduped into a single
// in-flight request so an outage doesn't cause a thundering herd against
// the RPC.
let succeededOnce = false;
let inFlight: Promise<{ ok: true } | { ok: false; reason: string }> | undefined;

async function checkOnce(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const result = await checkChainInvariants();
  if (result.ok) {
    succeededOnce = true;
    return { ok: true };
  }
  console.error("BOOT CHECK FAILED: chain invariants do not match config", {
    reason: result.reason,
  });
  return { ok: false, reason: result.reason };
}

/**
 * Runs once at process startup (see instrumentation.ts's `register()`).
 * Not the only place this ever runs, though: see `assertChainInvariantsOk`,
 * which re-checks on demand if this hasn't run yet (e.g. a test harness
 * that imports route handlers directly) or if it previously failed.
 */
export async function runBootChecks(): Promise<void> {
  await checkOnce();
}

export function getBootStatus(): { checked: boolean; ok: boolean } {
  return { checked: succeededOnce || inFlight !== undefined, ok: succeededOnce };
}

/** Called from the intake routes. Fails closed if invariants don't hold,
 * but -- unlike a naive "checked once, cache forever" gate -- a failure
 * here is never permanent: the next call re-checks (deduped against any
 * other concurrent caller) rather than remembering the outage forever. */
export async function assertChainInvariantsOk(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  if (succeededOnce) return { ok: true };
  if (!inFlight) {
    inFlight = checkOnce().finally(() => {
      inFlight = undefined;
    });
  }
  return inFlight;
}
