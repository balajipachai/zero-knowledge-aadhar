import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { network } from "hardhat";
import { encodeAbiParameters, keccak256, pad, padHex, toHex } from "viem";
import { packGroth16Proof, testPublicKeyHash } from "@anon-aadhaar/core";
import { generateRealTestProof } from "./helpers/anonAadhaarTestProof.ts";

// snarkjs caches its bn128 curve (a worker-thread pool) on
// globalThis.curve_bn128 and never terminates it itself. Left running, that
// pool keeps this process alive indefinitely after the last test finishes
// -- the tests themselves pass, but `hardhat test nodejs` never exits.
after(async () => {
  const g = globalThis as unknown as {
    curve_bn128?: { terminate: () => Promise<void> } | null;
  };
  if (g.curve_bn128) {
    await g.curve_bn128.terminate();
  }
});

// This is the slow, high-fidelity end of the test pyramid: it deploys the
// REAL upstream Verifier + AnonAadhaar contracts (not a mock) and anchors a
// REAL groth16 proof generated in Node with upstream's own test signing
// key. If GrantCycleRegistry's ABI-encoding of the signal, or its call into
// IAnonAadhaar, ever drifted from what a real proof actually produces, the
// Solidity unit tests (which use MockAnonAadhaar) would not catch it --
// only this test would.
// Proof generation is CPU/memory-heavy (~35s per proof on this machine when
// run standalone -- see scripts/bench-proof.ts and NOTES-FOR-REVIEW.md), and
// this cache is only warm after the first run. A generous timeout here means
// a cold cache (or a slower/loaded machine) doesn't spuriously fail the
// suite; the disk cache in test/helpers/proofCache.ts is what keeps reruns
// fast in practice.
describe("GrantCycleRegistry with a real proof", { timeout: 1_800_000 }, async function () {
  const { viem } = await network.create();
  const [owner, relayer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  const appId = pad(("0x" + "1".repeat(32)) as `0x${string}`, { size: 32 });
  const cycleId = keccak256(toHex("realproof-test-cycle"));
  const nullifierSeed = 424242n;

  it("verifies and records a real proof end-to-end", async function () {
    const verifier = await viem.deployContract("VerifierDeploy");
    const anonAadhaar = await viem.deployContract("AnonAadhaarDeploy", [
      verifier.address,
      BigInt(testPublicKeyHash),
    ]);

    const now = BigInt(Math.floor(Date.now() / 1000));
    const registry = await viem.deployContract("GrantCycleRegistry", [
      owner.account.address,
      anonAadhaar.address,
      relayer.account.address,
      nullifierSeed,
      cycleId,
      now - 60n,
      now + 3600n,
    ]);

    // Compute the signal exactly the way the contract does:
    // uint256(keccak256(abi.encode(chainid, address(this), cycleId, appId)))
    const chainId = BigInt(await publicClient.getChainId());
    const encoded = encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "bytes32" }],
      [chainId, registry.address, cycleId, appId],
    );
    const signal = BigInt(keccak256(encoded));

    const onChainSignal = await registry.read.signalFor([appId]);
    assert.equal(onChainSignal, signal, "off-chain signal formula must match the contract's");

    const proof = await generateRealTestProof({
      nullifierSeed,
      signal: signal.toString(),
    });

    assert.equal(proof.ageAbove18, "1");
    assert.equal(proof.nullifierSeed, nullifierSeed.toString());

    const packed = packGroth16Proof(proof.groth16Proof).map((v) => BigInt(v)) as [
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
    ];

    const relayerRegistry = await viem.getContractAt(
      "GrantCycleRegistry",
      registry.address,
      { client: { wallet: relayer } },
    );

    await viem.assertions.emitWithArgs(
      relayerRegistry.write.recordApplication([
        appId,
        BigInt(proof.nullifier),
        BigInt(proof.timestamp),
        [1n, 0n, 0n, 0n],
        packed,
      ]),
      registry,
      "ApplicationRecorded",
      [appId, BigInt(proof.nullifier), BigInt(proof.timestamp)],
    );

    assert.equal(await registry.read.applicationRecorded([appId]), true);
    assert.equal(await registry.read.nullifierUsedBy([BigInt(proof.nullifier)]), appId);
  });

  it("rejects the same real proof's nullifier a second time under a different appId", async function () {
    const verifier = await viem.deployContract("VerifierDeploy");
    const anonAadhaar = await viem.deployContract("AnonAadhaarDeploy", [
      verifier.address,
      BigInt(testPublicKeyHash),
    ]);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const registry = await viem.deployContract("GrantCycleRegistry", [
      owner.account.address,
      anonAadhaar.address,
      relayer.account.address,
      nullifierSeed,
      cycleId,
      now - 60n,
      now + 3600n,
    ]);

    const appId1 = padHex("0x01", { size: 32 });
    const appId2 = padHex("0x02", { size: 32 });

    const chainId = BigInt(await publicClient.getChainId());
    const signalFor = (id: `0x${string}`) =>
      BigInt(
        keccak256(
          encodeAbiParameters(
            [{ type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "bytes32" }],
            [chainId, registry.address, cycleId, id],
          ),
        ),
      );

    const proof = await generateRealTestProof({
      nullifierSeed,
      signal: signalFor(appId1).toString(),
    });
    const packed = packGroth16Proof(proof.groth16Proof).map((v) => BigInt(v)) as [
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
    ];

    const relayerRegistry = await viem.getContractAt(
      "GrantCycleRegistry",
      registry.address,
      { client: { wallet: relayer } },
    );

    await relayerRegistry.write.recordApplication([
      appId1,
      BigInt(proof.nullifier),
      BigInt(proof.timestamp),
      [1n, 0n, 0n, 0n],
      packed,
    ]);

    // Reusing the SAME nullifier (same underlying human, same proof) under
    // a different appId must be rejected -- this is the actual "one claim
    // per human" property, exercised here with a real nullifier value
    // instead of an arbitrary test integer.
    await assert.rejects(
      relayerRegistry.write.recordApplication([
        appId2,
        BigInt(proof.nullifier),
        BigInt(proof.timestamp),
        [1n, 0n, 0n, 0n],
        packed,
      ]),
    );
  });
});
