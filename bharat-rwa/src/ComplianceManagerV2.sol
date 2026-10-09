// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {IComplianceManager} from "./interfaces/IComplianceManager.sol";
import {IZKVerifier} from "./interfaces/IZKVerifier.sol";

/**
 * @title ComplianceManagerV2
 * @author BharatRWA Team
 * @notice Investor compliance registry with wallet-bound ZK-KYC proofs, expiry and jurisdiction.
 * @dev Deployed alongside (not replacing) ComplianceManager. Implements the same
 *      IComplianceManager interface, so BharatRWAToken and BharatRWATokenV2 can use either.
 *
 *      Fixes over V1:
 *      - Proofs are bound to the caller: public input 0 (the circuit's `expected_wallet_hash`)
 *        must equal msg.sender, so a proof cannot be replayed by another wallet.
 *      - The circuit's own nullifier (public output 0) is used for replay protection, and the
 *        age / KYC / sanction flags are checked.
 *      - Approvals expire. ZK approvals last `defaultValidity`; officers can set any expiry.
 *      - Each investor has a jurisdiction code (ISO 3166-1 alpha-2, e.g. "IN", "AE"),
 *        matching the Solana allowlist entry. It is recorded, not yet enforced.
 *
 *      Expected circuit: backend/zk_kyc (wallet_hash = wallet). Public inputs, in order:
 *        [0] expected_wallet_hash (= wallet address)   [1] nullifier
 *        [2] age_flag (1)   [3] kyc_flag (1)   [4] sanction_flag (0)   [5] wallet_hash
 *      The verifier for it is src/zk/WalletBoundHonkVerifier.sol.
 *
 *      Roles:
 *      - DEFAULT_ADMIN_ROLE: upgrades, verifier, default validity
 *      - COMPLIANCE_ROLE: set/revoke investors, blacklist
 */
contract ComplianceManagerV2 is Initializable, UUPSUpgradeable, AccessControlUpgradeable, IComplianceManager {
    // ============================================================
    //                          ROLES
    // ============================================================

    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    // ============================================================
    //                    PUBLIC INPUT LAYOUT
    // ============================================================

    uint256 public constant PI_WALLET = 0;
    uint256 public constant PI_NULLIFIER = 1;
    uint256 public constant PI_AGE_FLAG = 2;
    uint256 public constant PI_KYC_FLAG = 3;
    uint256 public constant PI_SANCTION_FLAG = 4;
    uint256 public constant PI_WALLET_OUT = 5;
    uint256 public constant PI_COUNT = 6;

    // ============================================================
    //                          STATE
    // ============================================================

    struct Investor {
        bool approved;
        bytes2 jurisdiction;
        uint64 expiresAt;
    }

    IZKVerifier public zkVerifier;

    /// @notice How long a ZK-based approval lasts, in seconds.
    uint64 public defaultValidity;

    mapping(address => Investor) private _investors;
    mapping(address => bool) private _blacklisted;
    mapping(bytes32 => bool) public usedNullifiers;

    // ============================================================
    //                          EVENTS
    // ============================================================

    event InvestorVerified(address indexed wallet, bytes32 indexed nullifier, uint64 expiresAt);
    event InvestorSet(address indexed wallet, bool approved, bytes2 jurisdiction, uint64 expiresAt, address indexed by);
    event InvestorBlacklisted(address indexed wallet, address indexed by);
    event InvestorUnblacklisted(address indexed wallet, address indexed by);
    event ZKVerifierUpdated(address indexed oldVerifier, address indexed newVerifier);
    event DefaultValidityUpdated(uint64 oldValidity, uint64 newValidity);

    // ============================================================
    //                          ERRORS
    // ============================================================

    error ZeroAddress();
    error InvalidPublicInputs();
    error ProofNotForSender(bytes32 provenWallet, address sender);
    error KycConditionsNotMet();
    error NullifierAlreadyUsed(bytes32 nullifier);
    error ZKProofInvalid();
    error WalletBlacklisted(address wallet);
    error InvalidJurisdiction(bytes2 jurisdiction);
    error ExpiryInPast(uint64 expiresAt);
    error InvalidValidity();
    error AlreadyBlacklisted(address wallet);
    error NotBlacklisted(address wallet);

    // ============================================================
    //                        INITIALIZER
    // ============================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @param admin Receives DEFAULT_ADMIN_ROLE and COMPLIANCE_ROLE
     * @param verifier A verifier for the wallet-bound circuit (IZKVerifier-compatible)
     * @param validity Lifetime of ZK approvals in seconds
     */
    function initialize(address admin, address verifier, uint64 validity) external initializer {
        if (admin == address(0) || verifier == address(0)) revert ZeroAddress();
        if (validity == 0) revert InvalidValidity();

        __AccessControl_init();

        zkVerifier = IZKVerifier(verifier);
        defaultValidity = validity;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
    }

    // ============================================================
    //                     ZK VERIFICATION
    // ============================================================

    /**
     * @notice Verify a wallet-bound ZK-KYC proof and approve msg.sender until
     *         `block.timestamp + defaultValidity`.
     * @dev Keeps an existing jurisdiction; officers set it with `setInvestor`.
     */
    function verifyAndApprove(bytes calldata proof, bytes32[] calldata publicInputs) external {
        if (publicInputs.length != PI_COUNT) revert InvalidPublicInputs();

        bytes32 senderField = bytes32(uint256(uint160(msg.sender)));
        if (publicInputs[PI_WALLET] != senderField) revert ProofNotForSender(publicInputs[PI_WALLET], msg.sender);
        if (publicInputs[PI_WALLET_OUT] != senderField) {
            revert ProofNotForSender(publicInputs[PI_WALLET_OUT], msg.sender);
        }
        if (
            uint256(publicInputs[PI_AGE_FLAG]) != 1 || uint256(publicInputs[PI_KYC_FLAG]) != 1
                || uint256(publicInputs[PI_SANCTION_FLAG]) != 0
        ) revert KycConditionsNotMet();
        if (_blacklisted[msg.sender]) revert WalletBlacklisted(msg.sender);

        bytes32 nullifier = publicInputs[PI_NULLIFIER];
        if (usedNullifiers[nullifier]) revert NullifierAlreadyUsed(nullifier);

        // Barretenberg verifiers revert on malformed proofs instead of returning false.
        try zkVerifier.verify(proof, publicInputs) returns (bool ok) {
            if (!ok) revert ZKProofInvalid();
        } catch {
            revert ZKProofInvalid();
        }

        usedNullifiers[nullifier] = true;
        Investor storage inv = _investors[msg.sender];
        inv.approved = true;
        inv.expiresAt = uint64(block.timestamp) + defaultValidity;

        emit InvestorVerified(msg.sender, nullifier, inv.expiresAt);
    }

    // ============================================================
    //                  COMPLIANCE MANAGEMENT
    // ============================================================

    /**
     * @notice Create or overwrite an investor record (e.g. after off-chain KYC).
     * @param jurisdiction Two uppercase ASCII letters, or 0x0000 for "unknown"
     * @param expiresAt Unix timestamp; must be in the future when `approved` is true
     */
    function setInvestor(address wallet, bool approved, bytes2 jurisdiction, uint64 expiresAt)
        external
        onlyRole(COMPLIANCE_ROLE)
    {
        if (wallet == address(0)) revert ZeroAddress();
        if (!_isValidJurisdiction(jurisdiction)) revert InvalidJurisdiction(jurisdiction);
        if (approved && expiresAt <= block.timestamp) revert ExpiryInPast(expiresAt);

        _investors[wallet] = Investor({approved: approved, jurisdiction: jurisdiction, expiresAt: expiresAt});
        emit InvestorSet(wallet, approved, jurisdiction, expiresAt, msg.sender);
    }

    /// @notice Revoke an investor's approval, keeping their jurisdiction and expiry on record.
    function revokeApproval(address wallet) external onlyRole(COMPLIANCE_ROLE) {
        Investor storage inv = _investors[wallet];
        inv.approved = false;
        emit InvestorSet(wallet, false, inv.jurisdiction, inv.expiresAt, msg.sender);
    }

    function blacklist(address wallet) external onlyRole(COMPLIANCE_ROLE) {
        if (wallet == address(0)) revert ZeroAddress();
        if (_blacklisted[wallet]) revert AlreadyBlacklisted(wallet);
        _blacklisted[wallet] = true;
        emit InvestorBlacklisted(wallet, msg.sender);
    }

    function removeBlacklist(address wallet) external onlyRole(COMPLIANCE_ROLE) {
        if (!_blacklisted[wallet]) revert NotBlacklisted(wallet);
        _blacklisted[wallet] = false;
        emit InvestorUnblacklisted(wallet, msg.sender);
    }

    // ============================================================
    //                     VIEW FUNCTIONS
    // ============================================================

    /// @inheritdoc IComplianceManager
    /// @dev Approved and not expired. Blacklisting is reported separately by `isBlacklisted`.
    function isApproved(address wallet) public view override returns (bool) {
        Investor storage inv = _investors[wallet];
        return inv.approved && block.timestamp < inv.expiresAt;
    }

    /// @inheritdoc IComplianceManager
    function isBlacklisted(address wallet) public view override returns (bool) {
        return _blacklisted[wallet];
    }

    /// @inheritdoc IComplianceManager
    function isTransferCompliant(address from, address to) external view override returns (bool) {
        return isApproved(from) && isApproved(to) && !_blacklisted[from] && !_blacklisted[to];
    }

    function getInvestor(address wallet) external view returns (Investor memory) {
        return _investors[wallet];
    }

    // ============================================================
    //                     ADMIN FUNCTIONS
    // ============================================================

    function setZKVerifier(address newVerifier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newVerifier == address(0)) revert ZeroAddress();
        emit ZKVerifierUpdated(address(zkVerifier), newVerifier);
        zkVerifier = IZKVerifier(newVerifier);
    }

    function setDefaultValidity(uint64 validity) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (validity == 0) revert InvalidValidity();
        emit DefaultValidityUpdated(defaultValidity, validity);
        defaultValidity = validity;
    }

    // ============================================================
    //                        INTERNALS
    // ============================================================

    function _isValidJurisdiction(bytes2 code) internal pure returns (bool) {
        if (code == bytes2(0)) return true;
        bytes1 a = code[0];
        bytes1 b = code[1];
        return a >= "A" && a <= "Z" && b >= "A" && b <= "Z";
    }

    /// @dev Only admin can authorize upgrades
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
