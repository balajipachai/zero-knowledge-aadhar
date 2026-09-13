-- Server-side volunteer sessions. The iron-session cookie only ever holds
-- an opaque row id (`sessionId`) after this migration -- volunteerId/email
-- are looked up from this table on every request, which is what makes
-- server-side revocation (logout) actually work instead of relying on the
-- client discarding its cookie.
--
-- Validity is enforced in src/server/auth/volunteerSessions.ts against
-- three conditions: not revoked, within an 8h absolute limit (from
-- created_at), and within a 30min idle limit (from last_seen_at, touched on
-- every successful validation).

CREATE TABLE IF NOT EXISTS volunteer_sessions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    volunteer_id    uuid NOT NULL REFERENCES volunteers (id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_seen_at    timestamptz NOT NULL DEFAULT now(),
    revoked_at      timestamptz
);

CREATE INDEX IF NOT EXISTS volunteer_sessions_volunteer_idx ON volunteer_sessions (volunteer_id);
