// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {AssetOracle} from "../src/AssetOracle.sol";
import {MockChainlinkFeed} from "./mocks/MockChainlinkFeed.sol";

contract AssetOracleTest is Test {
    AssetOracle public oracle;
    MockChainlinkFeed public goldFeed;
    MockChainlinkFeed public ethFeed;

    address public admin = makeAddr("admin");
    address public unauthorized = makeAddr("unauthorized");

    uint256 constant HEARTBEAT = 3600; // 1 hour
    uint256 constant GOLD_ASSET_ID = 1;
    uint256 constant ETH_ASSET_ID = 2;

    function setUp() public {
        // Warp to a reasonable timestamp to avoid underflow in staleness tests
        vm.warp(10000);

        oracle = new AssetOracle(admin, HEARTBEAT);

        // Gold: $2000 with 8 decimals (Chainlink standard)
        goldFeed = new MockChainlinkFeed(200000000000, 8, "XAU / USD");
        // ETH: $3000
        ethFeed = new MockChainlinkFeed(300000000000, 8, "ETH / USD");

        vm.startPrank(admin);
        oracle.setPriceFeed(GOLD_ASSET_ID, address(goldFeed));
        oracle.setPriceFeed(ETH_ASSET_ID, address(ethFeed));
        vm.stopPrank();
    }

    // ============================================================
    //                    DEPLOYMENT
    // ============================================================

    function test_DeploymentSetsCorrectValues() public view {
        assertEq(oracle.heartbeat(), HEARTBEAT);
        assertTrue(oracle.hasRole(oracle.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(oracle.hasRole(oracle.ORACLE_ROLE(), admin));
    }

    function test_RevertDeployWithZeroAdmin() public {
        vm.expectRevert(AssetOracle.ZeroAddress.selector);
        new AssetOracle(address(0), HEARTBEAT);
    }

    function test_RevertDeployWithZeroHeartbeat() public {
        vm.expectRevert(AssetOracle.InvalidHeartbeat.selector);
        new AssetOracle(admin, 0);
    }

    // ============================================================
    //                   PRICE FEED MANAGEMENT
    // ============================================================

    function test_SetPriceFeed() public view {
        assertEq(oracle.priceFeeds(GOLD_ASSET_ID), address(goldFeed));
    }

    function test_RevertSetPriceFeedByNonAdmin() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        oracle.setPriceFeed(3, address(goldFeed));
    }

    function test_RemovePriceFeed() public {
        vm.prank(admin);
        oracle.removePriceFeed(GOLD_ASSET_ID);
        assertEq(oracle.priceFeeds(GOLD_ASSET_ID), address(0));
    }

    // ============================================================
    //                   PRICE RETRIEVAL
    // ============================================================

    function test_GetLatestPrice() public view {
        AssetOracle.PriceData memory data = oracle.getLatestPrice(GOLD_ASSET_ID);
        assertEq(data.price, 200000000000); // $2000 * 10^8
        assertEq(data.decimals, 8);
        assertFalse(data.isManualOverride);
    }

    function test_GetLatestPriceAfterUpdate() public {
        goldFeed.setPrice(210000000000); // $2100

        AssetOracle.PriceData memory data = oracle.getLatestPrice(GOLD_ASSET_ID);
        assertEq(data.price, 210000000000);
    }

    function test_StaleChainlinkFallsToManual() public {
        // Make Chainlink feed stale
        goldFeed.setUpdatedAt(block.timestamp - HEARTBEAT - 1);

        // Set manual price
        vm.prank(admin);
        oracle.setManualPrice(GOLD_ASSET_ID, 195000000000, 8);

        AssetOracle.PriceData memory data = oracle.getLatestPrice(GOLD_ASSET_ID);
        assertEq(data.price, 195000000000);
        assertTrue(data.isManualOverride);
    }

    function test_RevertGetPriceNoFeedSet() public {
        vm.expectRevert(abi.encodeWithSelector(AssetOracle.PriceFeedNotSet.selector, 999));
        oracle.getLatestPrice(999);
    }

    // ============================================================
    //                   MANUAL PRICE
    // ============================================================

    function test_SetManualPrice() public {
        // Remove Chainlink feed first
        vm.startPrank(admin);
        oracle.removePriceFeed(GOLD_ASSET_ID);
        oracle.setManualPrice(GOLD_ASSET_ID, 200000000000, 8);
        vm.stopPrank();

        AssetOracle.PriceData memory data = oracle.getLatestPrice(GOLD_ASSET_ID);
        assertEq(data.price, 200000000000);
        assertTrue(data.isManualOverride);
    }

    function test_RevertSetManualPriceInvalid() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AssetOracle.InvalidPrice.selector, GOLD_ASSET_ID, int256(0)));
        oracle.setManualPrice(GOLD_ASSET_ID, 0, 8);
    }

    function test_RevertSetManualPriceByUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        oracle.setManualPrice(GOLD_ASSET_ID, 200000000000, 8);
    }

    // ============================================================
    //                   HEARTBEAT
    // ============================================================

    function test_UpdateHeartbeat() public {
        vm.prank(admin);
        oracle.setHeartbeat(7200); // 2 hours
        assertEq(oracle.heartbeat(), 7200);
    }

    function test_RevertUpdateHeartbeatZero() public {
        vm.prank(admin);
        vm.expectRevert(AssetOracle.InvalidHeartbeat.selector);
        oracle.setHeartbeat(0);
    }

    // ============================================================
    //                   HAS PRICE FEED
    // ============================================================

    function test_HasPriceFeedWithChainlink() public view {
        assertTrue(oracle.hasPriceFeed(GOLD_ASSET_ID));
    }

    function test_HasPriceFeedWithManual() public {
        vm.prank(admin);
        oracle.setManualPrice(999, 100000000, 8);
        assertTrue(oracle.hasPriceFeed(999));
    }

    function test_HasNoPriceFeed() public view {
        assertFalse(oracle.hasPriceFeed(888));
    }
}
