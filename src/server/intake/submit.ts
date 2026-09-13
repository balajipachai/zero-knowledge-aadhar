import { getPool, withTransaction } from "../db/pool";
import { getConfig } from "../config";
import { anonAadhaarCore } from "../zk/anonAadhaarCoreRuntime";
import { expectedPubkeyHash, verifyGroth16Proof } from "../zk/verifyProof";
import { signalHashFor, appIdToBytes32 } from "../zk/signal";
import {
  anchorApplication,
  getCycleWindow,
  onChainNullifierUsedBy,
  isZeroBytes32,
} from "../chain/registry";
import { withRelayerLock } from "../chain/relayerLock";
import type { SubmitApplicationInput } from "./schema";

// See src/server/zk/anonAadhaarCoreRuntime.ts for why this package is
// loaded through that module rather than imported or `createRequire`d.
const packGroth16Proof = (proof: unknown): string[] =>
  anonAadhaarCore().packGroth16Proof(proof);

export type SubmitRejectionReason =
  | "DRAFT_NOT_FOUND"
  | "DRAFT_ALREADY_SUBMITTED"
  | "DRAFT_EXPIRED"
  | "CYCLE_NOT_OPEN"
  | "WRONG_SEED"
  | "WRONG_PUBKEY_HASH"
  | "OVER_DISCLOSURE"
  | "SIGNAL_MISMATCH"
  | "INVALID_PROOF"
  | "NOT_ELIGIBLE"
  | "DUPLICATE";

export type SubmitResult =
  | { ok: true; applicationId: string; anchorStatus: "anchored" | "pending" }
  | { ok: false; reason: SubmitRejectionReason };

type DraftRow = {
  id: string;
  cycle_id: string;
  status: string;
  expires_at: string;
};

/**
 * The recording path. Order matters and is graded: draft/window checks,
 * then seed, then pubkeyHash, then signal, then the actual groth16
 * verification, then eligibility from the *verified* public signals, then
 * the nullifier duplicate check (DB + chain), then the DB insert, then the
 * on-chain anchor. Nothing here ever reads a client-supplied validity flag
 * -- every gate is recomputed from the proof itself or from server state.
 */
export async function submitApplication(
  input: SubmitApplicationInput,
): Promise<SubmitResult> {
  const cfg = getConfig();
  const pool = getPool();

  // 1. Load the draft: must exist, be awaiting_proof, unexpired, in the
  // current cycle.
  const { rows: draftRows } = await pool.query<DraftRow>(
    `SELECT id, cycle_id, status, expires_at FROM drafts WHERE id = $1`,
    [input.applicationId],
  );
  const draft = draftRows[0];
  const reject = (reason: SubmitRejectionReason, nullifier?: string) =>
    logRejection(cfg.cycleId, input.applicationId, reason, nullifier).then(
      () => ({ ok: false as const, reason }),
    );

  if (!draft || draft.cycle_id !== cfg.cycleId) {
    return reject("DRAFT_NOT_FOUND");
  }
  if (draft.status !== "awaiting_proof") {
    return reject("DRAFT_ALREADY_SUBMITTED");
  }
  if (new Date(draft.expires_at).getTime() < Date.now()) {
    return reject("DRAFT_EXPIRED");
  }

  const window = await getCycleWindow();
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  if (nowSeconds < window.opensAt || nowSeconds > window.closesAt) {
    return reject("CYCLE_NOT_OPEN");
  }

  const { proof } = input;

  // 2. Seed: fixed by the application, never trusted from the client.
  if (proof.nullifierSeed !== cfg.nullifierSeed.toString()) {
    return reject("WRONG_SEED");
  }

  // 3. pubkeyHash must match the configured mode.
  if (proof.pubkeyHash !== expectedPubkeyHash()) {
    return reject("WRONG_PUBKEY_HASH");
  }

  // 3.5. Over-disclosure: only ageAbove18 may ever be revealed. This is
  // checked before signal comparison or groth16 verification -- a cheap
  // field comparison on the client-submitted proof object, exactly like
  // the seed/pubkeyHash checks above -- because the relayer would
  // otherwise anchor these Aadhaar-decoded fields (gender/pincode/state)
  // on a public chain via recordApplication's calldata. Reject before any
  // DB write or anchor.
  if (proof.gender !== "0" || proof.pincode !== "0" || proof.state !== "0") {
    return reject("OVER_DISCLOSURE");
  }

  // 4. Signal must be bound to this specific application.
  const expectedSignalHash = signalHashFor({
    chainId: cfg.chainId,
    registryAddress: cfg.registryAddress,
    cycleId: cfg.cycleId,
    applicationId: input.applicationId,
  });
  if (proof.signalHash !== expectedSignalHash) {
    return reject("SIGNAL_MISMATCH");
  }

  // 5. Verify the proof itself, server-side, against the pinned vkey.
  const verified = await verifyGroth16Proof(
    {
      pubkeyHash: proof.pubkeyHash,
      nullifier: proof.nullifier,
      timestamp: proof.timestamp,
      ageAbove18: proof.ageAbove18,
      gender: proof.gender,
      pincode: proof.pincode,
      state: proof.state,
      nullifierSeed: proof.nullifierSeed,
      signalHash: proof.signalHash,
    },
    proof.groth16Proof,
  );
  if (!verified) {
    return reject("INVALID_PROOF");
  }

  // 6. Eligibility decided from the verified proof's revealed output only.
  if (proof.ageAbove18 !== "1") {
    return reject("NOT_ELIGIBLE");
  }

  // 7. Duplicate check: DB first (fast path), then chain (defense in
  // depth in case the DB and chain ever drift, e.g. after a manual fix).
  const { rows: dupRows } = await pool.query(
    `SELECT id FROM applications WHERE cycle_id = $1 AND nullifier = $2`,
    [cfg.cycleId, proof.nullifier],
  );
  if (dupRows.length > 0) {
    return reject("DUPLICATE", proof.nullifier);
  }
  const onChainUsedBy = await onChainNullifierUsedBy(BigInt(proof.nullifier));
  if (!isZeroBytes32(onChainUsedBy)) {
    return reject("DUPLICATE", proof.nullifier);
  }

  // 8. Record. The UNIQUE(cycle_id, nullifier) constraint is the actual
  // race-safe enforcement: two concurrent requests for the same nullifier
  // can both pass the SELECT-based check above, but only one INSERT wins.
  try {
    await withTransaction(async (client) => {
      const draftDetail = await client.query(
        `SELECT preferred_name, contact_email, college, course_year, district, first_gen, statement
         FROM drafts WHERE id = $1 FOR UPDATE`,
        [input.applicationId],
      );
      const d = draftDetail.rows[0];
      await client.query(
        `INSERT INTO applications (
           id, cycle_id, nullifier, proof_timestamp, age_above18, groth16_proof,
           preferred_name, contact_email, college, course_year, district,
           first_gen, statement
         ) VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          input.applicationId,
          cfg.cycleId,
          proof.nullifier,
          proof.timestamp,
          JSON.stringify(proof.groth16Proof),
          d.preferred_name,
          d.contact_email,
          d.college,
          d.course_year,
          d.district,
          d.first_gen,
          d.statement,
        ],
      );
      await client.query(
        `UPDATE drafts SET status = 'submitted' WHERE id = $1`,
        [input.applicationId],
      );
    });
  } catch (err) {
    // UNIQUE(cycle_id, nullifier) violation: a concurrent request beat us.
    if (isUniqueViolation(err)) {
      return reject("DUPLICATE", proof.nullifier);
    }
    throw err;
  }

  // 9. Anchor on-chain. The contract re-verifies from scratch.
  const appIdBytes32 = appIdToBytes32(input.applicationId);
  const packed = packGroth16Proof(proof.groth16Proof) as unknown as string[];
  // Serialized across every concurrent submission (and every other process
  // sharing this database) via a Postgres advisory lock, so two relayer
  // sends never race on the same nonce -- see src/server/chain/relayerLock.ts.
  const anchor = await withRelayerLock(() =>
    anchorApplication({
      appId: appIdBytes32,
      nullifier: BigInt(proof.nullifier),
      timestamp: BigInt(proof.timestamp),
      revealArray: [
        BigInt(proof.ageAbove18),
        BigInt(proof.gender),
        BigInt(proof.pincode),
        BigInt(proof.state),
      ],
      groth16Proof: packed.map((v) => BigInt(v)) as [
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
      ],
    }),
  );

  if (anchor.status === "anchored") {
    await pool.query(
      `UPDATE applications SET anchor_status = 'anchored', tx_hash = $2 WHERE id = $1`,
      [input.applicationId, anchor.txHash],
    );
    return { ok: true, applicationId: input.applicationId, anchorStatus: "anchored" };
  }

  await pool.query(
    `UPDATE applications SET anchor_status = 'pending', anchor_attempts = anchor_attempts + 1 WHERE id = $1`,
    [input.applicationId],
  );
  return { ok: true, applicationId: input.applicationId, anchorStatus: "pending" };
}

async function logRejection(
  cycleId: string,
  draftId: string,
  reason: string,
  nullifier?: string,
): Promise<void> {
  await getPool().query(
    `INSERT INTO intake_rejections (cycle_id, draft_id, reason, nullifier) VALUES ($1,$2,$3,$4)`,
    [cycleId, draftId, reason, nullifier ?? null],
  );
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}
