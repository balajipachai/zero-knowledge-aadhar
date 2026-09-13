// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.28;

import {AnonAadhaar} from "@anon-aadhaar/contracts/src/AnonAadhaar.sol";

/// @notice See VerifierDeploy.sol for why this trivial subclass exists: it
/// gives Hardhat a project-owned source to generate a deployable artifact
/// for the real upstream `AnonAadhaar` contract. It adds no logic beyond
/// forwarding the constructor.
contract AnonAadhaarDeploy is AnonAadhaar {
    constructor(address verifier_, uint256 pubkeyHash_) AnonAadhaar(verifier_, pubkeyHash_) {}
}
