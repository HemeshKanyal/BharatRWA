// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAssetRegistry} from "./interfaces/IAssetRegistry.sol";
import {BharatRWAToken} from "./BharatRWAToken.sol";

/**
 * @title AssetRegistry
 * @author BharatRWA Team
 * @notice Central registry linking physical real-world assets to their on-chain token representations.
 * @dev UUPS-upgradeable contract that manages:
 *      - Asset registration by verified custodians
 *      - Token deployment for each registered asset
 *      - Asset lifecycle management (activation/deactivation)
 *      - Custodian management
 *
 *      Roles:
 *      - ADMIN_ROLE: Can upgrade, deactivate assets, update custodians
 *      - CUSTODIAN_ROLE: Can register new assets
 */
contract AssetRegistry is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuard,
    IAssetRegistry
{
    // ============================================================
    //                          ROLES
    // ============================================================

    bytes32 public constant CUSTODIAN_ROLE = keccak256("CUSTODIAN_ROLE");

    // ============================================================
    //                          STATE
    // ============================================================

    /// @notice Counter for generating unique asset IDs
    uint256 public nextAssetId;

    /// @notice Mapping of asset ID to Asset struct
    mapping(uint256 => Asset) private _assets;

    /// @notice The compliance manager address (passed to deployed tokens)
    address public complianceManager;

    /// @notice Array of all asset IDs for enumeration
    uint256[] public allAssetIds;

    // ============================================================
    //                          EVENTS
    // ============================================================

    event AssetRegistered(
        uint256 indexed assetId,
        string name,
        string symbol,
        address indexed custodian,
        address indexed tokenContract,
        uint256 totalSupply
    );
    event AssetDeactivated(uint256 indexed assetId, address indexed by);
    event AssetReactivated(uint256 indexed assetId, address indexed by);
    event CustodianUpdated(uint256 indexed assetId, address indexed oldCustodian, address indexed newCustodian);
    event ComplianceManagerUpdated(address indexed oldManager, address indexed newManager);

    // ============================================================
    //                          ERRORS
    // ============================================================

    error ZeroAddress();
    error AssetNotFound(uint256 assetId);
    error AssetNotActive(uint256 assetId);
    error AssetAlreadyActive(uint256 assetId);
    error InvalidSupply();
    error EmptyName();
    error EmptySymbol();

    // ============================================================
    //                        INITIALIZER
    // ============================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the asset registry
     * @param admin The admin address
     * @param complianceManager_ The compliance manager contract address
     */
    function initialize(address admin, address complianceManager_) external initializer {
        if (admin == address(0) || complianceManager_ == address(0)) revert ZeroAddress();

        __AccessControl_init();


        complianceManager = complianceManager_;
        nextAssetId = 1; // Start from 1 so 0 is invalid

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CUSTODIAN_ROLE, admin);
    }

    // ============================================================
    //                   ASSET REGISTRATION
    // ============================================================

    /**
     * @notice Register a new real-world asset and deploy its token
     * @param name_ Asset/token name (e.g. "BharatRWA Gold Token")
     * @param symbol_ Token symbol (e.g. "BGOLD")
     * @param metadataHash IPFS hash of the asset metadata document
     * @param tokenSupply Maximum token supply for this asset
     * @return assetId The unique ID of the registered asset
     */
    function registerAsset(string calldata name_, string calldata symbol_, bytes32 metadataHash, uint256 tokenSupply)
        external
        onlyRole(CUSTODIAN_ROLE)
        nonReentrant
        returns (uint256 assetId)
    {
        if (bytes(name_).length == 0) revert EmptyName();
        if (bytes(symbol_).length == 0) revert EmptySymbol();
        if (tokenSupply == 0) revert InvalidSupply();

        assetId = nextAssetId++;

        // Deploy a new BharatRWAToken for this asset
        BharatRWAToken token =
            new BharatRWAToken(name_, symbol_, tokenSupply, msg.sender, complianceManager, assetId);

        // Store asset data
        Asset storage asset = _assets[assetId];
        asset.assetId = assetId;
        asset.name = name_;
        asset.symbol = symbol_;
        asset.metadataHash = metadataHash;
        asset.custodian = msg.sender;
        asset.tokenContract = address(token);
        asset.totalSupply = tokenSupply;
        asset.isActive = true;
        asset.registrationTimestamp = block.timestamp;

        allAssetIds.push(assetId);

        emit AssetRegistered(assetId, name_, symbol_, msg.sender, address(token), tokenSupply);
    }

    // ============================================================
    //                   ADMIN FUNCTIONS
    // ============================================================

    /**
     * @notice Deactivate an asset (e.g. if custodian fails proof of reserve)
     * @param assetId_ The asset ID to deactivate
     */
    function deactivateAsset(uint256 assetId_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Asset storage asset = _assets[assetId_];
        if (asset.registrationTimestamp == 0) revert AssetNotFound(assetId_);
        if (!asset.isActive) revert AssetNotActive(assetId_);

        asset.isActive = false;
        emit AssetDeactivated(assetId_, msg.sender);
    }

    /**
     * @notice Reactivate a previously deactivated asset
     * @param assetId_ The asset ID to reactivate
     */
    function reactivateAsset(uint256 assetId_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Asset storage asset = _assets[assetId_];
        if (asset.registrationTimestamp == 0) revert AssetNotFound(assetId_);
        if (asset.isActive) revert AssetAlreadyActive(assetId_);

        asset.isActive = true;
        emit AssetReactivated(assetId_, msg.sender);
    }

    /**
     * @notice Update the custodian for an asset
     * @param assetId_ The asset ID
     * @param newCustodian The new custodian address
     */
    function updateCustodian(uint256 assetId_, address newCustodian) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newCustodian == address(0)) revert ZeroAddress();
        Asset storage asset = _assets[assetId_];
        if (asset.registrationTimestamp == 0) revert AssetNotFound(assetId_);

        address oldCustodian = asset.custodian;
        asset.custodian = newCustodian;

        emit CustodianUpdated(assetId_, oldCustodian, newCustodian);
    }

    /**
     * @notice Update the compliance manager reference
     * @param newManager The new compliance manager address
     */
    function setComplianceManager(address newManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newManager == address(0)) revert ZeroAddress();
        address oldManager = complianceManager;
        complianceManager = newManager;
        emit ComplianceManagerUpdated(oldManager, newManager);
    }

    // ============================================================
    //                     VIEW FUNCTIONS
    // ============================================================

    /// @inheritdoc IAssetRegistry
    function getAsset(uint256 assetId_) external view override returns (Asset memory) {
        if (_assets[assetId_].registrationTimestamp == 0) revert AssetNotFound(assetId_);
        return _assets[assetId_];
    }

    /// @inheritdoc IAssetRegistry
    function isAssetActive(uint256 assetId_) external view override returns (bool) {
        return _assets[assetId_].isActive;
    }

    /// @inheritdoc IAssetRegistry
    function getTokenContract(uint256 assetId_) external view override returns (address) {
        if (_assets[assetId_].registrationTimestamp == 0) revert AssetNotFound(assetId_);
        return _assets[assetId_].tokenContract;
    }

    /**
     * @notice Get total number of registered assets
     */
    function totalAssets() external view returns (uint256) {
        return allAssetIds.length;
    }

    /**
     * @notice Get all asset IDs
     */
    function getAllAssetIds() external view returns (uint256[] memory) {
        return allAssetIds;
    }

    // ============================================================
    //                     UUPS UPGRADE
    // ============================================================

    /// @dev Only admin can authorize upgrades
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
