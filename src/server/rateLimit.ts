import { createHash } from "node:crypto";
import { getPool } from "./db/pool";
import { getConfig } from "./config";

/** Hashes the caller's IP so we never persist a raw IP address in
 * `rate_limits` -- only an opaque key we can rate-limit on. */
function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

/**
 * Returns the key to rate-limit this request's caller on. Only reads a
 * client-supplied IP header when `TRUST_PROXY_IP_HEADER` is explicitly set
 * to the header name a trusted reverse proxy/load balancer in front of this
 * app actually sets -- e.g. `X-Forwarded-For`. Without that, ANY header the
 * client sends (including `X-Forwarded-For`) is trivially spoofable per
 * request, so trusting it unconditionally would let a caller bypass rate
 * limiting just by sending a fresh value each time. When unset (the
 * default -- no known trusted proxy), every caller shares one bucket per
 * route: the limit still applies globally, just not per-IP.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const trustedHeader = getConfig().trustProxyIpHeader;
  if (trustedHeader) {
    const value = headers.get(trustedHeader);
    if (value) return value.split(",")[0]!.trim();
  }
  return "shared";
}

export type RateLimitResult = { allowed: boolean; remaining: number };

/**
 * Fixed-window rate limit backed by Postgres, keyed on `${route}:${sha256(ip)}`.
 * Uses a single upsert with `ON CONFLICT` so concurrent requests from the
 * same key can't race past the limit between a read and a write.
 */
export async function checkRateLimit(
  route: string,
  ip: string,
): Promise<RateLimitResult> {
  const cfg = getConfig();
  const key = `${route}:${hashIp(ip)}`;
  const windowSeconds = cfg.rateLimitWindowSeconds;
  const maxRequests = cfg.rateLimitMaxRequests;

  const { rows } = await getPool().query<{ count: number; allowed: boolean }>(
    `
    INSERT INTO rate_limits (key, window_start, count, updated_at)
    VALUES ($1, now(), 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start < now() - ($2 || ' seconds')::interval
          THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < now() - ($2 || ' seconds')::interval
          THEN now()
        ELSE rate_limits.window_start
      END,
      updated_at = now()
    RETURNING count
    `,
    [key, windowSeconds],
  );

  const count = rows[0]?.count ?? 1;
  return {
    allowed: count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
  };
}
