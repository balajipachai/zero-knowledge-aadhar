// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Verifier} from "@anon-aadhaar/contracts/src/Verifier.sol";

/// @notice Hardhat 3 only writes artifacts for contracts defined in this
/// project's own sources, not for npm-dependency contracts it merely
/// compiles as part of the import graph (see GrantCycleRegistry.sol, which
/// only ever touches the `IAnonAadhaar` interface). To deploy the real
/// upstream `Verifier` contract in tests and via Ignition, this trivial,
/// logic-free subclass gives Hardhat something in `contracts/` to generate
/// an artifact for. It adds nothing and overrides nothing -- its bytecode
/// behavior is identical to `Verifier` itself.
contract VerifierDeploy is Verifier {}
