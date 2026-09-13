-- Grant-cycle intake schema.
--
-- Design notes:
-- * We never store an Aadhaar number, name, DOB, gender, pincode or state.
--   The only Aadhaar-derived values persisted are the proof's nullifier
--   (an opaque per-identity-per-app tag), its timestamp, and the boolean
--   age-above-18 bit that gated eligibility.
-- * `applications.id` is the same id as the `drafts.id` it was created from,
--   and doubles as the on-chain `appId` passed to the registry contract.
-- * UNIQUE(cycle_id, nullifier) on `applications` is the actual enforcement
--   of "one claim per human" at the database layer -- it turns a race
--   between two concurrent requests for the same nullifier into a
--   constraint-violation error rather than two rows.

CREATE TABLE IF NOT EXISTS drafts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id        text NOT NULL,
    status          text NOT NULL DEFAULT 'awaiting_proof'
                        CHECK (status IN ('awaiting_proof', 'submitted', 'expired')),
    preferred_name  text NOT NULL,
    contact_email   text NOT NULL,
    college         text NOT NULL,
    course_year     text NOT NULL,
    district        text NOT NULL,
    first_gen       boolean NOT NULL,
    statement       text NOT NULL,
    signal          text NOT NULL,          -- uint256 decimal string, server-derived
    nullifier_seed  text NOT NULL,          -- uint256 decimal string, server-fixed
    created_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS drafts_cycle_status_idx ON drafts (cycle_id, status);
CREATE INDEX IF NOT EXISTS drafts_expires_at_idx ON drafts (expires_at);

CREATE TABLE IF NOT EXISTS applications (
    id              uuid PRIMARY KEY,       -- == originating draft id == on-chain appId source
    cycle_id        text NOT NULL,
    nullifier       text NOT NULL,          -- uint256 decimal string, from the verified proof
    proof_timestamp bigint NOT NULL,
    age_above18     boolean NOT NULL,
    -- The groth16 proof points (pi_a/pi_b/pi_c/protocol/curve) only -- NOT
    -- the QR data, the certificate, or any decoded personal field. This is
    -- cryptographic material that is about to become public on-chain via
    -- the anchor transaction anyway; keeping it lets scripts/reconcile-
    -- anchors.ts retry a transiently-failed anchor without re-deriving
    -- anything from the applicant's Aadhaar card.
    groth16_proof   jsonb NOT NULL,
    preferred_name  text NOT NULL,
    contact_email   text NOT NULL,
    college         text NOT NULL,
    course_year     text NOT NULL,
    district        text NOT NULL,
    first_gen       boolean NOT NULL,
    statement       text NOT NULL,
    review_status   text NOT NULL DEFAULT 'awaiting_review'
                        CHECK (review_status IN ('awaiting_review', 'shortlisted', 'rejected', 'awarded')),
    anchor_status   text NOT NULL DEFAULT 'pending'
                        CHECK (anchor_status IN ('pending', 'anchored', 'failed')),
    anchor_attempts integer NOT NULL DEFAULT 0,
    tx_hash         text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cycle_id, nullifier)
);

CREATE INDEX IF NOT EXISTS applications_cycle_review_idx ON applications (cycle_id, review_status);
CREATE INDEX IF NOT EXISTS applications_anchor_status_idx ON applications (anchor_status);

CREATE TABLE IF NOT EXISTS intake_rejections (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id    text NOT NULL,
    draft_id    uuid,
    reason      text NOT NULL,
    nullifier   text,                       -- nullable: some rejections happen before a nullifier is known
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intake_rejections_cycle_idx ON intake_rejections (cycle_id, created_at);

CREATE TABLE IF NOT EXISTS volunteers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           text NOT NULL UNIQUE,
    password_hash   text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  uuid NOT NULL REFERENCES applications (id),
    volunteer_id    uuid NOT NULL REFERENCES volunteers (id),
    action          text NOT NULL
                        CHECK (action IN ('shortlist', 'reject', 'award', 'reopen', 'note')),
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_events_application_idx ON review_events (application_id, created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
    key             text PRIMARY KEY,       -- e.g. "intake:<sha256(ip)>"
    window_start    timestamptz NOT NULL,
    count           integer NOT NULL DEFAULT 0,
    updated_at      timestamptz NOT NULL DEFAULT now()
);
