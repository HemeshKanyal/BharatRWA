// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IComplianceManager} from "./interfaces/IComplianceManager.sol";
import {IERC7943Fungible} from "./interfaces/IERC7943.sol";

/**
 * @title BharatRWATokenV2
 * @author BharatRWA Team
 * @notice ERC-20 + ERC-7943 (uRWA) token for a real-world asset.
 * @dev Deployed alongside BharatRWAToken (V1 is unchanged). Eligibility comes from the
 *      existing compliance layer through IComplianceManager, so it works with
 *      ComplianceManager (V1, already on Sepolia) or ComplianceManagerV2.
 *
 *      ERC-7943 mapping:
 *      - canSend / canReceive: approved and not blacklisted in the ComplianceManager.
 *        Never revert: a failing compliance call reads as "not allowed".
 *      - canTransfer: not paused, amount within the unfrozen balance, canSend(from), canReceive(to).
 *      - setFrozenTokens / getFrozenTokens: per-account frozen amount; may exceed the balance.
 *      - forcedTransfer: ENFORCEMENT_ROLE only. Single-party context: bypasses canSend, frozen
 *        amounts and pause, but still requires canReceive(to). Frozen tokens that are moved are
 *        unfrozen first, emitting Frozen before Transfer.
 *
 *      Transfers, holder burns and mints all enforce the rules above (mint: canReceive only).
 *      Kept from V1 for DividendDistributor compatibility: ERC20Votes with timestamp clock,
 *      ERC20Permit, capped supply.
 */
contract BharatRWATokenV2 is
    ERC20,
    ERC20Capped,
    ERC20Permit,
    ERC20Votes,
    AccessControl,
    Pausable,
    IERC7943Fungible
{
    // ============================================================
    //                          ROLES
    // ============================================================

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");
    bytes32 public constant ENFORCEMENT_ROLE = keccak256("ENFORCEMENT_ROLE");

    // ============================================================
    //                          STATE
    // ============================================================

    IComplianceManager public complianceManager;

    /// @notice The asset ID this token represents in the AssetRegistry
    uint256 public immutable assetId;

    mapping(address account => uint256 amount) private _frozenTokens;

    // ============================================================
    //                      EVENTS & ERRORS
    // ============================================================

    event ComplianceManagerUpdated(address indexed oldManager, address indexed newManager);

    error ZeroAddress();
    error NotAContract(address account);

    // ============================================================
    //                        CONSTRUCTOR
    // ============================================================

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 cap_,
        address admin,
        address complianceManager_,
        uint256 assetId_
    ) ERC20(name_, symbol_) ERC20Capped(cap_) ERC20Permit(name_) {
        if (admin == address(0)) revert ZeroAddress();
        _setComplianceManager(complianceManager_);
        assetId = assetId_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(FREEZER_ROLE, admin);
        _grantRole(ENFORCEMENT_ROLE, admin);
    }

    // ============================================================
    //                    ERC-7943: VIEWS
    // ============================================================

    /// @inheritdoc IERC7943Fungible
    function canSend(address account) public view override returns (bool allowed) {
        return _isEligible(account);
    }

    /// @inheritdoc IERC7943Fungible
    function canReceive(address account) public view override returns (bool allowed) {
        return _isEligible(account);
    }

    /// @inheritdoc IERC7943Fungible
    /// @dev Returns false only for permissioned reasons. An amount above the whole balance is a
    ///      base ERC-20 failure, so it is not reported here.
    function canTransfer(address from, address to, uint256 amount) public view override returns (bool allowed) {
        if (paused()) return false;
        uint256 balance = balanceOf(from);
        if (amount <= balance && amount > _unfrozenBalance(from, balance)) return false;
        return canSend(from) && canReceive(to);
    }

    /// @inheritdoc IERC7943Fungible
    function getFrozenTokens(address account) public view override returns (uint256 amount) {
        return _frozenTokens[account];
    }

    // ============================================================
    //                 ERC-7943: ENFORCEMENT
    // ============================================================

    /// @inheritdoc IERC7943Fungible
    function setFrozenTokens(address account, uint256 amount)
        external
        override
        onlyRole(FREEZER_ROLE)
        returns (bool result)
    {
        if (account == address(0)) revert ZeroAddress();
        _frozenTokens[account] = amount;
        emit Frozen(account, amount);
        return true;
    }

    /// @inheritdoc IERC7943Fungible
    function forcedTransfer(address from, address to, uint256 amount)
        external
        override
        onlyRole(ENFORCEMENT_ROLE)
        returns (bool result)
    {
        if (from == address(0)) revert ERC20InvalidSender(address(0));
        if (to == address(0)) revert ERC20InvalidReceiver(address(0));
        if (!canReceive(to)) revert ERC7943CannotReceive(to);

        uint256 balance = balanceOf(from);
        if (amount > balance) revert ERC20InsufficientBalance(from, balance, amount);

        uint256 unfrozen = _unfrozenBalance(from, balance);
        if (amount > unfrozen) {
            // Unfreeze exactly what is needed. amount <= balance, so this cannot underflow:
            // if frozen <= balance, the result is balance - amount; otherwise frozen - amount.
            uint256 newFrozen = _frozenTokens[from] - (amount - unfrozen);
            _frozenTokens[from] = newFrozen;
            emit Frozen(from, newFrozen);
        }

        // Skip this contract's compliance checks; keep ERC20 / Votes bookkeeping.
        super._update(from, to, amount);
        emit ForcedTransfer(from, to, amount);
        return true;
    }

    // ============================================================
    //                     ISSUER FUNCTIONS
    // ============================================================

    /// @notice Mint to an eligible recipient (canReceive is enforced in _update).
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /// @notice Burn from the caller's unfrozen balance (canSend is enforced in _update).
    function burn(uint256 amount) external {
        _burn(_msgSender(), amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setComplianceManager(address newManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setComplianceManager(newManager);
    }

    // ============================================================
    //                        INTERNALS
    // ============================================================

    /// @dev Compliance checks for every balance change except forcedTransfer.
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Capped, ERC20Votes)
    {
        _requireNotPaused();
        if (from != address(0)) {
            // Transfer or holder burn. If value exceeds the whole balance, let ERC20 revert
            // with ERC20InsufficientBalance (the more specific error, as ERC-7943 asks).
            uint256 balance = balanceOf(from);
            if (value <= balance) {
                uint256 unfrozen = _unfrozenBalance(from, balance);
                if (value > unfrozen) revert ERC7943InsufficientUnfrozenBalance(from, value, unfrozen);
            }
            if (!canSend(from)) revert ERC7943CannotSend(from);
        }
        if (to != address(0) && !canReceive(to)) revert ERC7943CannotReceive(to);

        super._update(from, to, value);
    }

    function _unfrozenBalance(address account, uint256 balance) internal view returns (uint256) {
        uint256 frozen = _frozenTokens[account];
        return balance > frozen ? balance - frozen : 0;
    }

    /// @dev Approved and not blacklisted. Never reverts: a reverting compliance call is "no".
    function _isEligible(address account) internal view returns (bool) {
        if (account == address(0)) return false;
        IComplianceManager cm = complianceManager;
        try cm.isApproved(account) returns (bool approved) {
            if (!approved) return false;
        } catch {
            return false;
        }
        try cm.isBlacklisted(account) returns (bool blacklisted) {
            return !blacklisted;
        } catch {
            return false;
        }
    }

    function _setComplianceManager(address newManager) internal {
        if (newManager == address(0)) revert ZeroAddress();
        if (newManager.code.length == 0) revert NotAContract(newManager);
        emit ComplianceManagerUpdated(address(complianceManager), newManager);
        complianceManager = IComplianceManager(newManager);
    }

    // ============================================================
    //                  REQUIRED OVERRIDES
    // ============================================================

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl, IERC165) returns (bool) {
        return interfaceId == type(IERC7943Fungible).interfaceId || interfaceId == type(IERC20).interfaceId
            || super.supportsInterface(interfaceId);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }

    /// @dev Timestamp clock, as in V1, so DividendDistributor can snapshot by timestamp.
    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }
}
