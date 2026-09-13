// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {GrantCycleRegistry} from "./GrantCycleRegistry.sol";
import {MockAnonAadhaar} from "./mocks/MockAnonAadhaar.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract GrantCycleRegistryTest is Test {
    GrantCycleRegistry registry;
    MockAnonAadhaar mockVerifier;

    address owner = address(0xA11CE);
    address relayer = address(0xBEEF);
    address stranger = address(0xBAD);

    uint256 constant SEED = 12345;
    bytes32 constant CYCLE_ID = keccak256("cycle-2026-h1");
    uint256 opensAt;
    uint256 closesAt;

    uint256[4] eligibleReveal = [uint256(1), 0, 0, 0];
    uint256[4] ineligibleReveal = [uint256(0), 0, 0, 0];
    uint256[8] dummyProof = [uint256(1), 2, 3, 4, 5, 6, 7, 8];

    function setUp() public {
        opensAt = block.timestamp;
        closesAt = block.timestamp + 30 days;

        mockVerifier = new MockAnonAadhaar();
        vm.prank(owner);
        registry = new GrantCycleRegistry(
            owner,
            address(mockVerifier),
            relayer,
            SEED,
            CYCLE_ID,
            opensAt,
            closesAt
        );
    }

    function _record(bytes32 appId, uint256 nullifier, uint256[4] memory reveal) internal {
        vm.prank(relayer);
        registry.recordApplication(appId, nullifier, block.timestamp, reveal, dummyProof);
    }

    // ---- constructor invariants ----

    function test_ConstructorSetsImmutables() public view {
        require(address(registry.anonAadhaar()) == address(mockVerifier), "verifier");
        require(registry.nullifierSeed() == SEED, "seed");
        require(registry.cycleId() == CYCLE_ID, "cycleId");
        require(registry.opensAt() == opensAt, "opensAt");
        require(registry.closesAt() == closesAt, "closesAt");
        require(registry.relayer() == relayer, "relayer");
        require(registry.owner() == owner, "owner");
    }

    function test_RevertWhen_ConstructorZeroVerifier() public {
        vm.expectRevert(GrantCycleRegistry.ZeroAddress.selector);
        new GrantCycleRegistry(owner, address(0), relayer, SEED, CYCLE_ID, opensAt, closesAt);
    }

    function test_RevertWhen_ConstructorInvalidWindow() public {
        vm.expectRevert(
            abi.encodeWithSelector(GrantCycleRegistry.InvalidWindow.selector, closesAt, opensAt)
        );
        new GrantCycleRegistry(owner, address(mockVerifier), relayer, SEED, CYCLE_ID, closesAt, opensAt);
    }

    // ---- access control ----

    function test_RevertWhen_NonRelayerRecords() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(GrantCycleRegistry.NotRelayer.selector, stranger));
        registry.recordApplication(bytes32(uint256(1)), 1, block.timestamp, eligibleReveal, dummyProof);
    }

    function test_RevertWhen_NonOwnerSetsRelayer() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        registry.setRelayer(stranger);
    }

    function test_OwnerCanRotateRelayer() public {
        vm.prank(owner);
        registry.setRelayer(stranger);
        require(registry.relayer() == stranger, "relayer not rotated");
    }

    function test_Ownable2Step_RequiresAcceptance() public {
        vm.prank(owner);
        registry.transferOwnership(stranger);
        // Ownership must NOT transfer until accepted.
        require(registry.owner() == owner, "transferred too early");
        vm.prank(stranger);
        registry.acceptOwnership();
        require(registry.owner() == stranger, "not transferred after accept");
    }

    // ---- window ----

    function test_RevertWhen_BeforeWindowOpens() public {
        // Deploy a registry whose window opens in the future instead of
        // warping backwards (warp cannot move time backwards).
        GrantCycleRegistry future = new GrantCycleRegistry(
            owner,
            address(mockVerifier),
            relayer,
            SEED,
            CYCLE_ID,
            block.timestamp + 1 days,
            block.timestamp + 2 days
        );
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(
                GrantCycleRegistry.CycleNotOpen.selector,
                block.timestamp,
                block.timestamp + 1 days,
                block.timestamp + 2 days
            )
        );
        future.recordApplication(bytes32(uint256(1)), 1, block.timestamp, eligibleReveal, dummyProof);
    }

    function test_RevertWhen_AfterWindowCloses() public {
        vm.warp(closesAt + 1);
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(
                GrantCycleRegistry.CycleNotOpen.selector,
                closesAt + 1,
                opensAt,
                closesAt
            )
        );
        registry.recordApplication(bytes32(uint256(1)), 1, block.timestamp, eligibleReveal, dummyProof);
    }

    // ---- duplicate appId ----

    function test_RevertWhen_ApplicationAlreadyRecorded() public {
        bytes32 appId = bytes32(uint256(1));
        _record(appId, 111, eligibleReveal);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(GrantCycleRegistry.ApplicationAlreadyRecorded.selector, appId)
        );
        registry.recordApplication(appId, 222, block.timestamp, eligibleReveal, dummyProof);
    }

    // ---- duplicate nullifier: the core "one claim per human" property ----

    function test_RevertWhen_NullifierAlreadyUsed() public {
        bytes32 appId1 = bytes32(uint256(1));
        bytes32 appId2 = bytes32(uint256(2));
        uint256 nullifier = 999;

        _record(appId1, nullifier, eligibleReveal);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(
                GrantCycleRegistry.NullifierAlreadyUsed.selector,
                nullifier,
                appId1
            )
        );
        registry.recordApplication(appId2, nullifier, block.timestamp, eligibleReveal, dummyProof);
    }

    // ---- eligibility ----

    function test_RevertWhen_NotEligible() public {
        vm.prank(relayer);
        vm.expectRevert(GrantCycleRegistry.NotEligible.selector);
        registry.recordApplication(bytes32(uint256(1)), 1, block.timestamp, ineligibleReveal, dummyProof);
    }

    // ---- over-disclosure (defense in depth against publishing
    // Aadhaar-decoded fields on-chain) ----

    function test_RevertWhen_GenderRevealed() public {
        uint256[4] memory reveal = [uint256(1), 1, 0, 0];
        vm.prank(relayer);
        vm.expectRevert(GrantCycleRegistry.OverDisclosure.selector);
        registry.recordApplication(bytes32(uint256(1)), 1, block.timestamp, reveal, dummyProof);
    }

    function test_RevertWhen_PincodeRevealed() public {
        uint256[4] memory reveal = [uint256(1), 0, 400001, 0];
        vm.prank(relayer);
        vm.expectRevert(GrantCycleRegistry.OverDisclosure.selector);
        registry.recordApplication(bytes32(uint256(1)), 1, block.timestamp, reveal, dummyProof);
    }

    function test_RevertWhen_StateRevealed() public {
        uint256[4] memory reveal = [uint256(1), 0, 0, 27];
        vm.prank(relayer);
        vm.expectRevert(GrantCycleRegistry.OverDisclosure.selector);
        registry.recordApplication(bytes32(uint256(1)), 1, block.timestamp, reveal, dummyProof);
    }

    // ---- proof validity ----

    function test_RevertWhen_ProofInvalid() public {
        mockVerifier.setNextResult(false);
        vm.prank(relayer);
        vm.expectRevert(GrantCycleRegistry.InvalidProof.selector);
        registry.recordApplication(bytes32(uint256(1)), 1, block.timestamp, eligibleReveal, dummyProof);
    }

    // ---- happy path ----

    function test_RecordApplication_Success() public {
        bytes32 appId = bytes32(uint256(1));
        uint256 nullifier = 42;

        vm.expectEmit(true, true, false, true, address(registry));
        emit GrantCycleRegistry.ApplicationRecorded(appId, nullifier, block.timestamp);

        _record(appId, nullifier, eligibleReveal);

        require(registry.applicationRecorded(appId), "not recorded");
        require(registry.nullifierUsedBy(nullifier) == appId, "nullifier not bound");
    }

    function test_SignalFor_IsDeterministicAndAppSpecific() public view {
        bytes32 appId1 = bytes32(uint256(1));
        bytes32 appId2 = bytes32(uint256(2));
        require(registry.signalFor(appId1) == registry.signalFor(appId1), "not deterministic");
        require(registry.signalFor(appId1) != registry.signalFor(appId2), "not app-specific");
    }
}
