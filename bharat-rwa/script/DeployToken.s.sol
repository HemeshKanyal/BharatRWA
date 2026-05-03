// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {BharatRWAToken} from "../src/BharatRWAToken.sol";

/**
 * @title DeployToken
 * @notice Registers a new asset in the AssetRegistry and deploys its token.
 *
 * @dev Usage:
 *      ASSET_REGISTRY=0x... \
 *      ASSET_NAME="BharatRWA Gold Token" \
 *      ASSET_SYMBOL="BGOLD" \
 *      ASSET_SUPPLY=1000000000000000000000000 \
 *      forge script script/DeployToken.s.sol:DeployToken --rpc-url $SEPOLIA_RPC_URL --broadcast
 */
contract DeployToken is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        address registryAddr = vm.envAddress("ASSET_REGISTRY");
        string memory assetName = vm.envString("ASSET_NAME");
        string memory assetSymbol = vm.envString("ASSET_SYMBOL");
        uint256 assetSupply = vm.envUint("ASSET_SUPPLY");

        console2.log("Deployer:", deployer);
        console2.log("Registry:", registryAddr);
        console2.log("Asset:", assetName, assetSymbol);

        AssetRegistry registry = AssetRegistry(registryAddr);

        vm.startBroadcast(deployerPrivateKey);

        bytes32 metadataHash = keccak256(abi.encodePacked(assetName, block.timestamp));

        uint256 assetId = registry.registerAsset(assetName, assetSymbol, metadataHash, assetSupply);

        address tokenAddr = registry.getTokenContract(assetId);

        console2.log("");
        console2.log("========================================");
        console2.log("  Asset Registered Successfully");
        console2.log("========================================");
        console2.log("Asset ID:      ", assetId);
        console2.log("Token Address: ", tokenAddr);
        console2.log("Name:          ", assetName);
        console2.log("Symbol:        ", assetSymbol);
        console2.log("Supply:        ", assetSupply);
        console2.log("========================================");

        vm.stopBroadcast();
    }
}
