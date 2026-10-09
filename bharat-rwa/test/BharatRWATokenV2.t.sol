// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {BharatRWATokenV2} from "../src/BharatRWATokenV2.sol";
import {ComplianceManager} from "../src/ComplianceManager.sol";
import {ComplianceManagerV2} from "../src/ComplianceManagerV2.sol";
import {DividendDistributor} from "../src/DividendDistributor.sol";
import {IERC7943Fungible} from "../src/interfaces/IERC7943.sol";
import {IComplianceManager} from "../src/interfaces/IComplianceManager.sol";
import {MockZKVerifier} from "./mocks/MockZKVerifier.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @dev A compliance manager whose calls always revert, to check canSend/canReceive never revert.
contract RevertingCompliance is IComplianceManager {
    function isApproved(address) external pure returns (bool) {
        revert("down");
    }

    function isBlacklisted(address) external pure returns (bool) {
        revert("down");
    }

    function isTransferCompliant(address, address) external pure returns (bool) {
        revert("down");
    }
}

contract BharatRWATokenV2Test is Test {
    BharatRWATokenV2 public token;
    ComplianceManager public compliance; // the existing V1 compliance manager

    address public admin = makeAddr("admin");
    address public alice = makeAddr("alice"); // approved
    address public bob = makeAddr("bob"); // approved
    address public carol = makeAddr("carol"); // never approved
    address public officer = makeAddr("officer"); // enforcement + freezer, not admin
    address public mallory = makeAddr("mallory");

    uint256 constant CAP = 1_000_000 ether;
    uint256 constant ASSET_ID = 7;

    function setUp() public {
        MockZKVerifier verifier = new MockZKVerifier(true);
        ComplianceManager impl = new ComplianceManager();
        compliance = ComplianceManager(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(ComplianceManager.initialize, (admin, address(verifier)))
                )
            )
        );
        token = new BharatRWATokenV2("BharatRWA Gold V2", "BGOLD2", CAP, admin, address(compliance), ASSET_ID);

        vm.startPrank(admin);
        compliance.manualApprove(alice);
        compliance.manualApprove(bob);
        token.mint(alice, 1_000 ether);
        token.grantRole(token.ENFORCEMENT_ROLE(), officer);
        token.grantRole(token.FREEZER_ROLE(), officer);
        vm.stopPrank();
    }

    // ============================================================
    //                      ERC-165
    // ============================================================

    function test_InterfaceIdMatchesSpec() public pure {
        // 0x3edbb4c4 is the id published in ERC-7943 for the fungible interface.
        assertEq(type(IERC7943Fungible).interfaceId, bytes4(0x3edbb4c4));
        bytes4 computed = IERC7943Fungible.forcedTransfer.selector ^ IERC7943Fungible.setFrozenTokens.selector
            ^ IERC7943Fungible.canSend.selector ^ IERC7943Fungible.canReceive.selector
            ^ IERC7943Fungible.getFrozenTokens.selector ^ IERC7943Fungible.canTransfer.selector;
        assertEq(computed, bytes4(0x3edbb4c4));
    }

    function test_SupportsInterface() public view {
        assertTrue(token.supportsInterface(0x3edbb4c4));
        assertTrue(token.supportsInterface(type(IERC20).interfaceId));
        assertTrue(token.supportsInterface(type(IAccessControl).interfaceId));
        assertTrue(token.supportsInterface(type(IERC165).interfaceId));
        assertFalse(token.supportsInterface(0xffffffff));
        assertFalse(token.supportsInterface(0xbf1ef5fe)); // ERC-7943 non-fungible
    }

    // ============================================================
    //                 COMPLIANT TRANSFERS
    // ============================================================

    function test_TransferBetweenApproved() public {
        assertTrue(token.canTransfer(alice, bob, 100 ether));
        vm.prank(alice);
        assertTrue(token.transfer(bob, 100 ether));
        assertEq(token.balanceOf(bob), 100 ether);
    }

    function test_TransferFromBetweenApproved() public {
        vm.prank(alice);
        token.approve(carol, 50 ether); // spender need not be approved
        vm.prank(carol);
        token.transferFrom(alice, bob, 50 ether);
        assertEq(token.balanceOf(bob), 50 ether);
    }

    function test_CanSendCanReceiveFollowComplianceManager() public {
        assertTrue(token.canSend(alice));
        assertTrue(token.canReceive(alice));
        assertFalse(token.canSend(carol));
        assertFalse(token.canReceive(carol));
        assertFalse(token.canSend(address(0)));

        vm.prank(admin);
        compliance.blacklist(alice);
        assertFalse(token.canSend(alice));
        assertFalse(token.canReceive(alice));
    }

    // ============================================================
    //                  BLOCKED TRANSFERS
    // ============================================================

    function test_RevertTransferToUnapproved() public {
        assertFalse(token.canTransfer(alice, carol, 1 ether));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC7943Fungible.ERC7943CannotReceive.selector, carol));
        token.transfer(carol, 1 ether);
    }

    function test_RevertTransferFromRevokedSender() public {
        vm.prank(admin);
        compliance.revokeApproval(alice);
        assertFalse(token.canTransfer(alice, bob, 1 ether));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC7943Fungible.ERC7943CannotSend.selector, alice));
        token.transfer(bob, 1 ether);
    }

    function test_RevertTransferInvolvingBlacklisted() public {
        vm.prank(admin);
        compliance.blacklist(bob);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC7943Fungible.ERC7943CannotReceive.selector, bob));
        token.transfer(bob, 1 ether);
    }

    function test_RevertTransferFromToUnapproved() public {
        vm.prank(alice);
        token.approve(bob, 10 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IERC7943Fungible.ERC7943CannotReceive.selector, carol));
        token.transferFrom(alice, carol, 10 ether);
    }

    function test_PauseBlocksTransfersAndCanTransfer() public {
        vm.prank(admin);
        token.pause();
        assertFalse(token.canTransfer(alice, bob, 1 ether));
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.transfer(bob, 1 ether);
    }

    function test_RevertMintToUnapproved() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IERC7943Fungible.ERC7943CannotReceive.selector, carol));
        token.mint(carol, 1 ether);
    }

    function test_RevertBurnByRevokedHolder() public {
        vm.prank(admin);
        compliance.revokeApproval(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC7943Fungible.ERC7943CannotSend.selector, alice));
        token.burn(1 ether);
    }

    function test_ViewsNeverRevertWhenComplianceReverts() public {
        RevertingCompliance broken = new RevertingCompliance();
        vm.prank(admin);
        token.setComplianceManager(address(broken));
        assertFalse(token.canSend(alice));
        assertFalse(token.canReceive(bob));
        assertFalse(token.canTransfer(alice, bob, 1 ether));
    }

    function test_RevertSetComplianceManagerToEOA() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(BharatRWATokenV2.NotAContract.selector, carol));
        token.setComplianceManager(carol);
    }

    // ============================================================
    //                    FROZEN AMOUNTS
    // ============================================================

    function test_SetFrozenTokensEmitsAndStores() public {
        vm.expectEmit(true, false, false, true, address(token));
        emit IERC7943Fungible.Frozen(alice, 300 ether);
        vm.prank(officer);
        assertTrue(token.setFrozenTokens(alice, 300 ether));
        assertEq(token.getFrozenTokens(alice), 300 ether);
    }

    function test_CanFreezeMoreThanBalance() public {
        vm.prank(officer);
        token.setFrozenTokens(carol, 5_000 ether); // carol holds nothing
        assertEq(token.getFrozenTokens(carol), 5_000 ether);
    }

    function test_TransferWithinUnfrozenSucceeds() public {
        vm.prank(officer);
        token.setFrozenTokens(alice, 900 ether);
        assertTrue(token.canTransfer(alice, bob, 100 ether));
        vm.prank(alice);
        token.transfer(bob, 100 ether);
        assertEq(token.balanceOf(alice), 900 ether);
    }

    function test_RevertTransferAboveUnfrozen() public {
        vm.prank(officer);
        token.setFrozenTokens(alice, 900 ether);
        assertFalse(token.canTransfer(alice, bob, 101 ether));
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC7943Fungible.ERC7943InsufficientUnfrozenBalance.selector, alice, 101 ether, 100 ether
            )
        );
        token.transfer(bob, 101 ether);
    }

    function test_AmountAboveBalanceUsesBaseError() public {
        vm.prank(officer);
        token.setFrozenTokens(alice, 900 ether);
        // Not a permissioned failure, so canTransfer does not report it (ERC-7943).
        assertTrue(token.canTransfer(alice, bob, 2_000 ether));
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, 1_000 ether, 2_000 ether)
        );
        token.transfer(bob, 2_000 ether);
    }

    function test_RevertBurnAboveUnfrozen() public {
        vm.prank(officer);
        token.setFrozenTokens(alice, 1_000 ether);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IERC7943Fungible.ERC7943InsufficientUnfrozenBalance.selector, alice, 1 ether, 0)
        );
        token.burn(1 ether);
    }

    function test_UnfreezeRestoresTransfers() public {
        vm.startPrank(officer);
        token.setFrozenTokens(alice, 1_000 ether);
        token.setFrozenTokens(alice, 0);
        vm.stopPrank();
        vm.prank(alice);
        token.transfer(bob, 1_000 ether);
    }

    function test_RevertFreezeZeroAddress() public {
        vm.prank(officer);
        vm.expectRevert(BharatRWATokenV2.ZeroAddress.selector);
        token.setFrozenTokens(address(0), 1);
    }

    // ============================================================
    //                   FORCED TRANSFERS
    // ============================================================

    function test_ForcedTransferMovesTokens() public {
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(alice, bob, 400 ether);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC7943Fungible.ForcedTransfer(alice, bob, 400 ether);
        vm.prank(officer);
        assertTrue(token.forcedTransfer(alice, bob, 400 ether));
        assertEq(token.balanceOf(alice), 600 ether);
        assertEq(token.balanceOf(bob), 400 ether);
    }

    function test_ForcedTransferBypassesSenderEligibility() public {
        vm.prank(admin);
        compliance.blacklist(alice);
        vm.prank(officer);
        token.forcedTransfer(alice, bob, 1_000 ether);
        assertEq(token.balanceOf(bob), 1_000 ether);
    }

    function test_RevertForcedTransferToIneligible() public {
        vm.prank(officer);
        vm.expectRevert(abi.encodeWithSelector(IERC7943Fungible.ERC7943CannotReceive.selector, carol));
        token.forcedTransfer(alice, carol, 1 ether);
    }

    function test_RevertForcedTransferAboveBalance() public {
        vm.prank(officer);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, 1_000 ether, 1_001 ether)
        );
        token.forcedTransfer(alice, bob, 1_001 ether);
    }

    function test_RevertForcedTransferZeroAddresses() public {
        vm.startPrank(officer);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidSender.selector, address(0)));
        token.forcedTransfer(address(0), bob, 1);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        token.forcedTransfer(alice, address(0), 1);
        vm.stopPrank();
    }

    function test_ForcedTransferWorksWhilePaused() public {
        vm.prank(admin);
        token.pause();
        vm.prank(officer);
        token.forcedTransfer(alice, bob, 10 ether);
        assertEq(token.balanceOf(bob), 10 ether);
    }

    function test_ForcedTransferUnfreezesOnlyWhatIsNeeded() public {
        vm.prank(officer);
        token.setFrozenTokens(alice, 800 ether); // unfrozen = 200
        vm.prank(officer);
        token.forcedTransfer(alice, bob, 500 ether); // needs 300 from the frozen part
        assertEq(token.getFrozenTokens(alice), 500 ether);
        assertEq(token.balanceOf(alice), 500 ether); // remaining balance fully frozen
    }

    function test_ForcedTransferDoesNotTouchFrozenWhenUnfrozenSuffices() public {
        vm.prank(officer);
        token.setFrozenTokens(alice, 300 ether);
        vm.recordLogs();
        vm.prank(officer);
        token.forcedTransfer(alice, bob, 700 ether);
        assertEq(token.getFrozenTokens(alice), 300 ether);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            assertTrue(logs[i].topics[0] != IERC7943Fungible.Frozen.selector, "unexpected Frozen event");
        }
    }

    function test_ForcedTransferEventOrder_FrozenThenTransferThenForced() public {
        vm.prank(officer);
        token.setFrozenTokens(alice, 1_000 ether);
        vm.recordLogs();
        vm.prank(officer);
        token.forcedTransfer(alice, bob, 250 ether);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 frozenAt = type(uint256).max;
        uint256 transferAt = type(uint256).max;
        uint256 forcedAt = type(uint256).max;
        for (uint256 i; i < logs.length; i++) {
            bytes32 t = logs[i].topics[0];
            if (t == IERC7943Fungible.Frozen.selector) frozenAt = i;
            else if (t == IERC20.Transfer.selector) transferAt = i;
            else if (t == IERC7943Fungible.ForcedTransfer.selector) forcedAt = i;
        }
        assertLt(frozenAt, transferAt, "Frozen must precede Transfer");
        assertLt(transferAt, forcedAt, "Transfer must precede ForcedTransfer");
        (uint256 newFrozen) = abi.decode(logs[frozenAt].data, (uint256));
        assertEq(newFrozen, 750 ether);
    }

    function test_ForcedTransferFromOverFrozenAccount() public {
        vm.prank(officer);
        token.setFrozenTokens(alice, 5_000 ether); // more than the 1,000 balance
        vm.prank(officer);
        token.forcedTransfer(alice, bob, 400 ether);
        assertEq(token.getFrozenTokens(alice), 4_600 ether); // excess withholding kept
    }

    function test_ForcedTransferUpdatesVotes() public {
        vm.prank(alice);
        token.delegate(alice);
        vm.prank(bob);
        token.delegate(bob);
        vm.prank(officer);
        token.forcedTransfer(alice, bob, 100 ether);
        assertEq(token.getVotes(alice), 900 ether);
        assertEq(token.getVotes(bob), 100 ether);
    }

    // ============================================================
    //                   ROLE PERMISSIONS
    // ============================================================

    function _expectUnauthorized(address account, bytes32 role) internal {
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, account, role));
    }

    function test_RevertFreezeByNonFreezer() public {
        _expectUnauthorized(mallory, token.FREEZER_ROLE());
        vm.prank(mallory);
        token.setFrozenTokens(alice, 1);
    }

    function test_RevertForcedTransferByNonEnforcer() public {
        _expectUnauthorized(mallory, token.ENFORCEMENT_ROLE());
        vm.prank(mallory);
        token.forcedTransfer(alice, bob, 1);
    }

    function test_FreezerCannotForceAndEnforcerCannotFreeze() public {
        address freezer = makeAddr("freezer");
        address enforcer = makeAddr("enforcer");
        vm.startPrank(admin);
        token.grantRole(token.FREEZER_ROLE(), freezer);
        token.grantRole(token.ENFORCEMENT_ROLE(), enforcer);
        vm.stopPrank();

        _expectUnauthorized(freezer, token.ENFORCEMENT_ROLE());
        vm.prank(freezer);
        token.forcedTransfer(alice, bob, 1);

        _expectUnauthorized(enforcer, token.FREEZER_ROLE());
        vm.prank(enforcer);
        token.setFrozenTokens(alice, 1);
    }

    function test_RevertMintPauseAndAdminByUnauthorized() public {
        _expectUnauthorized(mallory, token.MINTER_ROLE());
        vm.prank(mallory);
        token.mint(alice, 1);

        _expectUnauthorized(mallory, token.PAUSER_ROLE());
        vm.prank(mallory);
        token.pause();

        _expectUnauthorized(mallory, token.DEFAULT_ADMIN_ROLE());
        vm.prank(mallory);
        token.setComplianceManager(address(compliance));
    }

    function test_RevokedEnforcerLosesAccess() public {
        vm.startPrank(admin);
        token.revokeRole(token.ENFORCEMENT_ROLE(), officer);
        vm.stopPrank();
        _expectUnauthorized(officer, token.ENFORCEMENT_ROLE());
        vm.prank(officer);
        token.forcedTransfer(alice, bob, 1);
    }

    function test_AdminHoldsAllRolesAtDeploy() public view {
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(token.hasRole(token.MINTER_ROLE(), admin));
        assertTrue(token.hasRole(token.PAUSER_ROLE(), admin));
        assertTrue(token.hasRole(token.FREEZER_ROLE(), admin));
        assertTrue(token.hasRole(token.ENFORCEMENT_ROLE(), admin));
        assertEq(token.assetId(), ASSET_ID);
        assertEq(token.cap(), CAP);
    }

    // ============================================================
    //            WITH COMPLIANCE MANAGER V2 (EXPIRY)
    // ============================================================

    function test_WorksWithComplianceManagerV2AndExpiry() public {
        ComplianceManagerV2 impl = new ComplianceManagerV2();
        ComplianceManagerV2 cm2 = ComplianceManagerV2(
            address(
                new ERC1967Proxy(
                    address(impl),
                    abi.encodeCall(ComplianceManagerV2.initialize, (admin, address(new MockZKVerifier(true)), 30 days))
                )
            )
        );
        vm.startPrank(admin);
        token.setComplianceManager(address(cm2));
        cm2.setInvestor(alice, true, "IN", uint64(block.timestamp + 365 days));
        cm2.setInvestor(bob, true, "AE", uint64(block.timestamp + 1 days));
        vm.stopPrank();

        vm.prank(alice);
        token.transfer(bob, 10 ether);

        vm.warp(block.timestamp + 1 days); // bob's approval expires
        assertFalse(token.canReceive(bob));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC7943Fungible.ERC7943CannotReceive.selector, bob));
        token.transfer(bob, 1 ether);
    }

    // ============================================================
    //              DIVIDEND DISTRIBUTOR COMPATIBILITY
    // ============================================================

    function test_DividendDistributorWorksWithV2() public {
        DividendDistributor distributor = new DividendDistributor(admin);
        vm.prank(alice);
        token.delegate(alice);
        vm.prank(alice);
        token.transfer(bob, 250 ether);
        vm.prank(bob);
        token.delegate(bob);

        vm.warp(block.timestamp + 10);
        uint48 snapshot = uint48(block.timestamp - 1);
        vm.deal(admin, 1 ether);
        uint256 roundId = distributor.nextRoundId();
        vm.prank(admin);
        distributor.createDividendRound{value: 1 ether}(address(token), snapshot);

        assertEq(distributor.getClaimableAmount(roundId, alice), 0.75 ether);
        assertEq(distributor.getClaimableAmount(roundId, bob), 0.25 ether);
    }

    // ============================================================
    //                 FUZZ: FROZEN-BALANCE LOGIC
    // ============================================================

    function testFuzz_TransferSucceedsIffWithinUnfrozen(uint256 frozen, uint256 amount) public {
        uint256 balance = token.balanceOf(alice); // 1,000 ether
        frozen = bound(frozen, 0, 3 * balance);
        amount = bound(amount, 1, balance);
        vm.prank(officer);
        token.setFrozenTokens(alice, frozen);

        uint256 unfrozen = balance > frozen ? balance - frozen : 0;
        bool expectOk = amount <= unfrozen;
        assertEq(token.canTransfer(alice, bob, amount), expectOk, "canTransfer disagrees with transfer");

        vm.prank(alice);
        if (expectOk) {
            token.transfer(bob, amount);
            assertEq(token.balanceOf(alice), balance - amount);
            assertGe(token.balanceOf(alice), frozen > balance ? 0 : frozen, "frozen tokens left the account");
        } else {
            vm.expectRevert(
                abi.encodeWithSelector(
                    IERC7943Fungible.ERC7943InsufficientUnfrozenBalance.selector, alice, amount, unfrozen
                )
            );
            token.transfer(bob, amount);
        }
        assertEq(token.getFrozenTokens(alice), frozen, "normal transfers never change frozen amount");
    }

    function testFuzz_ForcedTransferUnfreezesMinimum(uint256 frozen, uint256 amount) public {
        uint256 balance = token.balanceOf(alice);
        frozen = bound(frozen, 0, 3 * balance);
        amount = bound(amount, 0, balance);
        vm.prank(officer);
        token.setFrozenTokens(alice, frozen);
        uint256 supplyBefore = token.totalSupply();

        vm.prank(officer);
        token.forcedTransfer(alice, bob, amount);

        uint256 unfrozen = balance > frozen ? balance - frozen : 0;
        uint256 expectedFrozen = amount > unfrozen ? frozen - (amount - unfrozen) : frozen;
        assertEq(token.getFrozenTokens(alice), expectedFrozen);
        assertLe(token.getFrozenTokens(alice), frozen, "forced transfer never increases frozen");
        if (frozen <= balance) {
            // If the account was not over-frozen, it still isn't, and the frozen part is intact
            // as far as the remaining balance allows.
            assertLe(token.getFrozenTokens(alice), token.balanceOf(alice));
        }
        assertEq(token.balanceOf(alice), balance - amount);
        assertEq(token.totalSupply(), supplyBefore);
    }

    function testFuzz_SetFrozenTokensAcceptsAnyAmount(address account, uint256 amount) public {
        vm.assume(account != address(0));
        vm.prank(officer);
        token.setFrozenTokens(account, amount);
        assertEq(token.getFrozenTokens(account), amount);
    }

    function testFuzz_BurnRespectsUnfrozen(uint256 frozen, uint256 amount) public {
        uint256 balance = token.balanceOf(alice);
        frozen = bound(frozen, 0, 2 * balance);
        amount = bound(amount, 1, balance);
        vm.prank(officer);
        token.setFrozenTokens(alice, frozen);
        uint256 unfrozen = balance > frozen ? balance - frozen : 0;

        vm.prank(alice);
        if (amount <= unfrozen) {
            token.burn(amount);
            assertEq(token.balanceOf(alice), balance - amount);
        } else {
            vm.expectRevert(
                abi.encodeWithSelector(
                    IERC7943Fungible.ERC7943InsufficientUnfrozenBalance.selector, alice, amount, unfrozen
                )
            );
            token.burn(amount);
        }
    }

    function testFuzz_CanTransferNeverRevertsAndMatchesRules(address from, address to, uint256 amount) public view {
        bool result = token.canTransfer(from, to, amount);
        bool eligible = token.canSend(from) && token.canReceive(to);
        if (!eligible) assertFalse(result);
    }
}
