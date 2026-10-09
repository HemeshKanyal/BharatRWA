// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console2} from "forge-std/Script.sol";
import {BharatRWATokenV2} from "../src/BharatRWATokenV2.sol";
import {ComplianceManagerV2} from "../src/ComplianceManagerV2.sol";
import {WalletBoundHonkVerifier} from "../src/zk/WalletBoundHonkVerifier.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployTokenV2
 * @notice Deploys BharatRWATokenV2 (ERC-20 + ERC-7943) next to the existing contracts.
 *         Nothing already deployed is modified.
 *
 *         Compliance source, chosen by env:
 *         - COMPLIANCE_MANAGER set: use that IComplianceManager (e.g. the existing Sepolia
 *           ComplianceManager 0x07bfd4e030Cf250597A898E9EF43110365c7dbAC).
 *         - unset (default): deploy WalletBoundHonkVerifier + ComplianceManagerV2 (UUPS proxy).
 *
 * @dev Env:
 *      PRIVATE_KEY          deployer; receives all admin roles
 *      COMPLIANCE_MANAGER   optional, see above
 *      TOKEN_NAME           default "BharatRWA Gold V2"
 *      TOKEN_SYMBOL         default "BGOLD2"
 *      TOKEN_CAP            whole tokens, default 1,000,000
 *      ASSET_ID             AssetRegistry id, default 0
 *      ZK_VALIDITY_DAYS     ComplianceManagerV2 approval lifetime, default 365
 *
 *      Usage (Sepolia):
 *        forge script script/DeployTokenV2.s.sol:DeployTokenV2 \
 *          --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
 *      Dry run (no broadcast): omit --broadcast.
 */
contract DeployTokenV2 is Script {
    uint256 constant SEPOLIA = 11155111;
    uint256 constant ANVIL = 31337;

    function run() external returns (BharatRWATokenV2 token, address complianceManager) {
        require(block.chainid == SEPOLIA || block.chainid == ANVIL, "DeployTokenV2: Sepolia or Anvil only");

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        complianceManager = vm.envOr("COMPLIANCE_MANAGER", address(0));
        string memory name = vm.envOr("TOKEN_NAME", string("BharatRWA Gold V2"));
        string memory symbol = vm.envOr("TOKEN_SYMBOL", string("BGOLD2"));
        uint256 cap = vm.envOr("TOKEN_CAP", uint256(1_000_000)) * 1e18;
        uint256 assetId = vm.envOr("ASSET_ID", uint256(0));
        uint64 validity = uint64(vm.envOr("ZK_VALIDITY_DAYS", uint256(365)) * 1 days);

        console2.log("Chain id:", block.chainid);
        console2.log("Deployer:", deployer);

        vm.startBroadcast(deployerKey);

        if (complianceManager == address(0)) {
            WalletBoundHonkVerifier verifier = new WalletBoundHonkVerifier();
            ComplianceManagerV2 impl = new ComplianceManagerV2();
            ERC1967Proxy proxy = new ERC1967Proxy(
                address(impl), abi.encodeCall(ComplianceManagerV2.initialize, (deployer, address(verifier), validity))
            );
            complianceManager = address(proxy);
            console2.log("WalletBoundHonkVerifier:   ", address(verifier));
            console2.log("ComplianceManagerV2 (impl):", address(impl));
            console2.log("ComplianceManagerV2 (proxy):", complianceManager);
        } else {
            require(complianceManager.code.length > 0, "COMPLIANCE_MANAGER has no code on this chain");
            console2.log("Using existing compliance manager:", complianceManager);
        }

        token = new BharatRWATokenV2(name, symbol, cap, deployer, complianceManager, assetId);

        vm.stopBroadcast();

        console2.log("BharatRWATokenV2:", address(token));
        console2.log("supportsInterface(0x3edbb4c4):", token.supportsInterface(0x3edbb4c4));
    }
}
