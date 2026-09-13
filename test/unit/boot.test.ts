import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkChainInvariants = vi.fn();

vi.mock("@/src/server/chain/registry", () => ({
  checkChainInvariants: (...args: unknown[]) => checkChainInvariants(...args),
}));

describe("boot check failure caching", () => {
  beforeEach(() => {
    vi.resetModules();
    checkChainInvariants.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not cache a failure forever: a later success is reflected on the next call", async () => {
    checkChainInvariants
      .mockResolvedValueOnce({ ok: false, reason: "rpc unreachable" })
      .mockResolvedValueOnce({ ok: true });

    const { assertChainInvariantsOk } = await import("@/src/server/boot");

    const first = await assertChainInvariantsOk();
    expect(first).toEqual({ ok: false, reason: "rpc unreachable" });

    // A naive "checked once" cache would return the same failure forever.
    // This must re-check and now see the (simulated) recovered RPC.
    const second = await assertChainInvariantsOk();
    expect(second).toEqual({ ok: true });
    expect(checkChainInvariants).toHaveBeenCalledTimes(2);
  });

  it("caches success permanently: does not re-check once it has succeeded", async () => {
    checkChainInvariants.mockResolvedValue({ ok: true });

    const { assertChainInvariantsOk } = await import("@/src/server/boot");

    await assertChainInvariantsOk();
    await assertChainInvariantsOk();
    await assertChainInvariantsOk();

    expect(checkChainInvariants).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent callers into a single in-flight check", async () => {
    let resolve!: (value: { ok: true }) => void;
    checkChainInvariants.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const { assertChainInvariantsOk } = await import("@/src/server/boot");

    const a = assertChainInvariantsOk();
    const b = assertChainInvariantsOk();
    resolve({ ok: true });

    await Promise.all([a, b]);
    expect(checkChainInvariants).toHaveBeenCalledTimes(1);
  });
});
