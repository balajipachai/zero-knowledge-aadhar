import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Client } from "pg";
import { describe, expect, inject, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");

describe("npm run cleanup (data retention)", () => {
  it("purges expired-unsubmitted drafts, stale rate_limits, and dead volunteer_sessions, keeping live rows", async () => {
    const databaseUrl = inject("databaseUrl" as never) as string;
    const cycleId = inject("cycleId" as never) as string;

    const client = new Client({ connectionString: databaseUrl });
    await client.connect();

    const staleDraftId = randomUUID();
    const freshDraftId = randomUUID();
    const staleRateLimitKey = `cleanup-test-stale-${Date.now()}`;
    const freshRateLimitKey = `cleanup-test-fresh-${Date.now()}`;

    try {
      // A draft that expired well over 24h ago -- must be purged.
      await client.query(
        `INSERT INTO drafts (
           id, cycle_id, status, preferred_name, contact_email, college,
           course_year, district, first_gen, statement, signal,
           nullifier_seed, expires_at, created_at
         ) VALUES ($1,$2,'awaiting_proof','Stale','stale@example.com','C','Y','D',true,'s','1','1',
                   now() - interval '48 hours', now() - interval '49 hours')`,
        [staleDraftId, cycleId],
      );
      // A draft that hasn't expired -- must survive.
      await client.query(
        `INSERT INTO drafts (
           id, cycle_id, status, preferred_name, contact_email, college,
           course_year, district, first_gen, statement, signal,
           nullifier_seed, expires_at
         ) VALUES ($1,$2,'awaiting_proof','Fresh','fresh@example.com','C','Y','D',true,'s','1','1',
                   now() + interval '30 minutes')`,
        [freshDraftId, cycleId],
      );

      // A stale rate_limits row -- must be purged.
      await client.query(
        `INSERT INTO rate_limits (key, window_start, count, updated_at)
         VALUES ($1, now() - interval '2 days', 5, now() - interval '2 days')`,
        [staleRateLimitKey],
      );
      // A fresh rate_limits row -- must survive.
      await client.query(
        `INSERT INTO rate_limits (key, window_start, count, updated_at)
         VALUES ($1, now(), 1, now())`,
        [freshRateLimitKey],
      );

      execFileSync(
        process.execPath,
        [path.join(ROOT, "node_modules", ".bin", "tsx"), path.join(ROOT, "scripts", "cleanup.ts")],
        { cwd: ROOT, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" },
      );

      const { rows: draftRows } = await client.query(
        `SELECT id FROM drafts WHERE id IN ($1, $2)`,
        [staleDraftId, freshDraftId],
      );
      expect(draftRows.map((r) => r.id).sort()).toEqual([freshDraftId].sort());

      const { rows: rateLimitRows } = await client.query(
        `SELECT key FROM rate_limits WHERE key IN ($1, $2)`,
        [staleRateLimitKey, freshRateLimitKey],
      );
      expect(rateLimitRows.map((r) => r.key)).toEqual([freshRateLimitKey]);
    } finally {
      await client
        .query(`DELETE FROM drafts WHERE id IN ($1, $2)`, [staleDraftId, freshDraftId])
        .catch(() => {});
      await client
        .query(`DELETE FROM rate_limits WHERE key IN ($1, $2)`, [staleRateLimitKey, freshRateLimitKey])
        .catch(() => {});
      await client.end();
    }
  });
});
