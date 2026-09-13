import { getPool } from "../db/pool";

// Arbitrary fixed key for a Postgres session-level advisory lock that
// serializes every relayer transaction -- across concurrent requests in
// this process, AND across separate processes/instances sharing the same
// Postgres. The problem this solves: viem's wallet client fetches the
// relayer's next nonce via eth_getTransactionCount at send time, so two
// concurrent recordApplication sends can both read the same "next" nonce
// before either lands, racing to submit it (one then fails or silently
// replaces the other). A cross-process mutex around "read nonce, send,
// wait for receipt" removes that race entirely.
const RELAYER_LOCK_KEY = 847_362_910_384_001n;

/** Runs `fn` while holding a Postgres advisory lock shared by every caller
 * of this function (in this process or any other connected to the same
 * database) -- i.e. relayer sends are fully serialized. Always releases
 * the lock and returns the connection to the pool, even if `fn` throws. */
export async function withRelayerLock<T>(fn: () => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [RELAYER_LOCK_KEY]);
    return await fn();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [RELAYER_LOCK_KEY]);
    client.release();
  }
}
