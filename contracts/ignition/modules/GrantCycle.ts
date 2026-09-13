import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { testPublicKeyHash } from "@anon-aadhaar/core";

/**
 * Deploys one grant cycle's full on-chain stack:
 *   Verifier (upstream groth16 verifier, v2.0.0 artifacts)
 *     -> AnonAadhaar(verifier, pubkeyHash)
 *          -> GrantCycleRegistry(owner, anonAadhaar, relayer, nullifierSeed, cycleId, opensAt, closesAt)
 *
 * Every value that identifies *this* cycle (pubkeyHash, nullifierSeed,
 * cycleId, opensAt, closesAt, relayer, owner) is a required Ignition
 * parameter -- there is deliberately no default for any of them beyond
 * pubkeyHash, so a new cycle can never accidentally reuse the previous
 * cycle's window or seed by omission.
 *
 * Local dev / CI:
 *   npx hardhat ignition deploy ignition/modules/GrantCycle.ts \
 *     --network hardhatMainnet \
 *     --parameters ignition/parameters.local.json
 *
 * Sepolia (run by the orchestrator only, never from this repo's CI):
 *   npx hardhat keystore set SEPOLIA_RPC_URL
 *   npx hardhat keystore set SEPOLIA_PRIVATE_KEY
 *   npx hardhat ignition deploy ignition/modules/GrantCycle.ts \
 *     --network sepolia \
 *     --parameters ignition/parameters.sepolia.json
 *   npx hardhat verify --network sepolia <address> <constructor args...>
 */
export default buildModule("GrantCycleModule", (m) => {
  // Every uint256-shaped parameter is declared with the <bigint> generic;
  // Ignition's JSON parameter loader accepts a decimal string in the
  // parameters file for these and coerces it to a real bigint Future at
  // resolution time (a JSON *number* would lose precision above 2^53, so
  // the parameters files always use strings here).

  // Test-mode AnonAadhaar public key hash (testPublicKeyHash from
  // @anon-aadhaar/core@2.4.3). Override with the production hash via the
  // parameters file when ANON_AADHAAR_MODE=production.
  const pubkeyHash = m.getParameter<bigint>(
    "pubkeyHash",
    BigInt(testPublicKeyHash),
  );

  const owner = m.getParameter<string>("owner");
  const relayer = m.getParameter<string>("relayer");
  const nullifierSeed = m.getParameter<bigint>("nullifierSeed");
  const cycleId = m.getParameter<string>("cycleId");
  const opensAt = m.getParameter<bigint>("opensAt");
  const closesAt = m.getParameter<bigint>("closesAt");

  // "*Deploy" are trivial, logic-free subclasses defined in
  // contracts/vendor/ -- Hardhat 3 only emits deployable artifacts for
  // contracts defined in this project's own sources, not for npm-dependency
  // contracts it merely compiles as part of an interface import. Bytecode
  // behavior is identical to the upstream Verifier/AnonAadhaar contracts.
  const verifier = m.contract("VerifierDeploy");
  const anonAadhaar = m.contract("AnonAadhaarDeploy", [verifier, pubkeyHash]);
  const registry = m.contract("GrantCycleRegistry", [
    owner,
    anonAadhaar,
    relayer,
    nullifierSeed,
    cycleId,
    opensAt,
    closesAt,
  ]);

  return { verifier, anonAadhaar, registry };
});
