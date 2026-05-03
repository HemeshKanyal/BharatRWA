// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {IComplianceManager} from "./interfaces/IComplianceManager.sol";

/**
 * @title BharatRWAToken
 * @author BharatRWA Team
 * @notice ERC-20 token representing fractional ownership of a real-world asset.
 * @dev Each registered real-world asset (gold, property, commodity) gets its own
 *      dedicated BharatRWAToken deployment with a unique name/symbol and capped supply.
 *
 *      Key features:
 *      - Capped supply (set at deployment, cannot be changed)
 *      - Compliance-gated transfers via ComplianceManager
 *      - ERC20Votes for checkpoint-based balance tracking (used by DividendDistributor)
 *      - ERC20Permit for gasless approvals (EIP-2612)
 *      - Pausable by admin for emergency stops
 *      - Role-based access control (ADMIN, MINTER, PAUSER)
 */
contract BharatRWAToken is ERC20, ERC20Capped, ERC20Pausable, ERC20Permit, ERC20Votes, AccessControl, ReentrancyGuard {
    // ============================================================
    //                          ROLES
    // ============================================================

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ============================================================
    //                          STATE
    // ============================================================

    /// @notice The compliance manager used to gate transfers
    IComplianceManager public complianceManager;

    /// @notice The asset ID this token represents in the AssetRegistry
    uint256 public assetId;

    // ============================================================
    //                          EVENTS
    // ============================================================

    event ComplianceManagerUpdated(address indexed oldManager, address indexed newManager);
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);

    // ============================================================
    //                          ERRORS
    // ============================================================

    error TransferNotCompliant(address from, address to);
    error ZeroAddress();
    error ComplianceManagerNotSet();

    // ============================================================
    //                        CONSTRUCTOR
    // ============================================================

    /**
     * @param name_ Token name (e.g. "BharatRWA Gold Token")
     * @param symbol_ Token symbol (e.g. "BGOLD")
     * @param cap_ Maximum token supply (in wei)
     * @param admin The address that receives all admin roles
     * @param complianceManager_ The compliance manager contract address
     * @param assetId_ The asset ID in the AssetRegistry
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 cap_,
        address admin,
        address complianceManager_,
        uint256 assetId_
    ) ERC20(name_, symbol_) ERC20Capped(cap_) ERC20Permit(name_) {
        if (admin == address(0)) revert ZeroAddress();
        if (complianceManager_ == address(0)) revert ZeroAddress();

        complianceManager = IComplianceManager(complianceManager_);
        assetId = assetId_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ============================================================
    //                     EXTERNAL FUNCTIONS
    // ============================================================

    /**
     * @notice Mint new tokens to a specified address
     * @param to Recipient address (must be KYC-approved)
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @notice Burn tokens from caller's balance
     * @param amount Amount of tokens to burn
     */
    function burn(uint256 amount) external nonReentrant {
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }

    /**
     * @notice Pause all token transfers
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause all token transfers
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Update the compliance manager address
     * @param newManager New compliance manager contract address
     */
    function setComplianceManager(address newManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newManager == address(0)) revert ZeroAddress();
        address oldManager = address(complianceManager);
        complianceManager = IComplianceManager(newManager);
        emit ComplianceManagerUpdated(oldManager, newManager);
    }

    // ============================================================
    //                    INTERNAL OVERRIDES
    // ============================================================

    /**
     * @dev Core transfer hook — enforces compliance checks on every transfer.
     *      Minting (from == address(0)) and burning (to == address(0)) are allowed
     *      without compliance checks (minting is role-gated, burning is voluntary).
     *      All other transfers require both sender and receiver to be compliant.
     */
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Capped, ERC20Pausable, ERC20Votes)
    {
        // Compliance check for non-mint/burn transfers
        if (from != address(0) && to != address(0)) {
            if (address(complianceManager) == address(0)) revert ComplianceManagerNotSet();
            if (!complianceManager.isTransferCompliant(from, to)) {
                revert TransferNotCompliant(from, to);
            }
        }

        super._update(from, to, value);
    }

    /**
     * @dev Required override for ERC20Permit + ERC20Votes nonce conflict
     */
    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }

    /**
     * @dev Override clock to use block.timestamp instead of block.number.
     *      This enables timestamp-based checkpoints which are needed by the
     *      DividendDistributor to look up balances at specific timestamps.
     */
    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    /**
     * @dev ERC-6372 clock mode descriptor
     */
    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }
}
