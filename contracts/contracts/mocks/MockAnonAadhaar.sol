// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAnonAadhaar} from "@anon-aadhaar/contracts/interfaces/IAnonAadhaar.sol";

/// @notice Test-only stand-in for the real AnonAadhaar verifier contract.
/// Lets `GrantCycleRegistry`'s Solidity unit tests exercise every branch of
/// `recordApplication` (window, duplicate, eligibility, proof validity)
/// without needing a real groth16 proof, while the TS integration test in
/// `test/GrantCycleRegistry.realproof.ts` still runs against the actual
/// the anon-aadhaar/contracts package's Verifier with a real proof.
contract MockAnonAadhaar is IAnonAadhaar {
    bool public nextResult = true;

    function setNextResult(bool value) external {
        nextResult = value;
    }

    function verifyAnonAadhaarProof(
        uint256,
        uint256,
        uint256,
        uint256,
        uint256[4] memory,
        uint256[8] memory
    ) external view returns (bool) {
        return nextResult;
    }
}
