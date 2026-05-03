// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {ComplianceManager} from "../src/ComplianceManager.sol";
import {BharatRWAToken} from "../src/BharatRWAToken.sol";
import {MockZKVerifier} from "./mocks/MockZKVerifier.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract AssetRegistryTest is Test {
    AssetRegistry public registry;
    ComplianceManager public compliance;
    MockZKVerifier public mockVerifier;

    address public admin = makeAddr("admin");
    address public custodian = makeAddr("custodian");
    address public unauthorized = makeAddr("unauthorized");

    function setUp() public {
        // Deploy mock verifier
        mockVerifier = new MockZKVerifier(true);

        // Deploy ComplianceManager
        ComplianceManager complianceImpl = new ComplianceManager();
        bytes memory complianceInit =
            abi.encodeWithSelector(ComplianceManager.initialize.selector, admin, address(mockVerifier));
        ERC1967Proxy complianceProxy = new ERC1967Proxy(address(complianceImpl), complianceInit);
        compliance = ComplianceManager(address(complianceProxy));

        // Deploy AssetRegistry
        AssetRegistry registryImpl = new AssetRegistry();
        bytes memory registryInit =
            abi.encodeWithSelector(AssetRegistry.initialize.selector, admin, address(compliance));
        ERC1967Proxy registryProxy = new ERC1967Proxy(address(registryImpl), registryInit);
        registry = AssetRegistry(address(registryProxy));

        // Grant custodian role
        vm.startPrank(admin);
        registry.grantRole(registry.CUSTODIAN_ROLE(), custodian);
        vm.stopPrank();
    }

    // ============================================================
    //                    INITIALIZATION
    // ============================================================

    function test_InitializeSetsCorrectValues() public view {
        assertEq(registry.complianceManager(), address(compliance));
        assertEq(registry.nextAssetId(), 1);
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
    }

    // ============================================================
    //                   ASSET REGISTRATION
    // ============================================================

    function test_RegisterAsset() public {
        bytes32 metadataHash = keccak256("ipfs://QmGoldMetadata");

        vm.prank(custodian);
        uint256 assetId = registry.registerAsset("BharatRWA Gold", "BGOLD", metadataHash, 1_000_000 ether);

        assertEq(assetId, 1);
        assertEq(registry.nextAssetId(), 2);

        // Verify asset data
        AssetRegistry.Asset memory asset = registry.getAsset(assetId);
        assertEq(asset.name, "BharatRWA Gold");
        assertEq(asset.symbol, "BGOLD");
        assertEq(asset.metadataHash, metadataHash);
        assertEq(asset.custodian, custodian);
        assertTrue(asset.isActive);
        assertEq(asset.totalSupply, 1_000_000 ether);
        assertTrue(asset.tokenContract != address(0));
    }

    function test_RegisterAssetDeploysToken() public {
        vm.prank(custodian);
        uint256 assetId = registry.registerAsset("BharatRWA Gold", "BGOLD", bytes32(0), 1_000_000 ether);

        address tokenAddr = registry.getTokenContract(assetId);
        BharatRWAToken token = BharatRWAToken(tokenAddr);

        assertEq(token.name(), "BharatRWA Gold");
        assertEq(token.symbol(), "BGOLD");
        assertEq(token.cap(), 1_000_000 ether);
        assertEq(token.assetId(), assetId);
    }

    function test_RegisterMultipleAssets() public {
        vm.startPrank(custodian);
        uint256 id1 = registry.registerAsset("Gold Token", "BGOLD", bytes32(0), 1_000_000 ether);
        uint256 id2 = registry.registerAsset("Property Token", "BPROP", bytes32(0), 500_000 ether);
        uint256 id3 = registry.registerAsset("Silver Token", "BSILV", bytes32(0), 2_000_000 ether);
        vm.stopPrank();

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
        assertEq(registry.totalAssets(), 3);

        uint256[] memory allIds = registry.getAllAssetIds();
        assertEq(allIds.length, 3);
    }

    function test_RevertRegisterByNonCustodian() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        registry.registerAsset("Test", "TST", bytes32(0), 1000 ether);
    }

    function test_RevertRegisterEmptyName() public {
        vm.prank(custodian);
        vm.expectRevert(AssetRegistry.EmptyName.selector);
        registry.registerAsset("", "TST", bytes32(0), 1000 ether);
    }

    function test_RevertRegisterEmptySymbol() public {
        vm.prank(custodian);
        vm.expectRevert(AssetRegistry.EmptySymbol.selector);
        registry.registerAsset("Test", "", bytes32(0), 1000 ether);
    }

    function test_RevertRegisterZeroSupply() public {
        vm.prank(custodian);
        vm.expectRevert(AssetRegistry.InvalidSupply.selector);
        registry.registerAsset("Test", "TST", bytes32(0), 0);
    }

    // ============================================================
    //                   ASSET MANAGEMENT
    // ============================================================

    function test_DeactivateAsset() public {
        vm.prank(custodian);
        uint256 assetId = registry.registerAsset("Gold", "BGOLD", bytes32(0), 1_000_000 ether);

        vm.prank(admin);
        registry.deactivateAsset(assetId);

        assertFalse(registry.isAssetActive(assetId));
    }

    function test_ReactivateAsset() public {
        vm.prank(custodian);
        uint256 assetId = registry.registerAsset("Gold", "BGOLD", bytes32(0), 1_000_000 ether);

        vm.prank(admin);
        registry.deactivateAsset(assetId);

        vm.prank(admin);
        registry.reactivateAsset(assetId);

        assertTrue(registry.isAssetActive(assetId));
    }

    function test_RevertDeactivateNonExistent() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.AssetNotFound.selector, 999));
        registry.deactivateAsset(999);
    }

    function test_RevertDeactivateAlreadyInactive() public {
        vm.prank(custodian);
        uint256 assetId = registry.registerAsset("Gold", "BGOLD", bytes32(0), 1_000_000 ether);

        vm.startPrank(admin);
        registry.deactivateAsset(assetId);

        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.AssetNotActive.selector, assetId));
        registry.deactivateAsset(assetId);
        vm.stopPrank();
    }

    function test_UpdateCustodian() public {
        vm.prank(custodian);
        uint256 assetId = registry.registerAsset("Gold", "BGOLD", bytes32(0), 1_000_000 ether);

        address newCustodian = makeAddr("newCustodian");
        vm.prank(admin);
        registry.updateCustodian(assetId, newCustodian);

        AssetRegistry.Asset memory asset = registry.getAsset(assetId);
        assertEq(asset.custodian, newCustodian);
    }

    function test_RevertUpdateCustodianByNonAdmin() public {
        vm.prank(custodian);
        uint256 assetId = registry.registerAsset("Gold", "BGOLD", bytes32(0), 1_000_000 ether);

        vm.prank(unauthorized);
        vm.expectRevert();
        registry.updateCustodian(assetId, makeAddr("newCustodian"));
    }

    // ============================================================
    //                   COMPLIANCE MANAGER
    // ============================================================

    function test_UpdateComplianceManager() public {
        address newManager = makeAddr("newComplianceManager");
        vm.prank(admin);
        registry.setComplianceManager(newManager);
        assertEq(registry.complianceManager(), newManager);
    }
}
