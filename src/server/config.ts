import { z } from "zod";

/**
 * All server configuration is validated at import time (effectively at boot,
 * since every route/module that needs config imports this module first).
 * A failure here throws synchronously and the process refuses to serve
 * requests with a missing or malformed value rather than limping along with
 * `undefined` and failing later inside a handler.
 */

const hexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected a 0x-prefixed 20-byte address");

const hexPrivateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected a 0x-prefixed 32-byte private key");

const bytes32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected a 0x-prefixed 32-byte hex value");

const decimalBigint = z
  .string()
  .regex(/^[0-9]+$/, "expected a decimal-encoded uint256")
  .transform((v) => BigInt(v));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  ANON_AADHAAR_MODE: z.enum(["test", "production"]),
  CYCLE_ID: bytes32,
  NULLIFIER_SEED: decimalBigint,
  CHAIN_ID: z.coerce.number().int().positive(),
  RPC_URL: z.string().url(),
  REGISTRY_ADDRESS: hexAddress,
  RELAYER_PRIVATE_KEY: hexPrivateKey,
  // Optional operational knobs, all defaulted.
  CYCLE_SLOTS: z.coerce.number().int().positive().default(60),
  DRAFT_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(20),
  // Unset by default: only trust a client-supplied IP header (e.g.
  // X-Forwarded-For) when this app actually sits behind a reverse proxy
  // that sets it itself. Without a trusted proxy in front, any client can
  // set this header to an arbitrary value and bypass per-IP rate limiting
  // entirely -- see src/server/rateLimit.ts's clientIpFromHeaders.
  TRUST_PROXY_IP_HEADER: z.string().optional(),
  APP_ORIGIN: z.string().url().default("http://localhost:3010"),
});

export type Config = {
  databaseUrl: string;
  sessionSecret: string;
  anonAadhaarMode: "test" | "production";
  cycleId: `0x${string}`;
  nullifierSeed: bigint;
  chainId: number;
  rpcUrl: string;
  registryAddress: `0x${string}`;
  relayerPrivateKey: `0x${string}`;
  cycleSlots: number;
  draftTtlMinutes: number;
  rateLimitWindowSeconds: number;
  rateLimitMaxRequests: number;
  trustProxyIpHeader?: string;
  appOrigin: string;
};

function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration; refusing to start.\n${issues}`,
    );
  }
  const env = parsed.data;
  return {
    databaseUrl: env.DATABASE_URL,
    sessionSecret: env.SESSION_SECRET,
    anonAadhaarMode: env.ANON_AADHAAR_MODE,
    cycleId: env.CYCLE_ID as `0x${string}`,
    nullifierSeed: env.NULLIFIER_SEED,
    chainId: env.CHAIN_ID,
    rpcUrl: env.RPC_URL,
    registryAddress: env.REGISTRY_ADDRESS as `0x${string}`,
    relayerPrivateKey: env.RELAYER_PRIVATE_KEY as `0x${string}`,
    cycleSlots: env.CYCLE_SLOTS,
    draftTtlMinutes: env.DRAFT_TTL_MINUTES,
    rateLimitWindowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
    rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    trustProxyIpHeader: env.TRUST_PROXY_IP_HEADER,
    appOrigin: env.APP_ORIGIN,
  };
}

let cached: Config | undefined;

/** Lazily loaded + memoized so importing this module has no side effect at
 * module-graph-construction time (important for tests that set env vars in
 * `beforeAll`), but every call after the first env var is set gets a
 * validated, immutable config object. */
export function getConfig(): Config {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}

/** Test-only escape hatch so integration tests can reset config between
 * scenarios that intentionally vary env vars (e.g. different cycles). */
export function resetConfigForTests(): void {
  cached = undefined;
}
