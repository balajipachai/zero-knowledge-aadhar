// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IAnonAadhaar} from "@anon-aadhaar/contracts/interfaces/IAnonAadhaar.sol";

/// @title GrantCycleRegistry
/// @notice On-chain anchor for a single grant cycle's applications. One
/// instance is deployed per cycle (a fresh `nullifierSeed`, `cycleId` and
/// application window each time), so a nullifier that leaked meaning across
/// cycles is architecturally impossible: it's simply a different contract.
///
/// The registry is the second, independent verification of every proof. The
/// off-chain server (see src/server/intake/submit.ts) verifies the proof and
/// records the application in Postgres first; the relayer then anchors the
/// same application here, and this contract re-runs
/// `IAnonAadhaar.verifyAnonAadhaarProof` itself rather than trusting the
/// caller's say-so. Nothing about the off-chain path is a precondition for
/// this contract's own checks — a relayer that skipped the off-chain path
/// entirely would still be held to the same rules here.
///
/// Design notes:
/// - `nullifierSeed`, `cycleId`, `opensAt` and `closesAt` are immutable:
///   fixed at deployment, never settable by any role, so nothing on-chain
///   can silently redefine "which cycle is this" or "what seed do proofs
///   have to be bound to" after the fact.
/// - `relayer` is the one mutable piece of privileged state, and is
///   `onlyOwner`-settable so a compromised or rotated relayer key can be
///   replaced without redeploying the registry (which would orphan already
///   anchored applications).
/// - `recordApplication` follows Checks-Effects-Interactions: every guard
///   (window, duplicate appId, duplicate nullifier, eligibility, proof
///   validity) runs before any state is written, and the one "external
///   call" (`anonAadhaar.verifyAnonAadhaarProof`) is a `view` call with no
///   ability to reenter and mutate this contract's storage.
contract GrantCycleRegistry is Ownable2Step {
    /// @notice The deployed AnonAadhaar verifier contract for this network.
    IAnonAadhaar public immutable anonAadhaar;

    /// @notice The nullifier seed every proof for this cycle must be bound
    /// to. Fixed at deployment; never accepted from a caller.
    uint256 public immutable nullifierSeed;

    /// @notice Opaque identifier for this grant cycle (e.g.
    /// keccak256("2026-h1")), used only to namespace events/state and to let
    /// off-chain tooling group applications by cycle.
    bytes32 public immutable cycleId;

    /// @notice Unix timestamp (inclusive) from which applications may be
    /// recorded.
    uint256 public immutable opensAt;

    /// @notice Unix timestamp (inclusive) until which applications may be
    /// recorded.
    uint256 public immutable closesAt;

    /// @notice The address permitted to call `recordApplication`. Rotatable
    /// by the owner; not immutable, because a relayer key can be rotated
    /// without losing the cycle's identity.
    address public relayer;

    /// @notice appId => whether an application has already been recorded
    /// under that id. appId is the same id the off-chain draft/application
    /// row uses, so this also guards against replaying the same
    /// application twice (as opposed to the same *human* twice, which the
    /// nullifier mapping below guards against).
    mapping(bytes32 => bool) public applicationRecorded;

    /// @notice nullifier => the appId that consumed it, or bytes32(0) if
    /// unused. This is the actual "one claim per human, per cycle"
    /// enforcement: a nullifier is derived deterministically from the
    /// applicant's Aadhaar signing key and this cycle's nullifierSeed, so
    /// the same person always produces the same nullifier here, regardless
    /// of how many times or under how many different appIds they try.
    mapping(uint256 => bytes32) public nullifierUsedBy;

    event RelayerUpdated(address indexed previousRelayer, address indexed newRelayer);

    event ApplicationRecorded(
        bytes32 indexed appId,
        uint256 indexed nullifier,
        uint256 timestamp
    );

    error ZeroAddress();
    error CycleNotOpen(uint256 nowTimestamp, uint256 opensAt, uint256 closesAt);
    error ApplicationAlreadyRecorded(bytes32 appId);
    error NullifierAlreadyUsed(uint256 nullifier, bytes32 usedByAppId);
    error NotEligible();
    error OverDisclosure();
    error InvalidProof();
    error NotRelayer(address caller);
    error InvalidWindow(uint256 opensAt, uint256 closesAt);

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer(msg.sender);
        _;
    }

    constructor(
        address initialOwner,
        address anonAadhaar_,
        address relayer_,
        uint256 nullifierSeed_,
        bytes32 cycleId_,
        uint256 opensAt_,
        uint256 closesAt_
    ) Ownable(initialOwner) {
        if (anonAadhaar_ == address(0) || relayer_ == address(0)) revert ZeroAddress();
        if (opensAt_ >= closesAt_) revert InvalidWindow(opensAt_, closesAt_);

        anonAadhaar = IAnonAadhaar(anonAadhaar_);
        relayer = relayer_;
        nullifierSeed = nullifierSeed_;
        cycleId = cycleId_;
        opensAt = opensAt_;
        closesAt = closesAt_;

        emit RelayerUpdated(address(0), relayer_);
    }

    /// @notice Rotates the relayer address. Owner-only.
    function setRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) revert ZeroAddress();
        address previous = relayer;
        relayer = newRelayer;
        emit RelayerUpdated(previous, newRelayer);
    }

    /// @notice The signal every proof for `appId` must carry, computed
    /// identically to `src/server/zk/signal.ts` on the server. Binding the
    /// signal to `block.chainid`, this contract's own address and `cycleId`
    /// means a proof generated for one deployment cannot be replayed
    /// against a different registry, network or cycle even if the appId
    /// collided.
    function signalFor(bytes32 appId) public view returns (uint256) {
        return uint256(keccak256(abi.encode(block.chainid, address(this), cycleId, appId)));
    }

    /// @notice Records one application on-chain after independently
    /// re-verifying its proof. Reverts with a specific error at the first
    /// check that fails; only relayer can call it.
    /// @param appId Off-chain application id (see src/server/intake).
    /// @param nullifier The proof's nullifier (public signal).
    /// @param timestamp The proof's QR-signing timestamp (public signal).
    /// @param revealArray [ageAbove18, gender, pincode, state] revealed
    /// values as produced by the proof; only ageAbove18 is checked here.
    /// @param groth16Proof Packed groth16 proof (see
    /// the anon-aadhaar/core package's `packGroth16Proof`).
    function recordApplication(
        bytes32 appId,
        uint256 nullifier,
        uint256 timestamp,
        uint256[4] calldata revealArray,
        uint256[8] calldata groth16Proof
    ) external onlyRelayer {
        // 1. Cycle window must be open.
        if (block.timestamp < opensAt || block.timestamp > closesAt) {
            revert CycleNotOpen(block.timestamp, opensAt, closesAt);
        }

        // 2. This application must not already be recorded.
        if (applicationRecorded[appId]) revert ApplicationAlreadyRecorded(appId);

        // 3. This human (nullifier) must not have already claimed a slot
        // this cycle.
        bytes32 usedBy = nullifierUsedBy[nullifier];
        if (usedBy != bytes32(0)) revert NullifierAlreadyUsed(nullifier, usedBy);

        // 4. Eligibility: the proof must reveal ageAbove18 == 1.
        if (revealArray[0] != 1) revert NotEligible();

        // 4b. Defense in depth: only ageAbove18 may ever be revealed. The
        // off-chain server (src/server/intake/submit.ts) already rejects
        // any proof revealing gender/pincode/state before it ever reaches
        // the relayer, but this contract re-checks independently -- same
        // reasoning as every other check here (see the contract-level
        // doc comment above): a relayer that skipped or was tricked past
        // the off-chain path must still be unable to publish Aadhaar-
        // decoded fields on-chain via this calldata.
        if (revealArray[1] != 0 || revealArray[2] != 0 || revealArray[3] != 0) {
            revert OverDisclosure();
        }

        // 5. Proof must verify against this application's own signal.
        uint256 signal = signalFor(appId);
        bool ok = anonAadhaar.verifyAnonAadhaarProof(
            nullifierSeed,
            nullifier,
            timestamp,
            signal,
            revealArray,
            groth16Proof
        );
        if (!ok) revert InvalidProof();

        // Effects (all checks passed; nothing below can fail except by
        // running out of gas, which reverts the whole transaction anyway).
        applicationRecorded[appId] = true;
        nullifierUsedBy[nullifier] = appId;

        emit ApplicationRecorded(appId, nullifier, timestamp);
    }
}
