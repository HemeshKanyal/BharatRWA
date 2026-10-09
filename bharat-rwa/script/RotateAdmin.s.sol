// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console2} from "forge-std/Script.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

interface IRegistry {
    function getAllAssetIds() external view returns (uint256[] memory);
    function getTokenContract(uint256 assetId) external view returns (address);
}

interface ICompliance {
    function isApproved(address) external view returns (bool);
    function manualApprove(address) external;
}

/**
 * @title RotateAdmin
 * @notice Moves every role held by a compromised key on the Sepolia V1 deployment to a new
 *         admin, then renounces the old key's roles. Covers AssetRegistry, ComplianceManager,
 *         AssetOracle, DividendDistributor and every asset token in the registry.
 *
 * @dev Env:
 *      OLD_PRIVATE_KEY  the compromised key (signs everything)
 *      NEW_ADMIN        address that receives all roles
 *
 *      Dry run:  forge script script/RotateAdmin.s.sol:RotateAdmin --rpc-url $SEPOLIA_RPC_URL
 *      Execute:  add --broadcast --slow
 */
contract RotateAdmin is Script {
    address constant REGISTRY = 0x774E3195E3efB0fa403366033881C6ab1fe14B0D;
    address constant COMPLIANCE = 0x07bfd4e030Cf250597A898E9EF43110365c7dbAC;
    address constant ORACLE = 0x590AE2361F302B274a7FB7277E1f15A450BBF392;
    address constant DISTRIBUTOR = 0x8E53f313a17C3f6347696Fd2C87B97cDdE52F52C;

    bytes32 constant ADMIN = 0x00;
    address oldAdmin;
    address newAdmin;

    function run() external {
        require(block.chainid == 11155111, "Sepolia only");
        uint256 oldKey = vm.envUint("OLD_PRIVATE_KEY");
        oldAdmin = vm.addr(oldKey);
        newAdmin = vm.envAddress("NEW_ADMIN");
        require(newAdmin != address(0) && newAdmin != oldAdmin, "bad NEW_ADMIN");
        console2.log("Old admin:", oldAdmin);
        console2.log("New admin:", newAdmin);

        bytes32[] memory registryRoles = _roles("CUSTODIAN_ROLE");
        bytes32[] memory complianceRoles = _roles("COMPLIANCE_ROLE");
        bytes32[] memory oracleRoles = _roles("ORACLE_ROLE");
        bytes32[] memory distributorRoles = new bytes32[](0);
        bytes32[] memory tokenRoles = new bytes32[](2);
        tokenRoles[0] = keccak256("MINTER_ROLE");
        tokenRoles[1] = keccak256("PAUSER_ROLE");

        uint256[] memory ids = IRegistry(REGISTRY).getAllAssetIds();

        vm.startBroadcast(oldKey);

        // The backend's wallet must be KYC-approved to receive sold tokens.
        if (!ICompliance(COMPLIANCE).isApproved(newAdmin)) ICompliance(COMPLIANCE).manualApprove(newAdmin);

        _rotate("AssetRegistry", REGISTRY, registryRoles);
        _rotate("ComplianceManager", COMPLIANCE, complianceRoles);
        _rotate("AssetOracle", ORACLE, oracleRoles);
        _rotate("DividendDistributor", DISTRIBUTOR, distributorRoles);
        for (uint256 i; i < ids.length; i++) {
            _rotate(
                string.concat("Token #", vm.toString(ids[i])), IRegistry(REGISTRY).getTokenContract(ids[i]), tokenRoles
            );
        }

        vm.stopBroadcast();

        // Post-conditions
        address[] memory targets = new address[](4 + ids.length);
        (targets[0], targets[1], targets[2], targets[3]) = (REGISTRY, COMPLIANCE, ORACLE, DISTRIBUTOR);
        for (uint256 i; i < ids.length; i++) {
            targets[4 + i] = IRegistry(REGISTRY).getTokenContract(ids[i]);
        }
        for (uint256 i; i < targets.length; i++) {
            require(IAccessControl(targets[i]).hasRole(ADMIN, newAdmin), "new admin missing");
            require(!IAccessControl(targets[i]).hasRole(ADMIN, oldAdmin), "old admin still present");
        }
        console2.log("Rotated contracts:", targets.length);
    }

    function _roles(string memory extra) internal pure returns (bytes32[] memory r) {
        r = new bytes32[](1);
        r[0] = keccak256(bytes(extra));
    }

    /// Grant admin + extra roles to newAdmin, then renounce the old key's extra roles and admin (last).
    function _rotate(string memory label, address target, bytes32[] memory extra) internal {
        IAccessControl ac = IAccessControl(target);
        if (!ac.hasRole(ADMIN, oldAdmin)) {
            console2.log("SKIP (old key is not admin):", label);
            return;
        }
        for (uint256 i; i < extra.length; i++) {
            if (!ac.hasRole(extra[i], newAdmin)) ac.grantRole(extra[i], newAdmin);
        }
        if (!ac.hasRole(ADMIN, newAdmin)) ac.grantRole(ADMIN, newAdmin);
        for (uint256 i; i < extra.length; i++) {
            if (ac.hasRole(extra[i], oldAdmin)) ac.renounceRole(extra[i], oldAdmin);
        }
        ac.renounceRole(ADMIN, oldAdmin);
        console2.log("Rotated:", label, target);
    }
}
