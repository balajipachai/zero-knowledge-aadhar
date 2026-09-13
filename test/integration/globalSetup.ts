import { spawn, type ChildProcess, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getFreePort, waitUntil } from "./lib/net";

const ROOT = path.resolve(__dirname, "..", "..");
const CONTRACTS_DIR = path.join(ROOT, "contracts");

// Hardhat's node auto-unlocks and auto-funds this well-known address with
// test ether on its own in-memory chain. We only ever use it as a
// transaction *sender by address* (the node itself signs via
// eth_sendTransaction) -- its private key is never read, stored, or
// needed anywhere in this repo.
const HARDHAT_DEV_ACCOUNT_0: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://localhost:5432/zk_aadhaar_test";

export const VOLUNTEER_EMAIL = "volunteer.test@example.com";
export const VOLUNTEER_PASSWORD = "correct horse battery staple test";

function readArtifact(relativePath: string): { abi: unknown; bytecode: Hex } {
  const json = JSON.parse(readFileSync(path.join(CONTRACTS_DIR, relativePath), "utf8"));
  return { abi: json.abi, bytecode: json.bytecode };
}

async function resetTestDatabase(): Promise<void> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await client.end();

  execFileSync(process.execPath, [
    path.join(ROOT, "node_modules", ".bin", "tsx"),
    path.join(ROOT, "scripts", "migrate.ts"),
  ], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}

async function insertTestVolunteer(): Promise<void> {
  // Imported dynamically so this module has no top-level dependency on the
  // app's own source before env vars are ready.
  const { hashPassword } = await import("../../src/server/auth/password");
  const passwordHash = await hashPassword(VOLUNTEER_PASSWORD);
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await client.query(
    `INSERT INTO volunteers (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [VOLUNTEER_EMAIL, passwordHash],
  );
  await client.end();
}

async function startHardhatNode(): Promise<{ proc: ChildProcess; rpcUrl: string; port: number }> {
  const port = await getFreePort();
  const proc = spawn(
    process.execPath,
    [path.join(CONTRACTS_DIR, "node_modules", ".bin", "hardhat"), "node", "--port", String(port)],
    { cwd: CONTRACTS_DIR, stdio: ["ignore", "pipe", "pipe"] },
  );
  const rpcUrl = `http://127.0.0.1:${port}`;

  await waitUntil(
    async () => {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
      });
      return res.ok;
    },
    { timeoutMs: 60_000 },
  );

  return { proc, rpcUrl, port };
}

async function deployContracts(rpcUrl: string) {
  execFileSync(
    process.execPath,
    [path.join(CONTRACTS_DIR, "node_modules", ".bin", "hardhat"), "compile"],
    { cwd: CONTRACTS_DIR, stdio: "inherit" },
  );

  const verifierArtifact = readArtifact("artifacts/contracts/vendor/VerifierDeploy.sol/VerifierDeploy.json");
  const anonAadhaarArtifact = readArtifact(
    "artifacts/contracts/vendor/AnonAadhaarDeploy.sol/AnonAadhaarDeploy.json",
  );
  const registryArtifact = readArtifact("artifacts/contracts/GrantCycleRegistry.sol/GrantCycleRegistry.json");

  const { testPublicKeyHash } = await import("@anon-aadhaar/core");

  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const walletClient = createWalletClient({
    account: HARDHAT_DEV_ACCOUNT_0,
    transport: http(rpcUrl),
  });

  const relayerPrivateKey = generatePrivateKey();
  const relayerAddress = privateKeyToAccount(relayerPrivateKey).address;

  // Fund the relayer from the node's own unlocked account.
  const fundTx = await walletClient.sendTransaction({
    to: relayerAddress,
    value: 10_000_000_000_000_000_000n, // 10 ETH
    chain: null,
  });
  await publicClient.waitForTransactionReceipt({ hash: fundTx });

  async function deploy(artifact: { abi: unknown; bytecode: Hex }, args: unknown[]) {
    const hash = await walletClient.deployContract({
      abi: artifact.abi as never,
      bytecode: artifact.bytecode,
      args: args as never,
      account: HARDHAT_DEV_ACCOUNT_0,
      chain: null,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) throw new Error("deployment produced no contract address");
    return receipt.contractAddress;
  }

  const verifierAddress = await deploy(verifierArtifact, []);
  const anonAadhaarAddress = await deploy(anonAadhaarArtifact, [
    verifierAddress,
    BigInt(testPublicKeyHash),
  ]);

  const nullifierSeed = BigInt("0x" + randomBytes(16).toString("hex"));
  const cycleId = keccak256(toHex(`integration-test-cycle-${Date.now()}`));
  const now = BigInt(Math.floor(Date.now() / 1000));
  const opensAt = now - 3600n;
  const closesAt = now + 365n * 24n * 3600n;

  const registryAddress = await deploy(registryArtifact, [
    HARDHAT_DEV_ACCOUNT_0,
    anonAadhaarAddress,
    relayerAddress,
    nullifierSeed,
    cycleId,
    opensAt,
    closesAt,
  ]);

  return {
    registryAddress,
    relayerPrivateKey,
    relayerAddress,
    nullifierSeed,
    cycleId,
    ownerAddress: HARDHAT_DEV_ACCOUNT_0,
    opensAt,
    closesAt,
  };
}

async function startNextApp(port: number, env: Record<string, string>) {
  execFileSync(process.execPath, [path.join(ROOT, "node_modules", ".bin", "next"), "build"], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });

  const proc = spawn(
    process.execPath,
    [path.join(ROOT, "node_modules", ".bin", "next"), "start", "-p", String(port)],
    {
      cwd: ROOT,
      env: { ...process.env, ...env },
      // Inherit so the server's own console.error (reason codes only,
      // never bodies) is visible when a test fails against it.
      stdio: "inherit",
    },
  );

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitUntil(
    async () => {
      const res = await fetch(baseUrl, { method: "GET" });
      return res.status < 500;
    },
    { timeoutMs: 90_000 },
  );

  return { proc, baseUrl };
}

export default async function setup({ provide }: { provide: (key: string, value: unknown) => void }) {
  const hardhat = await startHardhatNode();
  const deployment = await deployContracts(hardhat.rpcUrl);

  await resetTestDatabase();
  await insertTestVolunteer();

  const appPort = await getFreePort();
  const sessionSecret = randomBytes(32).toString("hex");
  const appOrigin = `http://127.0.0.1:${appPort}`;

  const env: Record<string, string> = {
    DATABASE_URL: TEST_DATABASE_URL,
    SESSION_SECRET: sessionSecret,
    APP_ORIGIN: appOrigin,
    ANON_AADHAAR_MODE: "test",
    NEXT_PUBLIC_ANON_AADHAAR_MODE: "test",
    CYCLE_ID: deployment.cycleId,
    NULLIFIER_SEED: deployment.nullifierSeed.toString(),
    CHAIN_ID: "31337",
    RPC_URL: hardhat.rpcUrl,
    REGISTRY_ADDRESS: deployment.registryAddress,
    RELAYER_PRIVATE_KEY: deployment.relayerPrivateKey,
    CYCLE_SLOTS: "3", // small on purpose: exercises the "no slots remaining" path cheaply
    DRAFT_TTL_MINUTES: "30",
    RATE_LIMIT_WINDOW_SECONDS: "60",
    RATE_LIMIT_MAX_REQUESTS: "1000", // generous: rate limiting has its own unit-level coverage
  };

  const nextApp = await startNextApp(appPort, env);

  provide("baseUrl", nextApp.baseUrl);
  provide("rpcUrl", hardhat.rpcUrl);
  provide("registryAddress", deployment.registryAddress);
  provide("chainId", 31337);
  provide("cycleId", deployment.cycleId);
  provide("nullifierSeed", deployment.nullifierSeed.toString());
  provide("relayerAddress", deployment.relayerAddress);
  provide("ownerAddress", deployment.ownerAddress);
  provide("cycleSlots", 3);
  provide("volunteerEmail", VOLUNTEER_EMAIL);
  provide("volunteerPassword", VOLUNTEER_PASSWORD);
  provide("databaseUrl", TEST_DATABASE_URL);

  return async function teardown() {
    nextApp.proc.kill();
    hardhat.proc.kill();
    await new Promise((r) => setTimeout(r, 500));
  };
}
