// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAssetRegistry
 * @notice Interface for the asset registry
 */
interface IAssetRegistry {
    struct Asset {
        uint256 assetId;
        string name;
        string symbol;
        bytes32 metadataHash; // IPFS hash of asset metadata
        address custodian;
        address tokenContract;
        uint256 totalSupply;
        bool isActive;
        uint256 registrationTimestamp;
    }

    /// @notice Get asset details by ID
    function getAsset(uint256 assetId) external view returns (Asset memory);

    /// @notice Check if an asset is active
    function isAssetActive(uint256 assetId) external view returns (bool);

    /// @notice Get the token contract address for an asset
    function getTokenContract(uint256 assetId) external view returns (address);
}
