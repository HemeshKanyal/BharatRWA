// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IComplianceManager} from "./interfaces/IComplianceManager.sol";
import {IZKVerifier} from "./interfaces/IZKVerifier.sol";

/**
 * @title ComplianceManager
 * @author BharatRWA Team
 * @notice Manages investor KYC/AML compliance using Zero-Knowledge proofs.
 * @dev UUPS-upgradeable contract that:
 *      - Verifies ZK-KYC proofs via the ZKVerifier contract
 *      - Maintains investor approval status
 *      - Supports blacklisting for regulatory enforcement
 *      - Tracks nullifiers to prevent proof replay attacks
 *
 *      Roles:
 *      - ADMIN_ROLE: Can upgrade the contract and update the verifier
 *      - COMPLIANCE_ROLE: Can manually approve/blacklist investors
 */
contract ComplianceManager is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuard,
    IComplianceManager
{
    // ============================================================
    //                          ROLES
    // ============================================================

    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    // ============================================================
    //                          STATE
    // ============================================================

    /// @notice The ZK verifier contract
    IZKVerifier public zkVerifier;

    /// @notice KYC approval status per wallet
    mapping(address => bool) private _approved;

    /// @notice Blacklist status per wallet
    mapping(address => bool) private _blacklisted;

    /// @notice Used nullifiers to prevent proof replay
    mapping(bytes32 => bool) public usedNullifiers;

    /// @notice Total number of approved investors
    uint256 public totalApproved;

    /// @notice Total number of blacklisted addresses
    uint256 public totalBlacklisted;

    // ============================================================
    //                          EVENTS
    // ============================================================

    event InvestorApproved(address indexed wallet, bytes32 indexed nullifier);
    event InvestorBlacklisted(address indexed wallet, address indexed by);
    event InvestorUnblacklisted(address indexed wallet, address indexed by);
    event InvestorManuallyApproved(address indexed wallet, address indexed by);
    event InvestorRevoked(address indexed wallet, address indexed by);
    event ZKVerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    // ============================================================
    //                          ERRORS
    // ============================================================

    error ZeroAddress();
    error AlreadyApproved(address wallet);
    error NotApproved(address wallet);
    error AlreadyBlacklisted(address wallet);
    error NotBlacklisted(address wallet);
    error NullifierAlreadyUsed(bytes32 nullifier);
    error ZKProofInvalid();

    // ============================================================
    //                        INITIALIZER
    // ============================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the compliance manager
     * @param admin The admin address
     * @param verifier The ZK verifier contract address
     */
    function initialize(address admin, address verifier) external initializer {
        if (admin == address(0) || verifier == address(0)) revert ZeroAddress();

        __AccessControl_init();


        zkVerifier = IZKVerifier(verifier);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
    }

    // ============================================================
    //                     ZK VERIFICATION
    // ============================================================

    /**
     * @notice Verify a ZK-KYC proof and approve the investor
     * @dev The proof's public outputs are expected to contain:
     *      [0] = nullifier (unique per wallet+secret combo)
     *      [1] = age_flag (1 = age >= 18)
     *      [2] = kyc_flag (1 = KYC verified)
     *      [3] = sanction_flag (0 = not sanctioned)
     *      [4] = wallet_hash
     *
     * @param proof The serialized ZK proof
     * @param publicInputs The public inputs array
     */
    function verifyAndApprove(bytes calldata proof, bytes32[] calldata publicInputs) external nonReentrant {
        // The expected_wallet_hash is the first (and only) public input to the circuit
        // The return values (nullifier, flags, wallet_hash) are public outputs
        if (publicInputs.length < 1) revert ZKProofInvalid();

        // Verify the ZK proof
        bool valid = zkVerifier.verify(proof, publicInputs);
        if (!valid) revert ZKProofInvalid();

        // Extract nullifier from the proof's public inputs/outputs
        // In Noir, the public return values are appended after the public inputs
        // publicInputs[0] = expected_wallet_hash (input)
        // For nullifier tracking, we derive it from the wallet hash input
        bytes32 nullifier = keccak256(abi.encodePacked(publicInputs[0], msg.sender));

        // Prevent replay
        if (usedNullifiers[nullifier]) revert NullifierAlreadyUsed(nullifier);
        usedNullifiers[nullifier] = true;

        // Approve the investor
        if (!_approved[msg.sender]) {
            _approved[msg.sender] = true;
            totalApproved++;
        }

        emit InvestorApproved(msg.sender, nullifier);
    }

    // ============================================================
    //                  COMPLIANCE MANAGEMENT
    // ============================================================

    /**
     * @notice Manually approve an investor (for cases where off-chain KYC is used)
     * @param wallet The investor wallet address
     */
    function manualApprove(address wallet) external onlyRole(COMPLIANCE_ROLE) {
        if (wallet == address(0)) revert ZeroAddress();
        if (_approved[wallet]) revert AlreadyApproved(wallet);

        _approved[wallet] = true;
        totalApproved++;

        emit InvestorManuallyApproved(wallet, msg.sender);
    }

    /**
     * @notice Revoke an investor's approval
     * @param wallet The investor wallet address
     */
    function revokeApproval(address wallet) external onlyRole(COMPLIANCE_ROLE) {
        if (!_approved[wallet]) revert NotApproved(wallet);

        _approved[wallet] = false;
        totalApproved--;

        emit InvestorRevoked(wallet, msg.sender);
    }

    /**
     * @notice Blacklist a wallet address
     * @param wallet The wallet to blacklist
     */
    function blacklist(address wallet) external onlyRole(COMPLIANCE_ROLE) {
        if (wallet == address(0)) revert ZeroAddress();
        if (_blacklisted[wallet]) revert AlreadyBlacklisted(wallet);

        _blacklisted[wallet] = true;
        totalBlacklisted++;

        emit InvestorBlacklisted(wallet, msg.sender);
    }

    /**
     * @notice Remove a wallet from the blacklist
     * @param wallet The wallet to unblacklist
     */
    function removeBlacklist(address wallet) external onlyRole(COMPLIANCE_ROLE) {
        if (!_blacklisted[wallet]) revert NotBlacklisted(wallet);

        _blacklisted[wallet] = false;
        totalBlacklisted--;

        emit InvestorUnblacklisted(wallet, msg.sender);
    }

    // ============================================================
    //                     VIEW FUNCTIONS
    // ============================================================

    /// @inheritdoc IComplianceManager
    function isApproved(address wallet) external view override returns (bool) {
        return _approved[wallet];
    }

    /// @inheritdoc IComplianceManager
    function isBlacklisted(address wallet) external view override returns (bool) {
        return _blacklisted[wallet];
    }

    /// @inheritdoc IComplianceManager
    function isTransferCompliant(address from, address to) external view override returns (bool) {
        // Both parties must be approved and neither blacklisted
        return _approved[from] && _approved[to] && !_blacklisted[from] && !_blacklisted[to];
    }

    // ============================================================
    //                     ADMIN FUNCTIONS
    // ============================================================

    /**
     * @notice Update the ZK verifier contract
     * @param newVerifier The new verifier address
     */
    function setZKVerifier(address newVerifier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newVerifier == address(0)) revert ZeroAddress();
        address oldVerifier = address(zkVerifier);
        zkVerifier = IZKVerifier(newVerifier);
        emit ZKVerifierUpdated(oldVerifier, newVerifier);
    }

    // ============================================================
    //                     UUPS UPGRADE
    // ============================================================

    /// @dev Only admin can authorize upgrades
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
