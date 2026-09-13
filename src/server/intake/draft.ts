import { randomUUID } from "node:crypto";
import { getPool } from "../db/pool";
import { getConfig } from "../config";
import { signalFor } from "../zk/signal";
import type { IntakeDraftInput } from "./schema";

export type DraftResult = {
  applicationId: string;
  signal: string;
  nullifierSeed: string;
  expiresAt: string;
};

/**
 * Creates a draft application and returns everything the browser needs to
 * generate a proof: the applicationId (which the client must echo back
 * unmodified), the signal it must bind the proof to, and the nullifier seed
 * it must use. All three are server-derived; the client never gets to
 * choose any of them.
 */
/**
 * Best-effort, bounded purge of drafts that expired unsubmitted more than
 * 24h ago -- these rows still hold applicant PII (name, email, statement,
 * etc.) with no further purpose once truly stale. Bounded to 500 rows so a
 * large backlog can't turn an ordinary intake request into a slow one;
 * `npm run cleanup` (scripts/cleanup.ts) sweeps any remainder in a loop.
 * Never blocks or fails draft creation -- this is housekeeping, not
 * correctness-critical.
 */
async function purgeExpiredDraftsBestEffort(): Promise<void> {
  try {
    await getPool().query(
      `DELETE FROM drafts WHERE ctid IN (
         SELECT ctid FROM drafts
         WHERE status = 'awaiting_proof' AND expires_at < now() - interval '24 hours'
         LIMIT 500
       )`,
    );
  } catch (err) {
    console.error("opportunistic draft purge failed", {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function createDraft(
  input: IntakeDraftInput,
): Promise<DraftResult> {
  await purgeExpiredDraftsBestEffort();

  const cfg = getConfig();
  const applicationId = randomUUID();
  const expiresAt = new Date(
    Date.now() + cfg.draftTtlMinutes * 60_000,
  ).toISOString();

  const signal = signalFor({
    chainId: cfg.chainId,
    registryAddress: cfg.registryAddress,
    cycleId: cfg.cycleId,
    applicationId,
  });

  await getPool().query(
    `INSERT INTO drafts (
       id, cycle_id, status, preferred_name, contact_email, college,
       course_year, district, first_gen, statement, signal,
       nullifier_seed, expires_at
     ) VALUES ($1,$2,'awaiting_proof',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      applicationId,
      cfg.cycleId,
      input.preferredName,
      input.contactEmail,
      input.college,
      input.courseYear,
      input.district,
      input.firstGen,
      input.statement,
      signal.toString(),
      cfg.nullifierSeed.toString(),
      expiresAt,
    ],
  );

  return {
    applicationId,
    signal: signal.toString(),
    nullifierSeed: cfg.nullifierSeed.toString(),
    expiresAt,
  };
}
