import { getPool } from "../db/pool";
import { getConfig } from "../config";

export type CycleSummary = {
  verified: number;
  duplicates: number;
  otherRejections: { reason: string; count: number }[];
  awaitingReview: number;
  shortlisted: number;
  awarded: number;
  slotsRemaining: number;
  anchorPending: number;
};

export async function getCycleSummary(): Promise<CycleSummary> {
  const cfg = getConfig();
  const pool = getPool();

  const [
    verifiedResult,
    duplicatesResult,
    otherRejectionsResult,
    awaitingReviewResult,
    shortlistedResult,
    awardedResult,
    anchorPendingResult,
  ] = await Promise.all([
    pool.query(`SELECT count(*)::int AS n FROM applications WHERE cycle_id = $1`, [cfg.cycleId]),
    pool.query(
      `SELECT count(*)::int AS n FROM intake_rejections WHERE cycle_id = $1 AND reason = 'DUPLICATE'`,
      [cfg.cycleId],
    ),
    pool.query(
      `SELECT reason, count(*)::int AS n FROM intake_rejections WHERE cycle_id = $1 AND reason != 'DUPLICATE' GROUP BY reason ORDER BY reason`,
      [cfg.cycleId],
    ),
    pool.query(
      `SELECT count(*)::int AS n FROM applications WHERE cycle_id = $1 AND review_status = 'awaiting_review'`,
      [cfg.cycleId],
    ),
    pool.query(
      `SELECT count(*)::int AS n FROM applications WHERE cycle_id = $1 AND review_status = 'shortlisted'`,
      [cfg.cycleId],
    ),
    pool.query(
      `SELECT count(*)::int AS n FROM applications WHERE cycle_id = $1 AND review_status = 'awarded'`,
      [cfg.cycleId],
    ),
    pool.query(
      `SELECT count(*)::int AS n FROM applications WHERE cycle_id = $1 AND anchor_status != 'anchored'`,
      [cfg.cycleId],
    ),
  ]);

  const awarded = awardedResult.rows[0].n as number;

  return {
    verified: verifiedResult.rows[0].n,
    duplicates: duplicatesResult.rows[0].n,
    otherRejections: otherRejectionsResult.rows.map((r) => ({
      reason: r.reason as string,
      count: r.n as number,
    })),
    awaitingReview: awaitingReviewResult.rows[0].n,
    shortlisted: shortlistedResult.rows[0].n,
    awarded,
    slotsRemaining: Math.max(0, cfg.cycleSlots - awarded),
    anchorPending: anchorPendingResult.rows[0].n,
  };
}

export type ApplicationListItem = {
  id: string;
  preferredName: string;
  college: string;
  district: string;
  reviewStatus: string;
  anchorStatus: string;
  createdAt: string;
};

export async function listApplications(filter: {
  reviewStatus?: string;
}): Promise<ApplicationListItem[]> {
  const cfg = getConfig();
  const pool = getPool();
  const params: unknown[] = [cfg.cycleId];
  let where = `cycle_id = $1`;
  if (filter.reviewStatus) {
    params.push(filter.reviewStatus);
    where += ` AND review_status = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT id, preferred_name, college, district, review_status, anchor_status, created_at
     FROM applications WHERE ${where} ORDER BY created_at DESC`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    preferredName: r.preferred_name,
    college: r.college,
    district: r.district,
    reviewStatus: r.review_status,
    anchorStatus: r.anchor_status,
    createdAt: r.created_at,
  }));
}

export type ApplicationDetail = ApplicationListItem & {
  contactEmail: string;
  courseYear: string;
  firstGen: boolean;
  statement: string;
  txHash: string | null;
  events: {
    action: string;
    note: string | null;
    volunteerEmail: string;
    createdAt: string;
  }[];
};

export async function getApplicationDetail(
  id: string,
): Promise<ApplicationDetail | null> {
  const cfg = getConfig();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, preferred_name, contact_email, college, course_year, district,
            first_gen, statement, review_status, anchor_status, tx_hash, created_at
     FROM applications WHERE id = $1 AND cycle_id = $2`,
    [id, cfg.cycleId],
  );
  const app = rows[0];
  if (!app) return null;

  const { rows: events } = await pool.query(
    `SELECT re.action, re.note, re.created_at, v.email AS volunteer_email
     FROM review_events re JOIN volunteers v ON v.id = re.volunteer_id
     WHERE re.application_id = $1 ORDER BY re.created_at ASC`,
    [id],
  );

  return {
    id: app.id,
    preferredName: app.preferred_name,
    college: app.college,
    district: app.district,
    reviewStatus: app.review_status,
    anchorStatus: app.anchor_status,
    createdAt: app.created_at,
    contactEmail: app.contact_email,
    courseYear: app.course_year,
    firstGen: app.first_gen,
    statement: app.statement,
    txHash: app.tx_hash,
    events: events.map((e) => ({
      action: e.action,
      note: e.note,
      volunteerEmail: e.volunteer_email,
      createdAt: e.created_at,
    })),
  };
}

const REVIEW_TRANSITIONS: Record<string, string> = {
  shortlist: "shortlisted",
  reject: "rejected",
  award: "awarded",
  reopen: "awaiting_review",
};

export async function recordReviewAction(params: {
  applicationId: string;
  volunteerId: string;
  action: "shortlist" | "reject" | "award" | "reopen" | "note";
  note?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const cfg = getConfig();
  const pool = getPool();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, review_status FROM applications WHERE id = $1 AND cycle_id = $2 FOR UPDATE`,
      [params.applicationId, cfg.cycleId],
    );
    const app = rows[0];
    if (!app) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "NOT_FOUND" };
    }

    if (params.action === "award") {
      const { rows: awardedCountRows } = await client.query(
        `SELECT count(*)::int AS n FROM applications WHERE cycle_id = $1 AND review_status = 'awarded' FOR UPDATE`,
        [cfg.cycleId],
      );
      if ((awardedCountRows[0].n as number) >= cfg.cycleSlots) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "NO_SLOTS_REMAINING" };
      }
    }

    if (params.action !== "note") {
      const newStatus = REVIEW_TRANSITIONS[params.action];
      await client.query(
        `UPDATE applications SET review_status = $2 WHERE id = $1`,
        [params.applicationId, newStatus],
      );
    }

    await client.query(
      `INSERT INTO review_events (application_id, volunteer_id, action, note) VALUES ($1,$2,$3,$4)`,
      [params.applicationId, params.volunteerId, params.action, params.note ?? null],
    );

    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
