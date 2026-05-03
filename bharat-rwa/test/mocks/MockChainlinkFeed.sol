// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAggregatorV3} from "../../src/interfaces/IAggregatorV3.sol";

/**
 * @title MockChainlinkFeed
 * @notice Mock Chainlink AggregatorV3 price feed for testing
 */
contract MockChainlinkFeed is IAggregatorV3 {
    int256 private _price;
    uint8 private _decimals;
    uint256 private _updatedAt;
    string private _description;
    uint80 private _roundId;

    constructor(int256 price_, uint8 decimals_, string memory description_) {
        _price = price_;
        _decimals = decimals_;
        _description = description_;
        _updatedAt = block.timestamp;
        _roundId = 1;
    }

    function setPrice(int256 price_) external {
        _price = price_;
        _updatedAt = block.timestamp;
        _roundId++;
    }

    function setUpdatedAt(uint256 updatedAt_) external {
        _updatedAt = updatedAt_;
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external view override returns (string memory) {
        return _description;
    }

    function version() external pure override returns (uint256) {
        return 3;
    }

    function getRoundData(uint80)
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, _price, _updatedAt, _updatedAt, _roundId);
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, _price, _updatedAt, _updatedAt, _roundId);
    }
}
