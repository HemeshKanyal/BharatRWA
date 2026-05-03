// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

/**
 * @title AssetOracle
 * @author BharatRWA Team
 * @notice Manages real-world asset price feeds using Chainlink oracles.
 * @dev Provides:
 *      - Mapping of asset IDs to Chainlink price feed addresses
 *      - Staleness checks with configurable heartbeat
 *      - Manual price override fallback for emergencies
 *      - Price retrieval for the frontend and other contracts
 *
 *      Roles:
 *      - ADMIN_ROLE: Can set price feeds and update heartbeat
 *      - ORACLE_ROLE: Can manually override prices
 */
contract AssetOracle is AccessControl {
    // ============================================================
    //                          ROLES
    // ============================================================

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // ============================================================
    //                          STRUCTS
    // ============================================================

    struct PriceData {
        int256 price;
        uint256 timestamp;
        uint8 decimals;
        bool isManualOverride;
    }

    // ============================================================
    //                          STATE
    // ============================================================

    /// @notice Chainlink price feed address per asset ID
    mapping(uint256 => address) public priceFeeds;

    /// @notice Manual price overrides (used when Chainlink is unavailable)
    mapping(uint256 => PriceData) public manualPrices;

    /// @notice Maximum allowed age of a price feed update (in seconds)
    uint256 public heartbeat;

    // ============================================================
    //                          EVENTS
    // ============================================================

    event PriceFeedSet(uint256 indexed assetId, address indexed feedAddress);
    event PriceFeedRemoved(uint256 indexed assetId);
    event ManualPriceSet(uint256 indexed assetId, int256 price, address indexed by);
    event HeartbeatUpdated(uint256 oldHeartbeat, uint256 newHeartbeat);

    // ============================================================
    //                          ERRORS
    // ============================================================

    error ZeroAddress();
    error PriceFeedNotSet(uint256 assetId);
    error StalePrice(uint256 assetId, uint256 updatedAt, uint256 heartbeat);
    error InvalidPrice(uint256 assetId, int256 price);
    error InvalidHeartbeat();

    // ============================================================
    //                        CONSTRUCTOR
    // ============================================================

    /**
     * @param admin The admin address
     * @param heartbeat_ Maximum age for price data (in seconds, e.g. 3600 = 1 hour)
     */
    constructor(address admin, uint256 heartbeat_) {
        if (admin == address(0)) revert ZeroAddress();
        if (heartbeat_ == 0) revert InvalidHeartbeat();

        heartbeat = heartbeat_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);
    }

    // ============================================================
    //                   PRICE FEED MANAGEMENT
    // ============================================================

    /**
     * @notice Set the Chainlink price feed for an asset
     * @param assetId The asset ID
     * @param feedAddress The Chainlink AggregatorV3 address
     */
    function setPriceFeed(uint256 assetId, address feedAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (feedAddress == address(0)) revert ZeroAddress();
        priceFeeds[assetId] = feedAddress;
        emit PriceFeedSet(assetId, feedAddress);
    }

    /**
     * @notice Remove the price feed for an asset
     * @param assetId The asset ID
     */
    function removePriceFeed(uint256 assetId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        priceFeeds[assetId] = address(0);
        emit PriceFeedRemoved(assetId);
    }

    /**
     * @notice Set a manual price override for an asset
     * @dev Used when Chainlink feed is unavailable or during initial setup
     * @param assetId The asset ID
     * @param price The price value (scaled by decimals)
     * @param decimals_ The number of decimals for the price
     */
    function setManualPrice(uint256 assetId, int256 price, uint8 decimals_) external onlyRole(ORACLE_ROLE) {
        if (price <= 0) revert InvalidPrice(assetId, price);

        manualPrices[assetId] =
            PriceData({price: price, timestamp: block.timestamp, decimals: decimals_, isManualOverride: true});

        emit ManualPriceSet(assetId, price, msg.sender);
    }

    /**
     * @notice Update the heartbeat (staleness threshold)
     * @param newHeartbeat New heartbeat in seconds
     */
    function setHeartbeat(uint256 newHeartbeat) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newHeartbeat == 0) revert InvalidHeartbeat();
        uint256 oldHeartbeat = heartbeat;
        heartbeat = newHeartbeat;
        emit HeartbeatUpdated(oldHeartbeat, newHeartbeat);
    }

    // ============================================================
    //                     PRICE RETRIEVAL
    // ============================================================

    /**
     * @notice Get the latest price for an asset
     * @dev First tries Chainlink feed, falls back to manual price
     * @param assetId The asset ID
     * @return priceData The price data including price, timestamp, decimals
     */
    function getLatestPrice(uint256 assetId) external view returns (PriceData memory priceData) {
        address feedAddress = priceFeeds[assetId];

        // Try Chainlink first
        if (feedAddress != address(0)) {
            try IAggregatorV3(feedAddress).latestRoundData() returns (
                uint80, int256 answer, uint256, uint256 updatedAt, uint80
            ) {
                if (answer > 0 && block.timestamp - updatedAt <= heartbeat) {
                    uint8 feedDecimals = IAggregatorV3(feedAddress).decimals();
                    return PriceData({
                        price: answer,
                        timestamp: updatedAt,
                        decimals: feedDecimals,
                        isManualOverride: false
                    });
                }
            } catch {
                // Chainlink call failed, fall through to manual price
            }
        }

        // Fall back to manual price
        PriceData memory manual = manualPrices[assetId];
        if (manual.timestamp > 0) {
            return manual;
        }

        revert PriceFeedNotSet(assetId);
    }

    /**
     * @notice Check if a price feed is configured for an asset
     * @param assetId The asset ID
     * @return True if a Chainlink feed or manual price is set
     */
    function hasPriceFeed(uint256 assetId) external view returns (bool) {
        return priceFeeds[assetId] != address(0) || manualPrices[assetId].timestamp > 0;
    }
}
