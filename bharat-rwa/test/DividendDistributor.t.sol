// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {DividendDistributor} from "../src/DividendDistributor.sol";
import {BharatRWAToken} from "../src/BharatRWAToken.sol";
import {ComplianceManager} from "../src/ComplianceManager.sol";
import {MockZKVerifier} from "./mocks/MockZKVerifier.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DividendDistributorTest is Test {
    DividendDistributor public distributor;
    BharatRWAToken public token;
    ComplianceManager public compliance;

    address public admin = makeAddr("admin");
    address public investor1 = makeAddr("investor1");
    address public investor2 = makeAddr("investor2");
    address public investor3 = makeAddr("investor3");

    uint256 constant CAP = 1_000_000 ether;

    function setUp() public {
        // Start at a reasonable timestamp to avoid underflow issues
        vm.warp(1000);

        // Deploy mock verifier + compliance
        MockZKVerifier verifier = new MockZKVerifier(true);
        ComplianceManager compImpl = new ComplianceManager();
        bytes memory compInit = abi.encodeWithSelector(ComplianceManager.initialize.selector, admin, address(verifier));
        ERC1967Proxy compProxy = new ERC1967Proxy(address(compImpl), compInit);
        compliance = ComplianceManager(address(compProxy));

        // Deploy token
        vm.prank(admin);
        token = new BharatRWAToken("BharatRWA Gold", "BGOLD", CAP, admin, address(compliance), 1);

        // Deploy distributor
        distributor = new DividendDistributor(admin);

        // Fund admin with ETH for dividend distribution
        vm.deal(admin, 100 ether);

        // Approve investors
        vm.startPrank(admin);
        compliance.manualApprove(investor1);
        compliance.manualApprove(investor2);
        compliance.manualApprove(investor3);
        vm.stopPrank();

        // Mint tokens
        vm.startPrank(admin);
        token.mint(investor1, 500_000 ether); // 50%
        token.mint(investor2, 300_000 ether); // 30%
        token.mint(investor3, 200_000 ether); // 20%
        vm.stopPrank();

        // Investors must self-delegate to activate ERC20Votes checkpoints
        vm.prank(investor1);
        token.delegate(investor1);
        vm.prank(investor2);
        token.delegate(investor2);
        vm.prank(investor3);
        token.delegate(investor3);

        // Advance time so checkpoints are queryable (need to be strictly past)
        vm.warp(block.timestamp + 100);
    }

    // ============================================================
    //                    DEPLOYMENT
    // ============================================================

    function test_DeploymentSetsCorrectValues() public view {
        assertTrue(distributor.hasRole(distributor.DEFAULT_ADMIN_ROLE(), admin));
        assertEq(distributor.nextRoundId(), 1);
    }

    function test_RevertDeployWithZeroAdmin() public {
        vm.expectRevert(DividendDistributor.ZeroAddress.selector);
        new DividendDistributor(address(0));
    }

    // ============================================================
    //                   CREATE DIVIDEND ROUND
    // ============================================================

    function test_CreateDividendRound() public {
        uint48 snapshot = uint48(block.timestamp - 10);

        vm.prank(admin);
        distributor.createDividendRound{value: 10 ether}(address(token), snapshot);

        DividendDistributor.DividendRound memory round = distributor.getRound(1);
        assertEq(round.totalAmount, 10 ether);
        assertEq(round.snapshotTimestamp, snapshot);
        assertEq(round.tokenAddress, address(token));
        assertTrue(round.finalized);
    }

    function test_RevertCreateRoundWithZeroValue() public {
        vm.prank(admin);
        vm.expectRevert(DividendDistributor.ZeroAmount.selector);
        distributor.createDividendRound{value: 0}(address(token), uint48(block.timestamp - 10));
    }

    function test_RevertCreateRoundWithFutureSnapshot() public {
        vm.deal(admin, 10 ether);
        vm.prank(admin);
        vm.expectRevert(DividendDistributor.InvalidSnapshotTimestamp.selector);
        distributor.createDividendRound{value: 1 ether}(address(token), uint48(block.timestamp + 100));
    }

    function test_RevertCreateRoundByNonAdmin() public {
        vm.deal(investor1, 10 ether);
        vm.prank(investor1);
        vm.expectRevert();
        distributor.createDividendRound{value: 1 ether}(address(token), uint48(block.timestamp - 10));
    }

    // ============================================================
    //                   CLAIM DIVIDENDS
    // ============================================================

    function test_ClaimDividendProportional() public {
        uint48 snapshot = uint48(block.timestamp - 10);

        vm.prank(admin);
        distributor.createDividendRound{value: 10 ether}(address(token), snapshot);

        // Investor1 has 50% -> should get 5 ETH
        uint256 balBefore = investor1.balance;
        vm.prank(investor1);
        distributor.claimDividend(1);
        uint256 balAfter = investor1.balance;

        assertEq(balAfter - balBefore, 5 ether);
    }

    function test_ClaimDividendAllInvestors() public {
        uint48 snapshot = uint48(block.timestamp - 10);

        vm.prank(admin);
        distributor.createDividendRound{value: 10 ether}(address(token), snapshot);

        // Investor1: 50% -> 5 ETH
        vm.prank(investor1);
        distributor.claimDividend(1);
        assertEq(distributor.getClaimableAmount(1, investor1), 0); // Already claimed

        // Investor2: 30% -> 3 ETH
        uint256 bal2Before = investor2.balance;
        vm.prank(investor2);
        distributor.claimDividend(1);
        assertEq(investor2.balance - bal2Before, 3 ether);

        // Investor3: 20% -> 2 ETH
        uint256 bal3Before = investor3.balance;
        vm.prank(investor3);
        distributor.claimDividend(1);
        assertEq(investor3.balance - bal3Before, 2 ether);
    }

    function test_RevertDoubleClaim() public {
        uint48 snapshot = uint48(block.timestamp - 10);

        vm.prank(admin);
        distributor.createDividendRound{value: 10 ether}(address(token), snapshot);

        vm.prank(investor1);
        distributor.claimDividend(1);

        vm.prank(investor1);
        vm.expectRevert(abi.encodeWithSelector(DividendDistributor.AlreadyClaimed.selector, 1, investor1));
        distributor.claimDividend(1);
    }

    function test_RevertClaimNoBalance() public {
        uint48 snapshot = uint48(block.timestamp - 10);

        vm.prank(admin);
        distributor.createDividendRound{value: 10 ether}(address(token), snapshot);

        address noTokens = makeAddr("noTokens");
        vm.prank(noTokens);
        vm.expectRevert(abi.encodeWithSelector(DividendDistributor.NothingToClaim.selector, 1, noTokens));
        distributor.claimDividend(1);
    }

    function test_RevertClaimNonExistentRound() public {
        vm.prank(investor1);
        vm.expectRevert(abi.encodeWithSelector(DividendDistributor.RoundNotFound.selector, 999));
        distributor.claimDividend(999);
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function test_GetClaimableAmount() public {
        uint48 snapshot = uint48(block.timestamp - 10);

        vm.prank(admin);
        distributor.createDividendRound{value: 10 ether}(address(token), snapshot);

        assertEq(distributor.getClaimableAmount(1, investor1), 5 ether);
        assertEq(distributor.getClaimableAmount(1, investor2), 3 ether);
        assertEq(distributor.getClaimableAmount(1, investor3), 2 ether);
    }

    function test_GetClaimableAmountAfterClaim() public {
        uint48 snapshot = uint48(block.timestamp - 10);

        vm.prank(admin);
        distributor.createDividendRound{value: 10 ether}(address(token), snapshot);

        vm.prank(investor1);
        distributor.claimDividend(1);

        assertEq(distributor.getClaimableAmount(1, investor1), 0);
    }

    // ============================================================
    //                   MULTIPLE ROUNDS
    // ============================================================

    function test_MultipleRounds() public {
        uint48 snapshot = uint48(block.timestamp - 10);

        // Round 1: 10 ETH
        vm.prank(admin);
        distributor.createDividendRound{value: 10 ether}(address(token), snapshot);

        // Round 2: 20 ETH
        vm.prank(admin);
        distributor.createDividendRound{value: 20 ether}(address(token), snapshot);

        // Claim from both rounds
        vm.prank(investor1);
        distributor.claimDividend(1);
        vm.prank(investor1);
        distributor.claimDividend(2);

        // Total: 5 + 10 = 15 ETH
        assertEq(investor1.balance, 15 ether);
    }

    // ============================================================
    //                   RECOVERY
    // ============================================================

    function test_RecoverUnclaimed() public {
        uint48 snapshot = uint48(block.timestamp - 10);

        vm.prank(admin);
        distributor.createDividendRound{value: 10 ether}(address(token), snapshot);

        // Only investor1 claims
        vm.prank(investor1);
        distributor.claimDividend(1);

        // Recover remaining 5 ETH (3 + 2)
        address treasury = makeAddr("treasury");
        vm.prank(admin);
        distributor.recoverUnclaimed(1, treasury);

        assertEq(treasury.balance, 5 ether);
    }

    function test_RevertRecoverByNonAdmin() public {
        uint48 snapshot = uint48(block.timestamp - 10);

        vm.prank(admin);
        distributor.createDividendRound{value: 10 ether}(address(token), snapshot);

        vm.prank(investor1);
        vm.expectRevert();
        distributor.recoverUnclaimed(1, investor1);
    }
}
