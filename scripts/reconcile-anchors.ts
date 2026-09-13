#!/usr/bin/env tsx
/**
 * Reconciles `applications.anchor_status` with on-chain truth. Run this
 * periodically (cron, or by hand after an RPC outage) to catch up any
 * application whose anchor transaction didn't complete synchronously
 * during its original request.
 *
 * For each `pending` row:
 *   1. If the contract already shows it recorded (applicationRecorded(appId)
 *      == true), the anchor actually succeeded -- we just never heard back
 *      (crash, timeout, etc). Find the ApplicationRecorded event and update
 *      our row with its tx hash. Idempotent: safe to run any number of
 *      times.
 *   2. Otherwise, resend `recordApplication` as the relayer using the
 *      groth16 proof we stored at submission time (see
 *      db/migrations/0001_init.sql's comment on `applications.groth16_proof`
 *      for why storing that -- as opposed to any raw Aadhaar data -- is
 *      safe). The contract re-verifies from scratch, same as the first
 *      attempt.
 *
 * Usage: npm run reconcile-anchors
 */
import "dotenv/config";
import { getPool, closePool } from "../src/server/db/pool";
import { getConfig } from "../src/server/config";
import {
  anchorApplication,
  getPublicClient,
  GrantCycleRegistryAbi,
} from "../src/server/chain/registry";
import { withRelayerLock } from "../src/server/chain/relayerLock";
import { appIdToBytes32 } from "../src/server/zk/signal";

type PendingRow = {
  id: string;
  nullifier: string;
  proof_timestamp: string;
  groth16_proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  anchor_attempts: number;
};

async function packedProofFromRow(row: PendingRow): Promise<
  [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint]
> {
  const { pi_a, pi_b, pi_c } = row.groth16_proof;
  return [
    BigInt(pi_a[0]!),
    BigInt(pi_a[1]!),
    BigInt(pi_b[0]![1]!),
    BigInt(pi_b[0]![0]!),
    BigInt(pi_b[1]![1]!),
    BigInt(pi_b[1]![0]!),
    BigInt(pi_c[0]!),
    BigInt(pi_c[1]!),
  ];
}

async function main() {
  const cfg = getConfig();
  const pool = getPool();

  const { rows } = await pool.query<PendingRow>(
    `SELECT id, nullifier, proof_timestamp, groth16_proof, anchor_attempts
     FROM applications WHERE cycle_id = $1 AND anchor_status = 'pending'`,
    [cfg.cycleId],
  );

  console.log(`${rows.length} application(s) pending anchor`);

  for (const row of rows) {
    const appId = appIdToBytes32(row.id);

    const alreadyRecorded = await getPublicClient().readContract({
      address: cfg.registryAddress,
      abi: GrantCycleRegistryAbi,
      functionName: "applicationRecorded",
      args: [appId],
    });

    if (alreadyRecorded) {
      const logs = await getPublicClient().getContractEvents({
        address: cfg.registryAddress,
        abi: GrantCycleRegistryAbi,
        eventName: "ApplicationRecorded",
        args: { appId },
        fromBlock: 0n,
        toBlock: "latest",
      });
      const txHash = logs[0]?.transactionHash ?? null;
      await pool.query(
        `UPDATE applications SET anchor_status = 'anchored', tx_hash = $2 WHERE id = $1`,
        [row.id, txHash],
      );
      console.log(`${row.id}: already on-chain, reconciled (tx=${txHash})`);
      continue;
    }

    const packed = await packedProofFromRow(row);
    // Same cross-process advisory lock a live submission uses, so a manual
    // reconcile run can never race a live request's anchor attempt over
    // the same relayer nonce.
    const result = await withRelayerLock(() =>
      anchorApplication({
        appId,
        nullifier: BigInt(row.nullifier),
        timestamp: BigInt(row.proof_timestamp),
        revealArray: [1n, 0n, 0n, 0n], // this app never reveals gender/pincode/state
        groth16Proof: packed,
      }),
    );

    if (result.status === "anchored") {
      await pool.query(
        `UPDATE applications SET anchor_status = 'anchored', tx_hash = $2 WHERE id = $1`,
        [row.id, result.txHash],
      );
      console.log(`${row.id}: anchored (tx=${result.txHash})`);
    } else {
      await pool.query(
        `UPDATE applications SET anchor_attempts = anchor_attempts + 1 WHERE id = $1`,
        [row.id],
      );
      console.warn(`${row.id}: still failing (${result.reason}), attempt ${row.anchor_attempts + 1}`);
    }
  }

  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
