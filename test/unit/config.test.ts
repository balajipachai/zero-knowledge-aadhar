import { afterEach, describe, expect, it } from "vitest";
import { getConfig, resetConfigForTests } from "@/src/server/config";

const REQUIRED_ENV = {
  DATABASE_URL: "postgresql://localhost:5432/zk_aadhaar_test",
  SESSION_SECRET: "x".repeat(32),
  ANON_AADHAAR_MODE: "test",
  CYCLE_ID: `0x${"1".repeat(64)}`,
  NULLIFIER_SEED: "123456789",
  CHAIN_ID: "31337",
  RPC_URL: "http://127.0.0.1:8545",
  REGISTRY_ADDRESS: `0x${"2".repeat(40)}`,
  RELAYER_PRIVATE_KEY: `0x${"3".repeat(64)}`,
};

function setEnv(overrides: Record<string, string | undefined>) {
  const merged = { ...REQUIRED_ENV, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("getConfig", () => {
  afterEach(() => {
    resetConfigForTests();
    for (const key of Object.keys(REQUIRED_ENV)) {
      delete process.env[key];
    }
  });

  it("parses a complete, valid environment", () => {
    setEnv({});
    const cfg = getConfig();
    expect(cfg.anonAadhaarMode).toBe("test");
    expect(cfg.nullifierSeed).toBe(123456789n);
    expect(cfg.chainId).toBe(31337);
  });

  it("fails closed when a required var is missing", () => {
    setEnv({ REGISTRY_ADDRESS: undefined });
    expect(() => getConfig()).toThrow();
  });

  it("fails closed when ANON_AADHAAR_MODE is not test|production", () => {
    setEnv({ ANON_AADHAAR_MODE: "staging" });
    expect(() => getConfig()).toThrow();
  });

  it("fails closed on a malformed address", () => {
    setEnv({ REGISTRY_ADDRESS: "not-an-address" });
    expect(() => getConfig()).toThrow();
  });

  it("fails closed on a malformed private key", () => {
    setEnv({ RELAYER_PRIVATE_KEY: "0x1234" });
    expect(() => getConfig()).toThrow();
  });

  it("applies sensible defaults for optional operational knobs", () => {
    setEnv({});
    const cfg = getConfig();
    expect(cfg.cycleSlots).toBe(60);
    expect(cfg.draftTtlMinutes).toBe(30);
  });
});
