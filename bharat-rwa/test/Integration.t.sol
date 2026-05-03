// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {BharatRWAToken} from "../src/BharatRWAToken.sol";
import {ComplianceManager} from "../src/ComplianceManager.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {AssetOracle} from "../src/AssetOracle.sol";
import {DividendDistributor} from "../src/DividendDistributor.sol";
import {ZKVerifier} from "../src/ZKVerifier.sol";
import {MockZKVerifier} from "./mocks/MockZKVerifier.sol";
import {MockChainlinkFeed} from "./mocks/MockChainlinkFeed.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAssetRegistry} from "../src/interfaces/IAssetRegistry.sol";

/**
 * @title IntegrationTest
 * @notice Full end-to-end test simulating the complete BharatRWA investment lifecycle:
 *         1. Deploy all contracts
 *         2. Register a custodian
 *         3. Register an asset (Gold)
 *         4. Set up price feed
 *         5. Verify an investor via ZK proof
 *         6. Investor purchases tokens (via minting)
 *         7. Admin creates dividend round
 *         8. Investor claims dividend
 *         9. Investor transfers tokens to another verified investor
 */
contract IntegrationTest is Test {
    // Contracts
    ComplianceManager public compliance;
    AssetRegistry public registry;
    AssetOracle public oracle;
    DividendDistributor public distributor;
    MockZKVerifier public mockVerifier;
    MockChainlinkFeed public goldFeed;

    // Actors
    address public admin = makeAddr("admin");
    address public custodian = makeAddr("custodian");
    address public investor1 = makeAddr("investor1");
    address public investor2 = makeAddr("investor2");
    address public blacklistedUser = makeAddr("blacklisted");

    function setUp() public {
        // Start at a reasonable timestamp
        vm.warp(1000);

        // ============================================================
        // STEP 1: Deploy all infrastructure contracts
        // ============================================================

        // 1a. Deploy mock ZK verifier (in production, this is the real Barretenberg verifier)
        mockVerifier = new MockZKVerifier(true);

        // 1b. Deploy ComplianceManager (UUPS proxy)
        ComplianceManager compImpl = new ComplianceManager();
        bytes memory compInit =
            abi.encodeWithSelector(ComplianceManager.initialize.selector, admin, address(mockVerifier));
        ERC1967Proxy compProxy = new ERC1967Proxy(address(compImpl), compInit);
        compliance = ComplianceManager(address(compProxy));

        // 1c. Deploy AssetRegistry (UUPS proxy)
        AssetRegistry regImpl = new AssetRegistry();
        bytes memory regInit =
            abi.encodeWithSelector(AssetRegistry.initialize.selector, admin, address(compliance));
        ERC1967Proxy regProxy = new ERC1967Proxy(address(regImpl), regInit);
        registry = AssetRegistry(address(regProxy));

        // 1d. Deploy AssetOracle
        oracle = new AssetOracle(admin, 3600); // 1 hour heartbeat

        // 1e. Deploy DividendDistributor
        distributor = new DividendDistributor(admin);

        // ============================================================
        // STEP 2: Configure roles
        // ============================================================
        vm.startPrank(admin);
        registry.grantRole(registry.CUSTODIAN_ROLE(), custodian);
        vm.stopPrank();

        // Fund admin for dividend distribution
        vm.deal(admin, 100 ether);
    }

    // ============================================================
    //                   FULL LIFECYCLE TEST
    // ============================================================

    function test_FullInvestmentLifecycle() public {
        // ============================================================
        // STEP 3: Custodian registers a Gold asset
        // ============================================================
        console2.log("=== STEP 3: Asset Registration ===");

        bytes32 goldMetadata = keccak256("ipfs://QmGoldCustodyProof_Mumbai_Vault_500kg");

        vm.prank(custodian);
        uint256 goldAssetId = registry.registerAsset(
            "BharatRWA Gold Token",
            "BGOLD",
            goldMetadata,
            1_000_000 ether // 1M tokens
        );

        assertEq(goldAssetId, 1);
        IAssetRegistry.Asset memory goldAsset = registry.getAsset(goldAssetId);
        assertTrue(goldAsset.isActive);
        console2.log("Gold asset registered. Token deployed at:", goldAsset.tokenContract);

        BharatRWAToken goldToken = BharatRWAToken(goldAsset.tokenContract);
        assertEq(goldToken.name(), "BharatRWA Gold Token");
        assertEq(goldToken.symbol(), "BGOLD");

        // ============================================================
        // STEP 4: Set up oracle price feed
        // ============================================================
        console2.log("=== STEP 4: Oracle Price Feed Setup ===");

        goldFeed = new MockChainlinkFeed(200000000000, 8, "XAU / USD"); // $2000

        vm.prank(admin);
        oracle.setPriceFeed(goldAssetId, address(goldFeed));

        AssetOracle.PriceData memory priceData = oracle.getLatestPrice(goldAssetId);
        assertEq(priceData.price, 200000000000);
        console2.log("Gold price feed set: $2000");

        // ============================================================
        // STEP 5: Investors complete ZK-KYC verification
        // ============================================================
        console2.log("=== STEP 5: ZK-KYC Verification ===");

        // Investor1 submits ZK proof
        bytes memory fakeProof = hex"deadbeef";
        bytes32[] memory publicInputs = new bytes32[](1);
        publicInputs[0] = bytes32(uint256(0x1234)); // wallet hash

        vm.prank(investor1);
        compliance.verifyAndApprove(fakeProof, publicInputs);
        assertTrue(compliance.isApproved(investor1));
        console2.log("Investor1 KYC verified via ZK proof");

        // Investor2 gets manually approved
        vm.prank(admin);
        compliance.manualApprove(investor2);
        assertTrue(compliance.isApproved(investor2));
        console2.log("Investor2 manually approved");

        // ============================================================
        // STEP 6: Custodian mints tokens to investors
        // ============================================================
        console2.log("=== STEP 6: Token Distribution ===");

        // The custodian is the admin of the token (set during deployment)
        vm.startPrank(custodian);
        goldToken.mint(investor1, 600_000 ether); // 60%
        goldToken.mint(investor2, 400_000 ether); // 40%
        vm.stopPrank();

        assertEq(goldToken.balanceOf(investor1), 600_000 ether);
        assertEq(goldToken.balanceOf(investor2), 400_000 ether);
        assertEq(goldToken.totalSupply(), 1_000_000 ether);
        console2.log("Tokens minted: Investor1=600K, Investor2=400K");

        // Investors delegate to themselves for checkpoint tracking
        vm.prank(investor1);
        goldToken.delegate(investor1);
        vm.prank(investor2);
        goldToken.delegate(investor2);

        // ============================================================
        // STEP 7: Advance time, then distribute dividends
        // ============================================================
        console2.log("=== STEP 7: Dividend Distribution ===");

        // Advance time so checkpoints are queryable
        vm.warp(block.timestamp + 100);

        uint48 snapshotTime = uint48(block.timestamp - 50);

        vm.prank(admin);
        distributor.createDividendRound{value: 10 ether}(address(goldToken), snapshotTime);

        // Check claimable amounts
        uint256 claimable1 = distributor.getClaimableAmount(1, investor1);
        uint256 claimable2 = distributor.getClaimableAmount(1, investor2);

        assertEq(claimable1, 6 ether); // 60% of 10 ETH
        assertEq(claimable2, 4 ether); // 40% of 10 ETH
        console2.log("Dividend round created: 10 ETH total");
        console2.log("Investor1 claimable:", claimable1);
        console2.log("Investor2 claimable:", claimable2);

        // ============================================================
        // STEP 8: Investors claim dividends
        // ============================================================
        console2.log("=== STEP 8: Dividend Claims ===");

        uint256 bal1Before = investor1.balance;
        vm.prank(investor1);
        distributor.claimDividend(1);
        assertEq(investor1.balance - bal1Before, 6 ether);
        console2.log("Investor1 claimed 6 ETH");

        uint256 bal2Before = investor2.balance;
        vm.prank(investor2);
        distributor.claimDividend(1);
        assertEq(investor2.balance - bal2Before, 4 ether);
        console2.log("Investor2 claimed 4 ETH");

        // ============================================================
        // STEP 9: Compliant token transfer
        // ============================================================
        console2.log("=== STEP 9: Compliant Transfer ===");

        vm.prank(investor1);
        goldToken.transfer(investor2, 100_000 ether);

        assertEq(goldToken.balanceOf(investor1), 500_000 ether);
        assertEq(goldToken.balanceOf(investor2), 500_000 ether);
        console2.log("Investor1 transferred 100K tokens to Investor2");

        // ============================================================
        // STEP 10: Compliance enforcement — blacklisting
        // ============================================================
        console2.log("=== STEP 10: Compliance Enforcement ===");

        // Blacklist investor1
        vm.prank(admin);
        compliance.blacklist(investor1);

        // Transfer should now fail
        vm.prank(investor1);
        vm.expectRevert();
        goldToken.transfer(investor2, 100_000 ether);
        console2.log("Blacklisted investor1 - transfer correctly blocked");

        // Unblacklist
        vm.prank(admin);
        compliance.removeBlacklist(investor1);

        // Transfer should work again
        vm.prank(investor1);
        goldToken.transfer(investor2, 50_000 ether);
        assertEq(goldToken.balanceOf(investor2), 550_000 ether);
        console2.log("Investor1 unblacklisted - transfers resumed");

        console2.log("=== FULL LIFECYCLE TEST PASSED ===");
    }

    // ============================================================
    //                   EMERGENCY PAUSE TEST
    // ============================================================

    function test_EmergencyPauseFlow() public {
        // Register asset and distribute tokens
        vm.prank(custodian);
        uint256 assetId = registry.registerAsset("Gold", "BGOLD", bytes32(0), 1_000_000 ether);
        address tokenAddr = registry.getTokenContract(assetId);
        BharatRWAToken token = BharatRWAToken(tokenAddr);

        vm.prank(admin);
        compliance.manualApprove(investor1);
        vm.prank(admin);
        compliance.manualApprove(investor2);

        vm.prank(custodian);
        token.mint(investor1, 1000 ether);

        // Admin pauses the token
        vm.prank(custodian);
        token.pause();

        // All transfers blocked
        vm.prank(investor1);
        vm.expectRevert();
        token.transfer(investor2, 500 ether);

        // Admin unpauses
        vm.prank(custodian);
        token.unpause();

        // Transfers resume
        vm.prank(investor1);
        token.transfer(investor2, 500 ether);
        assertEq(token.balanceOf(investor2), 500 ether);
    }

    // ============================================================
    //                   MULTI-ASSET TEST
    // ============================================================

    function test_MultipleAssetRegistration() public {
        vm.startPrank(custodian);

        uint256 goldId = registry.registerAsset("Gold Token", "BGOLD", bytes32(0), 1_000_000 ether);
        uint256 propId = registry.registerAsset("Property Token", "BPROP", bytes32(0), 500_000 ether);
        uint256 silvId = registry.registerAsset("Silver Token", "BSILV", bytes32(0), 2_000_000 ether);

        vm.stopPrank();

        assertEq(registry.totalAssets(), 3);

        // Each asset has its own independent token
        address goldToken = registry.getTokenContract(goldId);
        address propToken = registry.getTokenContract(propId);
        address silvToken = registry.getTokenContract(silvId);

        assertTrue(goldToken != propToken);
        assertTrue(propToken != silvToken);

        assertEq(BharatRWAToken(goldToken).symbol(), "BGOLD");
        assertEq(BharatRWAToken(propToken).symbol(), "BPROP");
        assertEq(BharatRWAToken(silvToken).symbol(), "BSILV");
    }
}
