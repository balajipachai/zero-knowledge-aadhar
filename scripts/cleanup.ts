#!/usr/bin/env tsx
/**
 * Data-retention housekeeping. Run this periodically (cron), or by hand:
 *
 *   npm run cleanup
 *
 * Purges three kinds of row that have no further purpose once stale:
 *   1. Drafts that expired unsubmitted more than 24h ago -- these hold
 *      applicant PII (name, email, statement, ...) with nothing to show
 *      for it. src/server/intake/draft.ts already does a bounded (LIMIT
 *      500) sweep of these opportunistically on every intake request; this
 *      loops until none remain, for a backlog larger than one sweep covers
 *      (e.g. after intake traffic pauses for a while).
 *   2. `rate_limits` rows untouched for a day -- their window has long
 *      since closed.
 *   3. `volunteer_sessions` rows that are revoked, past their 8h absolute
 *      limit, or past their 30min idle limit -- mirrors the same windows
 *      src/server/auth/volunteerSessions.ts enforces, so this only ever
 *      deletes rows that could no longer validate anyway.
 */
import "dotenv/config";
import { Pool } from "pg";

// Housekeeping only touches the database, so it reads DATABASE_URL directly
// (like scripts/migrate.ts) instead of going through src/server/config.ts,
// which would also demand the relayer key, RPC URL, session secret, etc.
// just to delete stale rows.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
let poolClosed = false;

function getPool(): Pool {
  return pool;
}

async function closePool(): Promise<void> {
  if (poolClosed) return;
  poolClosed = true;
  await pool.end();
}

async function purgeExpiredDrafts(): Promise<number> {
  let total = 0;
  for (;;) {
    const { rowCount } = await getPool().query(
      `DELETE FROM drafts WHERE ctid IN (
         SELECT ctid FROM drafts
         WHERE status = 'awaiting_proof' AND expires_at < now() - interval '24 hours'
         LIMIT 500
       )`,
    );
    total += rowCount ?? 0;
    if (!rowCount || rowCount < 500) break;
  }
  return total;
}

async function purgeStaleRateLimits(): Promise<number> {
  const { rowCount } = await getPool().query(
    `DELETE FROM rate_limits WHERE updated_at < now() - interval '1 day'`,
  );
  return rowCount ?? 0;
}

async function purgeDeadVolunteerSessions(): Promise<number> {
  const { rowCount } = await getPool().query(
    `DELETE FROM volunteer_sessions
     WHERE revoked_at IS NOT NULL
        OR created_at < now() - interval '8 hours'
        OR last_seen_at < now() - interval '30 minutes'`,
  );
  return rowCount ?? 0;
}

async function main() {
  const drafts = await purgeExpiredDrafts();
  const rateLimits = await purgeStaleRateLimits();
  const sessions = await purgeDeadVolunteerSessions();
  console.log(
    `cleanup: purged ${drafts} expired draft(s), ${rateLimits} stale rate_limit row(s), ${sessions} dead volunteer_session row(s)`,
  );
  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
