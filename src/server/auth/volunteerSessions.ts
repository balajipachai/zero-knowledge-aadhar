import { getPool } from "../db/pool";

const ABSOLUTE_LIMIT_MS = 8 * 60 * 60 * 1000;
const IDLE_LIMIT_MS = 30 * 60 * 1000;

/** Creates a new server-side session row for a just-authenticated
 * volunteer and returns its id -- the ONLY thing the iron-session cookie
 * stores from here on (see src/server/auth/session.ts). */
export async function createVolunteerSessionRow(volunteerId: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO volunteer_sessions (volunteer_id) VALUES ($1) RETURNING id`,
    [volunteerId],
  );
  return rows[0]!.id;
}

export type ValidatedVolunteerSession = { volunteerId: string; email: string };

/**
 * Validates a session row: it must exist, not be revoked, the volunteer it
 * belongs to must still exist, and it must be within both the 8h absolute
 * limit (from `created_at`) and the 30min idle limit (from
 * `last_seen_at`). On success, touches `last_seen_at` (sliding the idle
 * window) and returns the volunteer's identity; on any failure, returns
 * null -- callers must not distinguish *why* to the client, only ever
 * respond 401.
 */
export async function validateAndTouchVolunteerSession(
  sessionId: string,
): Promise<ValidatedVolunteerSession | null> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: string;
    volunteer_id: string;
    created_at: string;
    last_seen_at: string;
    revoked_at: string | null;
    email: string | null;
  }>(
    `SELECT s.id, s.volunteer_id, s.created_at, s.last_seen_at, s.revoked_at, v.email
     FROM volunteer_sessions s
     LEFT JOIN volunteers v ON v.id = s.volunteer_id
     WHERE s.id = $1`,
    [sessionId],
  );
  const row = rows[0];
  if (!row || row.revoked_at || !row.email) return null;

  const now = Date.now();
  if (now - new Date(row.created_at).getTime() > ABSOLUTE_LIMIT_MS) return null;
  if (now - new Date(row.last_seen_at).getTime() > IDLE_LIMIT_MS) return null;

  await pool.query(`UPDATE volunteer_sessions SET last_seen_at = now() WHERE id = $1`, [
    sessionId,
  ]);
  return { volunteerId: row.volunteer_id, email: row.email };
}

/** Logout: marks the row revoked so a copy of the cookie captured before
 * logout (or replayed after) can never validate again -- this is the actual
 * server-side enforcement logout provides; `session.destroy()` alone only
 * ever cleared the client's own cookie. Idempotent. */
export async function revokeVolunteerSession(sessionId: string): Promise<void> {
  await getPool().query(
    `UPDATE volunteer_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId],
  );
}
