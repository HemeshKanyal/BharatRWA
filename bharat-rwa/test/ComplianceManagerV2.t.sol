// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ComplianceManagerV2} from "../src/ComplianceManagerV2.sol";
import {BharatRWAToken} from "../src/BharatRWAToken.sol";
import {WalletBoundHonkVerifier} from "../src/zk/WalletBoundHonkVerifier.sol";
import {MockZKVerifier} from "./mocks/MockZKVerifier.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract ComplianceManagerV2Test is Test {
    ComplianceManagerV2 public cm; // uses the real wallet-bound Honk verifier
    ComplianceManagerV2 public cmMock; // uses a verifier that always says yes
    WalletBoundHonkVerifier public honk;

    address public admin = makeAddr("admin");
    address public officer = makeAddr("officer");
    address public mallory = makeAddr("mallory");

    /// @dev The fixture proof was generated for this wallet (see Makefile: zk-verifier-wallet-bound).
    address constant PROVEN_WALLET = 0x1111111111111111111111111111111111111111;
    uint64 constant VALIDITY = 180 days;

    bytes proof;
    bytes32[] publicInputs;

    function _deploy(address verifier) internal returns (ComplianceManagerV2) {
        ComplianceManagerV2 impl = new ComplianceManagerV2();
        return ComplianceManagerV2(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(ComplianceManagerV2.initialize, (admin, verifier, VALIDITY))
                )
            )
        );
    }

    function setUp() public {
        honk = new WalletBoundHonkVerifier();
        cm = _deploy(address(honk));
        cmMock = _deploy(address(new MockZKVerifier(true)));

        proof = vm.readFileBinary("test/fixtures/zk/proof");
        bytes memory raw = vm.readFileBinary("test/fixtures/zk/public_inputs");
        assertEq(raw.length, 6 * 32, "fixture should hold 6 public inputs");
        for (uint256 i; i < 6; i++) {
            bytes32 word;
            assembly {
                word := mload(add(add(raw, 32), mul(i, 32)))
            }
            publicInputs.push(word);
        }

        vm.startPrank(admin);
        cm.grantRole(cm.COMPLIANCE_ROLE(), officer);
        cmMock.grantRole(cmMock.COMPLIANCE_ROLE(), officer);
        vm.stopPrank();
    }

    /// @dev Public inputs for `wallet` that pass the contract's own checks (for the mock verifier).
    function _inputsFor(address wallet, bytes32 nullifier) internal pure returns (bytes32[] memory pi) {
        pi = new bytes32[](6);
        pi[0] = bytes32(uint256(uint160(wallet)));
        pi[1] = nullifier;
        pi[2] = bytes32(uint256(1));
        pi[3] = bytes32(uint256(1));
        pi[4] = bytes32(uint256(0));
        pi[5] = pi[0];
    }

    // ============================================================
    //                 REAL PROOF (END TO END)
    // ============================================================

    function test_FixtureLayoutMatchesContract() public view {
        assertEq(publicInputs[cm.PI_WALLET()], bytes32(uint256(uint160(PROVEN_WALLET))));
        assertEq(publicInputs[cm.PI_WALLET_OUT()], bytes32(uint256(uint160(PROVEN_WALLET))));
        assertEq(uint256(publicInputs[cm.PI_AGE_FLAG()]), 1);
        assertEq(uint256(publicInputs[cm.PI_KYC_FLAG()]), 1);
        assertEq(uint256(publicInputs[cm.PI_SANCTION_FLAG()]), 0);
    }

    function test_RealProofVerifiesDirectly() public view {
        assertTrue(honk.verify(proof, publicInputs));
    }

    function test_RealProofApprovesTheProvenWallet() public {
        vm.prank(PROVEN_WALLET);
        cm.verifyAndApprove(proof, publicInputs);

        assertTrue(cm.isApproved(PROVEN_WALLET));
        assertTrue(cm.usedNullifiers(publicInputs[1]));
        ComplianceManagerV2.Investor memory inv = cm.getInvestor(PROVEN_WALLET);
        assertEq(inv.expiresAt, uint64(block.timestamp) + VALIDITY);
        assertEq(inv.jurisdiction, bytes2(0));
    }

    function test_RevertRealProofFromAnotherWallet() public {
        vm.prank(mallory);
        vm.expectRevert(
            abi.encodeWithSelector(ComplianceManagerV2.ProofNotForSender.selector, publicInputs[0], mallory)
        );
        cm.verifyAndApprove(proof, publicInputs);
        assertFalse(cm.isApproved(mallory));
    }

    function test_RevertRealProofReplay() public {
        vm.prank(PROVEN_WALLET);
        cm.verifyAndApprove(proof, publicInputs);
        vm.prank(PROVEN_WALLET);
        vm.expectRevert(abi.encodeWithSelector(ComplianceManagerV2.NullifierAlreadyUsed.selector, publicInputs[1]));
        cm.verifyAndApprove(proof, publicInputs);
    }

    function test_RevertTamperedProof() public {
        bytes memory bad = proof;
        bad[100] = bytes1(uint8(bad[100]) ^ 0x01);
        vm.prank(PROVEN_WALLET);
        vm.expectRevert(ComplianceManagerV2.ZKProofInvalid.selector);
        cm.verifyAndApprove(bad, publicInputs);
    }

    function test_RevertTamperedNullifier() public {
        // Claiming a fresh nullifier with the same proof must fail verification.
        publicInputs[1] = bytes32(uint256(publicInputs[1]) ^ 1);
        vm.prank(PROVEN_WALLET);
        vm.expectRevert(ComplianceManagerV2.ZKProofInvalid.selector);
        cm.verifyAndApprove(proof, publicInputs);
    }

    function test_RevertGarbageProofThatV1SepoliaAccepts() public {
        // The live Sepolia ComplianceManager's verifier returns true for this input.
        vm.prank(PROVEN_WALLET);
        vm.expectRevert(ComplianceManagerV2.ZKProofInvalid.selector);
        cm.verifyAndApprove(hex"aaaaaaaa", publicInputs);
    }

    // ============================================================
    //                 PUBLIC INPUT VALIDATION
    // ============================================================

    function test_RevertWrongPublicInputCount() public {
        bytes32[] memory pi = new bytes32[](1);
        pi[0] = bytes32(uint256(uint160(PROVEN_WALLET)));
        vm.prank(PROVEN_WALLET);
        vm.expectRevert(ComplianceManagerV2.InvalidPublicInputs.selector);
        cm.verifyAndApprove(proof, pi);
    }

    function test_RevertWalletOutputMismatch() public {
        bytes32[] memory pi = _inputsFor(mallory, bytes32(uint256(7)));
        pi[5] = bytes32(uint256(uint160(admin)));
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(ComplianceManagerV2.ProofNotForSender.selector, pi[5], mallory));
        cmMock.verifyAndApprove("", pi);
    }

    function test_RevertWhenFlagsNotMet() public {
        bytes32[] memory pi = _inputsFor(mallory, bytes32(uint256(7)));
        pi[4] = bytes32(uint256(1)); // sanctioned
        vm.prank(mallory);
        vm.expectRevert(ComplianceManagerV2.KycConditionsNotMet.selector);
        cmMock.verifyAndApprove("", pi);

        pi[4] = 0;
        pi[2] = 0; // under 18
        vm.prank(mallory);
        vm.expectRevert(ComplianceManagerV2.KycConditionsNotMet.selector);
        cmMock.verifyAndApprove("", pi);
    }

    function test_RevertBlacklistedWalletCannotVerify() public {
        vm.prank(officer);
        cmMock.blacklist(mallory);
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(ComplianceManagerV2.WalletBlacklisted.selector, mallory));
        cmMock.verifyAndApprove("", _inputsFor(mallory, bytes32(uint256(7))));
    }

    function test_RevertWhenVerifierSaysNo() public {
        MockZKVerifier no = new MockZKVerifier(false);
        vm.prank(admin);
        cmMock.setZKVerifier(address(no));
        vm.prank(mallory);
        vm.expectRevert(ComplianceManagerV2.ZKProofInvalid.selector);
        cmMock.verifyAndApprove("", _inputsFor(mallory, bytes32(uint256(7))));
    }

    // ============================================================
    //               EXPIRY AND JURISDICTION
    // ============================================================

    function test_ApprovalExpires() public {
        vm.prank(mallory);
        cmMock.verifyAndApprove("", _inputsFor(mallory, bytes32(uint256(7))));
        assertTrue(cmMock.isApproved(mallory));
        vm.warp(block.timestamp + VALIDITY - 1);
        assertTrue(cmMock.isApproved(mallory));
        vm.warp(block.timestamp + 1);
        assertFalse(cmMock.isApproved(mallory));
    }

    function test_ReverifyKeepsJurisdictionAndRenewsExpiry() public {
        vm.prank(officer);
        cmMock.setInvestor(mallory, true, "AE", uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 2 days);
        assertFalse(cmMock.isApproved(mallory));

        vm.prank(mallory);
        cmMock.verifyAndApprove("", _inputsFor(mallory, bytes32(uint256(8))));
        ComplianceManagerV2.Investor memory inv = cmMock.getInvestor(mallory);
        assertEq(inv.jurisdiction, bytes2("AE"));
        assertEq(inv.expiresAt, uint64(block.timestamp) + VALIDITY);
    }

    function test_SetInvestorValidation() public {
        vm.startPrank(officer);
        vm.expectRevert(abi.encodeWithSelector(ComplianceManagerV2.InvalidJurisdiction.selector, bytes2("in")));
        cmMock.setInvestor(mallory, true, "in", uint64(block.timestamp + 1));

        vm.expectRevert(abi.encodeWithSelector(ComplianceManagerV2.ExpiryInPast.selector, uint64(block.timestamp)));
        cmMock.setInvestor(mallory, true, "IN", uint64(block.timestamp));

        // Revoked records may carry any expiry; unknown jurisdiction is 0x0000.
        cmMock.setInvestor(mallory, false, bytes2(0), 0);
        vm.expectRevert(ComplianceManagerV2.ZeroAddress.selector);
        cmMock.setInvestor(address(0), true, "IN", uint64(block.timestamp + 1));
        vm.stopPrank();
    }

    function test_RevokeAndBlacklist() public {
        vm.startPrank(officer);
        cmMock.setInvestor(mallory, true, "IN", uint64(block.timestamp + 1 days));
        cmMock.setInvestor(admin, true, "IN", uint64(block.timestamp + 1 days));
        assertTrue(cmMock.isTransferCompliant(mallory, admin));

        cmMock.blacklist(admin);
        assertTrue(cmMock.isApproved(admin)); // approval and blacklist are reported separately
        assertFalse(cmMock.isTransferCompliant(mallory, admin));
        cmMock.removeBlacklist(admin);

        cmMock.revokeApproval(mallory);
        assertFalse(cmMock.isApproved(mallory));
        assertEq(cmMock.getInvestor(mallory).jurisdiction, bytes2("IN"));
        vm.stopPrank();
    }

    // ============================================================
    //                    ROLE PERMISSIONS
    // ============================================================

    function test_OnlyComplianceRoleManagesInvestors() public {
        bytes32 role = cmMock.COMPLIANCE_ROLE();
        bytes memory err =
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, mallory, role);
        vm.startPrank(mallory);
        vm.expectRevert(err);
        cmMock.setInvestor(mallory, true, "IN", uint64(block.timestamp + 1));
        vm.expectRevert(err);
        cmMock.revokeApproval(officer);
        vm.expectRevert(err);
        cmMock.blacklist(officer);
        vm.stopPrank();
    }

    function test_OnlyAdminConfiguresAndUpgrades() public {
        bytes memory err =
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, officer, bytes32(0));
        vm.startPrank(officer); // has COMPLIANCE_ROLE but not admin
        vm.expectRevert(err);
        cmMock.setZKVerifier(address(1));
        vm.expectRevert(err);
        cmMock.setDefaultValidity(1);
        address newImpl = address(new ComplianceManagerV2());
        vm.expectRevert(err);
        cmMock.upgradeToAndCall(newImpl, "");
        vm.stopPrank();

        vm.prank(admin);
        cmMock.upgradeToAndCall(newImpl, "");
    }

    function test_InitializeValidation() public {
        ComplianceManagerV2 impl = new ComplianceManagerV2();
        vm.expectRevert(ComplianceManagerV2.InvalidValidity.selector);
        new ERC1967Proxy(address(impl), abi.encodeCall(ComplianceManagerV2.initialize, (admin, address(honk), 0)));
        vm.expectRevert(ComplianceManagerV2.ZeroAddress.selector);
        new ERC1967Proxy(address(impl), abi.encodeCall(ComplianceManagerV2.initialize, (admin, address(0), 1)));
        vm.expectRevert();
        cm.initialize(admin, address(honk), 1);
    }

    // ============================================================
    //            DROP-IN FOR THE EXISTING V1 TOKEN
    // ============================================================

    function test_V1TokenWorksWithComplianceManagerV2() public {
        BharatRWAToken v1 = new BharatRWAToken("Old", "OLD", 1_000 ether, admin, address(cmMock), 1);
        vm.prank(officer);
        cmMock.setInvestor(admin, true, "IN", uint64(block.timestamp + 1 days));
        vm.prank(mallory);
        cmMock.verifyAndApprove("", _inputsFor(mallory, bytes32(uint256(9))));

        vm.startPrank(admin);
        v1.mint(admin, 10 ether);
        v1.transfer(mallory, 1 ether);
        vm.stopPrank();
        assertEq(v1.balanceOf(mallory), 1 ether);

        vm.warp(block.timestamp + 2 days); // admin's approval expires
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(BharatRWAToken.TransferNotCompliant.selector, mallory, admin));
        v1.transfer(admin, 1 ether);
    }
}
