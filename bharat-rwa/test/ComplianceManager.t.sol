// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {ComplianceManager} from "../src/ComplianceManager.sol";
import {MockZKVerifier} from "./mocks/MockZKVerifier.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract ComplianceManagerTest is Test {
    ComplianceManager public compliance;
    MockZKVerifier public mockVerifier;

    address public admin = makeAddr("admin");
    address public complianceOfficer = makeAddr("complianceOfficer");
    address public investor1 = makeAddr("investor1");
    address public investor2 = makeAddr("investor2");
    address public unauthorized = makeAddr("unauthorized");

    function setUp() public {
        mockVerifier = new MockZKVerifier(true);

        ComplianceManager impl = new ComplianceManager();
        bytes memory initData = abi.encodeWithSelector(ComplianceManager.initialize.selector, admin, address(mockVerifier));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        compliance = ComplianceManager(address(proxy));

        // Grant compliance role to officer
        vm.startPrank(admin);
        compliance.grantRole(compliance.COMPLIANCE_ROLE(), complianceOfficer);
        vm.stopPrank();
    }

    // ============================================================
    //                    INITIALIZATION
    // ============================================================

    function test_InitializeSetsCorrectValues() public view {
        assertEq(address(compliance.zkVerifier()), address(mockVerifier));
        assertTrue(compliance.hasRole(compliance.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(compliance.hasRole(compliance.COMPLIANCE_ROLE(), admin));
    }

    function test_RevertDoubleInitialize() public {
        vm.expectRevert();
        compliance.initialize(admin, address(mockVerifier));
    }

    // ============================================================
    //                   MANUAL APPROVAL
    // ============================================================

    function test_ManualApprove() public {
        vm.prank(complianceOfficer);
        compliance.manualApprove(investor1);
        assertTrue(compliance.isApproved(investor1));
        assertEq(compliance.totalApproved(), 1);
    }

    function test_ManualApproveEmitsEvent() public {
        vm.prank(complianceOfficer);
        vm.expectEmit(true, true, false, false);
        emit ComplianceManager.InvestorManuallyApproved(investor1, complianceOfficer);
        compliance.manualApprove(investor1);
    }

    function test_RevertManualApproveAlreadyApproved() public {
        vm.prank(complianceOfficer);
        compliance.manualApprove(investor1);

        vm.prank(complianceOfficer);
        vm.expectRevert(abi.encodeWithSelector(ComplianceManager.AlreadyApproved.selector, investor1));
        compliance.manualApprove(investor1);
    }

    function test_RevertManualApproveByUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        compliance.manualApprove(investor1);
    }

    function test_RevertManualApproveZeroAddress() public {
        vm.prank(complianceOfficer);
        vm.expectRevert(ComplianceManager.ZeroAddress.selector);
        compliance.manualApprove(address(0));
    }

    // ============================================================
    //                   REVOKE APPROVAL
    // ============================================================

    function test_RevokeApproval() public {
        vm.startPrank(complianceOfficer);
        compliance.manualApprove(investor1);
        compliance.revokeApproval(investor1);
        vm.stopPrank();

        assertFalse(compliance.isApproved(investor1));
        assertEq(compliance.totalApproved(), 0);
    }

    function test_RevertRevokeNotApproved() public {
        vm.prank(complianceOfficer);
        vm.expectRevert(abi.encodeWithSelector(ComplianceManager.NotApproved.selector, investor1));
        compliance.revokeApproval(investor1);
    }

    // ============================================================
    //                   BLACKLISTING
    // ============================================================

    function test_Blacklist() public {
        vm.prank(complianceOfficer);
        compliance.blacklist(investor1);
        assertTrue(compliance.isBlacklisted(investor1));
        assertEq(compliance.totalBlacklisted(), 1);
    }

    function test_RemoveBlacklist() public {
        vm.startPrank(complianceOfficer);
        compliance.blacklist(investor1);
        compliance.removeBlacklist(investor1);
        vm.stopPrank();

        assertFalse(compliance.isBlacklisted(investor1));
        assertEq(compliance.totalBlacklisted(), 0);
    }

    function test_RevertBlacklistAlreadyBlacklisted() public {
        vm.startPrank(complianceOfficer);
        compliance.blacklist(investor1);

        vm.expectRevert(abi.encodeWithSelector(ComplianceManager.AlreadyBlacklisted.selector, investor1));
        compliance.blacklist(investor1);
        vm.stopPrank();
    }

    function test_RevertRemoveBlacklistNotBlacklisted() public {
        vm.prank(complianceOfficer);
        vm.expectRevert(abi.encodeWithSelector(ComplianceManager.NotBlacklisted.selector, investor1));
        compliance.removeBlacklist(investor1);
    }

    function test_RevertBlacklistByUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        compliance.blacklist(investor1);
    }

    // ============================================================
    //                   TRANSFER COMPLIANCE
    // ============================================================

    function test_TransferCompliantBothApproved() public {
        vm.startPrank(complianceOfficer);
        compliance.manualApprove(investor1);
        compliance.manualApprove(investor2);
        vm.stopPrank();

        assertTrue(compliance.isTransferCompliant(investor1, investor2));
    }

    function test_TransferNotCompliantOneUnapproved() public {
        vm.prank(complianceOfficer);
        compliance.manualApprove(investor1);

        assertFalse(compliance.isTransferCompliant(investor1, investor2));
        assertFalse(compliance.isTransferCompliant(investor2, investor1));
    }

    function test_TransferNotCompliantBlacklisted() public {
        vm.startPrank(complianceOfficer);
        compliance.manualApprove(investor1);
        compliance.manualApprove(investor2);
        compliance.blacklist(investor1);
        vm.stopPrank();

        assertFalse(compliance.isTransferCompliant(investor1, investor2));
    }

    // ============================================================
    //                   ZK VERIFICATION
    // ============================================================

    function test_VerifyAndApprove() public {
        bytes memory fakeProof = hex"1234";
        bytes32[] memory publicInputs = new bytes32[](1);
        publicInputs[0] = bytes32(uint256(12345)); // expected_wallet_hash

        vm.prank(investor1);
        compliance.verifyAndApprove(fakeProof, publicInputs);

        assertTrue(compliance.isApproved(investor1));
    }

    function test_RevertVerifyWithInvalidProof() public {
        mockVerifier.setShouldVerify(false);

        bytes memory fakeProof = hex"1234";
        bytes32[] memory publicInputs = new bytes32[](1);
        publicInputs[0] = bytes32(uint256(12345));

        vm.prank(investor1);
        vm.expectRevert(ComplianceManager.ZKProofInvalid.selector);
        compliance.verifyAndApprove(fakeProof, publicInputs);
    }

    function test_RevertVerifyReplayAttack() public {
        bytes memory fakeProof = hex"1234";
        bytes32[] memory publicInputs = new bytes32[](1);
        publicInputs[0] = bytes32(uint256(12345));

        vm.prank(investor1);
        compliance.verifyAndApprove(fakeProof, publicInputs);

        // Second attempt with same inputs from same sender should fail
        vm.prank(investor1);
        vm.expectRevert(); // NullifierAlreadyUsed
        compliance.verifyAndApprove(fakeProof, publicInputs);
    }

    function test_RevertVerifyEmptyPublicInputs() public {
        bytes memory fakeProof = hex"1234";
        bytes32[] memory publicInputs = new bytes32[](0);

        vm.prank(investor1);
        vm.expectRevert(ComplianceManager.ZKProofInvalid.selector);
        compliance.verifyAndApprove(fakeProof, publicInputs);
    }

    // ============================================================
    //                   ADMIN FUNCTIONS
    // ============================================================

    function test_UpdateZKVerifier() public {
        MockZKVerifier newVerifier = new MockZKVerifier(true);

        vm.prank(admin);
        compliance.setZKVerifier(address(newVerifier));

        assertEq(address(compliance.zkVerifier()), address(newVerifier));
    }

    function test_RevertUpdateZKVerifierByNonAdmin() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        compliance.setZKVerifier(makeAddr("newVerifier"));
    }

    function test_RevertUpdateZKVerifierToZero() public {
        vm.prank(admin);
        vm.expectRevert(ComplianceManager.ZeroAddress.selector);
        compliance.setZKVerifier(address(0));
    }
}
