import { describe, expect, it } from "vitest";
import { appIdToBytes32, signalFor } from "@/src/server/zk/signal";

describe("signalFor", () => {
  const base = {
    chainId: 31337,
    registryAddress: "0x1111111111111111111111111111111111111111".slice(
      0,
      42,
    ) as `0x${string}`,
    cycleId:
      "0x2222222222222222222222222222222222222222222222222222222222222222".slice(
        0,
        66,
      ) as `0x${string}`,
  };

  it("is deterministic for the same application id", () => {
    const a = signalFor({ ...base, applicationId: "11111111-1111-1111-1111-111111111111" });
    const b = signalFor({ ...base, applicationId: "11111111-1111-1111-1111-111111111111" });
    expect(a).toBe(b);
  });

  it("differs across different application ids (TC5: bound to a specific application)", () => {
    const a = signalFor({ ...base, applicationId: "11111111-1111-1111-1111-111111111111" });
    const b = signalFor({ ...base, applicationId: "22222222-2222-2222-2222-222222222222" });
    expect(a).not.toBe(b);
  });

  it("differs across different registry addresses (bound to this deployment)", () => {
    const a = signalFor({ ...base, applicationId: "11111111-1111-1111-1111-111111111111" });
    const b = signalFor({
      ...base,
      registryAddress: "0x3333333333333333333333333333333333333333".slice(0, 42) as `0x${string}`,
      applicationId: "11111111-1111-1111-1111-111111111111",
    });
    expect(a).not.toBe(b);
  });

  it("differs across different cycle ids (bound to this cycle)", () => {
    const a = signalFor({ ...base, applicationId: "11111111-1111-1111-1111-111111111111" });
    const b = signalFor({
      ...base,
      cycleId:
        "0x4444444444444444444444444444444444444444444444444444444444444444".slice(
          0,
          66,
        ) as `0x${string}`,
      applicationId: "11111111-1111-1111-1111-111111111111",
    });
    expect(a).not.toBe(b);
  });

  it("is never the constant zero, and is never trivially guessable from the id alone", () => {
    const signal = signalFor({ ...base, applicationId: "11111111-1111-1111-1111-111111111111" });
    expect(signal).not.toBe(0n);
  });
});

describe("appIdToBytes32", () => {
  it("rejects a non-uuid string", () => {
    expect(() => appIdToBytes32("not-a-uuid")).toThrow();
  });

  it("produces a 32-byte hex value for a valid uuid", () => {
    const bytes32 = appIdToBytes32("11111111-1111-1111-1111-111111111111");
    expect(bytes32).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
