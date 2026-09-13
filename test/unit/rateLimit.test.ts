import { afterEach, describe, expect, it } from "vitest";
import { resetConfigForTests } from "@/src/server/config";
import { clientIpFromHeaders } from "@/src/server/rateLimit";

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

describe("clientIpFromHeaders", () => {
  afterEach(() => {
    resetConfigForTests();
    for (const key of Object.keys(REQUIRED_ENV)) delete process.env[key];
    delete process.env.TRUST_PROXY_IP_HEADER;
  });

  it("maps every caller to one shared bucket when TRUST_PROXY_IP_HEADER is unset", () => {
    setEnv({ TRUST_PROXY_IP_HEADER: undefined });
    const a = clientIpFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4" }));
    const b = clientIpFromHeaders(new Headers({ "x-forwarded-for": "9.9.9.9" }));
    expect(a).toBe(b);
    expect(a).toBe("shared");
  });

  it("ignores a client-supplied x-forwarded-for when it is not the trusted header", () => {
    setEnv({ TRUST_PROXY_IP_HEADER: undefined });
    const spoofed = clientIpFromHeaders(new Headers({ "x-forwarded-for": "evil-spoofed-ip" }));
    expect(spoofed).toBe("shared");
  });

  it("reads the configured header and buckets by its value once trusted", () => {
    setEnv({ TRUST_PROXY_IP_HEADER: "X-Forwarded-For" });
    const a = clientIpFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4" }));
    const b = clientIpFromHeaders(new Headers({ "x-forwarded-for": "9.9.9.9" }));
    expect(a).not.toBe(b);
    expect(a).toBe("1.2.3.4");
  });

  it("takes only the first hop of a comma-separated forwarded-for chain", () => {
    setEnv({ TRUST_PROXY_IP_HEADER: "X-Forwarded-For" });
    const ip = clientIpFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }));
    expect(ip).toBe("1.2.3.4");
  });
});
