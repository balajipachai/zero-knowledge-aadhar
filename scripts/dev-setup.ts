#!/usr/bin/env tsx
/**
 * One-time local dev bootstrap: generates a fresh relayer private key,
 * funds it from a local Hardhat node's own unlocked account #0, and writes
 * RELAYER_PRIVATE_KEY into .env.local (creating the file if needed,
 * preserving every other line it already has).
 *
 * .env.local is gitignored -- this script is the *only* place a real
 * private key is ever written, and it always goes there, never into a
 * tracked file.
 *
 * Prerequisite: a local Hardhat node running on RPC_URL (default
 * http://127.0.0.1:8545) -- see contracts/README or
 * `npx hardhat node` from contracts/.
 *
 * Usage: npm run dev:setup
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const FUND_AMOUNT_ETH = "10";
// Hardhat/anvil's default node account #0. This is a publicly known,
// intentionally-unsecured dev-only account funded by the node itself with
// fake ether that only exists on this ephemeral local chain -- it is not a
// credential of ours and holds nothing of value. We only ever use it as
// the *sender* of a local funding transaction, never store or commit it.
const HARDHAT_DEV_ACCOUNT_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

async function main() {
  const envLocalPath = path.join(process.cwd(), ".env.local");
  const existing = existsSync(envLocalPath)
    ? await readFile(envLocalPath, "utf8")
    : "";

  if (/^RELAYER_PRIVATE_KEY=0x[0-9a-fA-F]{64}/m.test(existing)) {
    console.log(".env.local already has a RELAYER_PRIVATE_KEY -- leaving it as-is.");
    return;
  }

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  console.log(`generated relayer address: ${account.address}`);

  try {
    const publicClient = createPublicClient({ transport: http(RPC_URL) });
    const walletClient = createWalletClient({
      account: HARDHAT_DEV_ACCOUNT_0,
      transport: http(RPC_URL),
    });

    const txHash = await walletClient.sendTransaction({
      to: account.address,
      value: parseEther(FUND_AMOUNT_ETH),
      chain: null,
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`funded relayer with ${FUND_AMOUNT_ETH} ETH from the local Hardhat node (tx ${txHash})`);
  } catch (err) {
    console.warn(
      "Could not fund the relayer from a local Hardhat node (is one running on",
      RPC_URL,
      "?). The key was still generated; fund it manually before anchoring.",
      err instanceof Error ? err.message : err,
    );
  }

  const updated =
    existing.length > 0 && !existing.endsWith("\n")
      ? `${existing}\nRELAYER_PRIVATE_KEY=${privateKey}\n`
      : `${existing}RELAYER_PRIVATE_KEY=${privateKey}\n`;
  await writeFile(envLocalPath, updated, { mode: 0o600 });
  console.log(`wrote RELAYER_PRIVATE_KEY into ${envLocalPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
