// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {BharatRWAToken} from "../src/BharatRWAToken.sol";
import {ComplianceManager} from "../src/ComplianceManager.sol";
import {MockZKVerifier} from "./mocks/MockZKVerifier.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract BharatRWATokenTest is Test {
    BharatRWAToken public token;
    ComplianceManager public compliance;
    MockZKVerifier public mockVerifier;

    address public admin = makeAddr("admin");
    address public investor1 = makeAddr("investor1");
    address public investor2 = makeAddr("investor2");
    address public unauthorized = makeAddr("unauthorized");

    uint256 constant CAP = 1_000_000 ether;
    uint256 constant ASSET_ID = 1;

    function setUp() public {
        // Deploy mock ZK verifier
        mockVerifier = new MockZKVerifier(true);

        // Deploy ComplianceManager (UUPS proxy)
        ComplianceManager complianceImpl = new ComplianceManager();
        bytes memory initData =
            abi.encodeWithSelector(ComplianceManager.initialize.selector, admin, address(mockVerifier));
        ERC1967Proxy complianceProxy = new ERC1967Proxy(address(complianceImpl), initData);
        compliance = ComplianceManager(address(complianceProxy));

        // Deploy token
        vm.prank(admin);
        token = new BharatRWAToken("BharatRWA Gold", "BGOLD", CAP, admin, address(compliance), ASSET_ID);

        // Approve investors in compliance
        vm.startPrank(admin);
        compliance.manualApprove(investor1);
        compliance.manualApprove(investor2);
        vm.stopPrank();
    }

    // ============================================================
    //                      DEPLOYMENT
    // ============================================================

    function test_DeploymentSetsCorrectValues() public view {
        assertEq(token.name(), "BharatRWA Gold");
        assertEq(token.symbol(), "BGOLD");
        assertEq(token.cap(), CAP);
        assertEq(token.assetId(), ASSET_ID);
        assertEq(address(token.complianceManager()), address(compliance));
    }

    function test_DeploymentGrantsRoles() public view {
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(token.hasRole(token.MINTER_ROLE(), admin));
        assertTrue(token.hasRole(token.PAUSER_ROLE(), admin));
    }

    function test_RevertDeployWithZeroAdmin() public {
        vm.expectRevert(BharatRWAToken.ZeroAddress.selector);
        new BharatRWAToken("Test", "TST", CAP, address(0), address(compliance), 1);
    }

    function test_RevertDeployWithZeroCompliance() public {
        vm.expectRevert(BharatRWAToken.ZeroAddress.selector);
        new BharatRWAToken("Test", "TST", CAP, admin, address(0), 1);
    }

    // ============================================================
    //                      MINTING
    // ============================================================

    function test_MintByMinter() public {
        vm.prank(admin);
        token.mint(investor1, 1000 ether);
        assertEq(token.balanceOf(investor1), 1000 ether);
    }

    function test_MintEmitsEvent() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit BharatRWAToken.TokensMinted(investor1, 1000 ether);
        token.mint(investor1, 1000 ether);
    }

    function test_RevertMintByNonMinter() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        token.mint(investor1, 1000 ether);
    }

    function test_RevertMintBeyondCap() public {
        vm.prank(admin);
        vm.expectRevert();
        token.mint(investor1, CAP + 1);
    }

    function test_RevertMintToZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(BharatRWAToken.ZeroAddress.selector);
        token.mint(address(0), 1000 ether);
    }

    // ============================================================
    //                   COMPLIANCE TRANSFERS
    // ============================================================

    function test_TransferBetweenApprovedInvestors() public {
        vm.prank(admin);
        token.mint(investor1, 1000 ether);

        vm.prank(investor1);
        token.transfer(investor2, 500 ether);

        assertEq(token.balanceOf(investor1), 500 ether);
        assertEq(token.balanceOf(investor2), 500 ether);
    }

    function test_RevertTransferToUnapproved() public {
        vm.prank(admin);
        token.mint(investor1, 1000 ether);

        vm.prank(investor1);
        vm.expectRevert(abi.encodeWithSelector(BharatRWAToken.TransferNotCompliant.selector, investor1, unauthorized));
        token.transfer(unauthorized, 500 ether);
    }

    function test_RevertTransferFromBlacklisted() public {
        vm.prank(admin);
        token.mint(investor1, 1000 ether);

        // Blacklist investor1
        vm.prank(admin);
        compliance.blacklist(investor1);

        vm.prank(investor1);
        vm.expectRevert(abi.encodeWithSelector(BharatRWAToken.TransferNotCompliant.selector, investor1, investor2));
        token.transfer(investor2, 500 ether);
    }

    function test_RevertTransferToBlacklisted() public {
        vm.prank(admin);
        token.mint(investor1, 1000 ether);

        vm.prank(admin);
        compliance.blacklist(investor2);

        vm.prank(investor1);
        vm.expectRevert(abi.encodeWithSelector(BharatRWAToken.TransferNotCompliant.selector, investor1, investor2));
        token.transfer(investor2, 500 ether);
    }

    // ============================================================
    //                     PAUSE/UNPAUSE
    // ============================================================

    function test_PauseBlocksTransfers() public {
        vm.prank(admin);
        token.mint(investor1, 1000 ether);

        vm.prank(admin);
        token.pause();

        vm.prank(investor1);
        vm.expectRevert();
        token.transfer(investor2, 500 ether);
    }

    function test_UnpauseAllowsTransfers() public {
        vm.prank(admin);
        token.mint(investor1, 1000 ether);

        vm.prank(admin);
        token.pause();

        vm.prank(admin);
        token.unpause();

        vm.prank(investor1);
        token.transfer(investor2, 500 ether);
        assertEq(token.balanceOf(investor2), 500 ether);
    }

    function test_RevertPauseByNonPauser() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        token.pause();
    }

    // ============================================================
    //                     BURN
    // ============================================================

    function test_BurnReducesBalance() public {
        vm.prank(admin);
        token.mint(investor1, 1000 ether);

        vm.prank(investor1);
        token.burn(400 ether);

        assertEq(token.balanceOf(investor1), 600 ether);
    }

    function test_BurnReducesTotalSupply() public {
        vm.prank(admin);
        token.mint(investor1, 1000 ether);

        vm.prank(investor1);
        token.burn(400 ether);

        assertEq(token.totalSupply(), 600 ether);
    }

    // ============================================================
    //                    ERC20VOTES (CHECKPOINTS)
    // ============================================================

    function test_VotesTrackDelegation() public {
        vm.prank(admin);
        token.mint(investor1, 1000 ether);

        // Before delegation, votes are 0
        assertEq(token.getVotes(investor1), 0);

        // Self-delegate to activate checkpoints
        vm.prank(investor1);
        token.delegate(investor1);

        assertEq(token.getVotes(investor1), 1000 ether);
    }

    function test_PastVotesAfterTransfer() public {
        vm.prank(admin);
        token.mint(investor1, 1000 ether);

        vm.prank(investor1);
        token.delegate(investor1);

        uint256 snapshotTime = block.timestamp;

        // Advance time past the snapshot
        vm.warp(block.timestamp + 2);

        uint256 pastVotes = token.getPastVotes(investor1, snapshotTime);
        assertEq(pastVotes, 1000 ether);
    }

    // ============================================================
    //                   ADMIN FUNCTIONS
    // ============================================================

    function test_UpdateComplianceManager() public {
        MockZKVerifier newVerifier = new MockZKVerifier(true);
        ComplianceManager newCompImpl = new ComplianceManager();
        bytes memory initData =
            abi.encodeWithSelector(ComplianceManager.initialize.selector, admin, address(newVerifier));
        ERC1967Proxy newProxy = new ERC1967Proxy(address(newCompImpl), initData);

        vm.prank(admin);
        token.setComplianceManager(address(newProxy));
        assertEq(address(token.complianceManager()), address(newProxy));
    }

    function test_RevertUpdateComplianceByNonAdmin() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        token.setComplianceManager(makeAddr("newCompliance"));
    }

    // ============================================================
    //                      FUZZ TESTS
    // ============================================================

    function testFuzz_MintWithinCap(uint256 amount) public {
        amount = bound(amount, 1, CAP);
        vm.prank(admin);
        token.mint(investor1, amount);
        assertEq(token.balanceOf(investor1), amount);
    }

    function testFuzz_TransferCompliant(uint256 mintAmount, uint256 transferAmount) public {
        mintAmount = bound(mintAmount, 1, CAP);
        transferAmount = bound(transferAmount, 1, mintAmount);

        vm.prank(admin);
        token.mint(investor1, mintAmount);

        vm.prank(investor1);
        token.transfer(investor2, transferAmount);

        assertEq(token.balanceOf(investor1), mintAmount - transferAmount);
        assertEq(token.balanceOf(investor2), transferAmount);
    }
}
