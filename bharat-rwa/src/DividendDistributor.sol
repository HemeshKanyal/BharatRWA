// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";


/**
 * @title DividendDistributor
 * @author BharatRWA Team
 * @notice Pull-based dividend distribution for BharatRWA token holders.
 * @dev Uses ERC20Votes checkpoints to determine each investor's balance at the
 *      time of dividend declaration (snapshot timestamp). Investors call claimDividend()
 *      to pull their share — this pattern scales to unlimited holders without gas limit issues.
 *
 *      Flow:
 *      1. Admin creates a dividend round by depositing ETH and specifying a snapshot timestamp
 *      2. The snapshot timestamp should be in the past so that checkpoints are already recorded
 *      3. Investors call claimDividend(roundId) to pull their proportional share
 *      4. Share = (investorBalance / totalSupply) * totalDividendAmount
 *
 *      Roles:
 *      - ADMIN_ROLE: Can create dividend rounds and recover stuck ETH
 */
contract DividendDistributor is AccessControl, ReentrancyGuard {
    // ============================================================
    //                          STRUCTS
    // ============================================================

    struct DividendRound {
        uint256 totalAmount; // Total ETH deposited for this round
        uint48 snapshotTimestamp; // Checkpoint timestamp for balance lookup
        address tokenAddress; // The BharatRWAToken this round is for
        uint256 totalSupplyAtSnapshot; // Total supply at snapshot (cached)
        uint256 claimedAmount; // Total ETH claimed so far
        bool finalized; // Whether the round is finalized
    }

    // ============================================================
    //                          STATE
    // ============================================================

    /// @notice Counter for generating round IDs
    uint256 public nextRoundId;

    /// @notice Mapping of round ID to DividendRound
    mapping(uint256 => DividendRound) public rounds;

    /// @notice Tracks whether an investor has claimed for a specific round
    /// @dev roundId => investor => claimed
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    // ============================================================
    //                          EVENTS
    // ============================================================

    event DividendRoundCreated(
        uint256 indexed roundId, address indexed tokenAddress, uint256 totalAmount, uint48 snapshotTimestamp
    );
    event DividendClaimed(uint256 indexed roundId, address indexed investor, uint256 amount);
    event UnclaimedDividendsRecovered(uint256 indexed roundId, uint256 amount, address indexed to);

    // ============================================================
    //                          ERRORS
    // ============================================================

    error ZeroAddress();
    error ZeroAmount();
    error InvalidSnapshotTimestamp();
    error RoundNotFound(uint256 roundId);
    error AlreadyClaimed(uint256 roundId, address investor);
    error NothingToClaim(uint256 roundId, address investor);
    error TransferFailed();
    error RoundNotFinalized(uint256 roundId);
    error SnapshotTooRecent();

    // ============================================================
    //                        CONSTRUCTOR
    // ============================================================

    /**
     * @param admin The admin address
     */
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        nextRoundId = 1;
    }

    // ============================================================
    //                   DIVIDEND MANAGEMENT
    // ============================================================

    /**
     * @notice Create a new dividend round
     * @dev The snapshot timestamp must be in the past. ETH is sent with this call.
     * @param tokenAddress The BharatRWAToken contract address
     * @param snapshotTimestamp The timestamp at which to look up balances
     */
    function createDividendRound(address tokenAddress, uint48 snapshotTimestamp)
        external
        payable
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
    {
        if (tokenAddress == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();
        if (snapshotTimestamp >= block.timestamp) revert InvalidSnapshotTimestamp();

        // Get total supply at the snapshot point
        // ERC20Votes uses getPastTotalSupply(timepoint) for timestamp-based lookups
        uint256 totalSupply = ERC20Votes(tokenAddress).getPastTotalSupply(snapshotTimestamp);
        if (totalSupply == 0) revert ZeroAmount();

        uint256 roundId = nextRoundId++;

        rounds[roundId] = DividendRound({
            totalAmount: msg.value,
            snapshotTimestamp: snapshotTimestamp,
            tokenAddress: tokenAddress,
            totalSupplyAtSnapshot: totalSupply,
            claimedAmount: 0,
            finalized: true
        });

        emit DividendRoundCreated(roundId, tokenAddress, msg.value, snapshotTimestamp);
    }

    /**
     * @notice Claim dividends for a specific round
     * @param roundId The dividend round ID
     */
    function claimDividend(uint256 roundId) external nonReentrant {
        DividendRound storage round = rounds[roundId];
        if (round.totalAmount == 0) revert RoundNotFound(roundId);
        if (!round.finalized) revert RoundNotFinalized(roundId);
        if (hasClaimed[roundId][msg.sender]) revert AlreadyClaimed(roundId, msg.sender);

        // Look up the investor's balance at the snapshot timestamp
        uint256 investorBalance =
            ERC20Votes(round.tokenAddress).getPastVotes(msg.sender, round.snapshotTimestamp);

        if (investorBalance == 0) revert NothingToClaim(roundId, msg.sender);

        // Calculate proportional share
        uint256 claimAmount = (round.totalAmount * investorBalance) / round.totalSupplyAtSnapshot;

        if (claimAmount == 0) revert NothingToClaim(roundId, msg.sender);

        // Mark as claimed BEFORE transfer (CEI pattern)
        hasClaimed[roundId][msg.sender] = true;
        round.claimedAmount += claimAmount;

        // Transfer ETH to the investor
        (bool success,) = payable(msg.sender).call{value: claimAmount}("");
        if (!success) revert TransferFailed();

        emit DividendClaimed(roundId, msg.sender, claimAmount);
    }

    // ============================================================
    //                     VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Get the claimable dividend amount for an investor
     * @param roundId The dividend round ID
     * @param investor The investor address
     * @return The claimable ETH amount
     */
    function getClaimableAmount(uint256 roundId, address investor) external view returns (uint256) {
        DividendRound storage round = rounds[roundId];
        if (round.totalAmount == 0) return 0;
        if (hasClaimed[roundId][investor]) return 0;

        uint256 investorBalance =
            ERC20Votes(round.tokenAddress).getPastVotes(investor, round.snapshotTimestamp);

        if (investorBalance == 0) return 0;

        return (round.totalAmount * investorBalance) / round.totalSupplyAtSnapshot;
    }

    /**
     * @notice Get details of a dividend round
     * @param roundId The round ID
     */
    function getRound(uint256 roundId) external view returns (DividendRound memory) {
        return rounds[roundId];
    }

    // ============================================================
    //                   ADMIN RECOVERY
    // ============================================================

    /**
     * @notice Recover unclaimed dividends after a grace period
     * @param roundId The round ID
     * @param to The address to send unclaimed ETH to
     */
    function recoverUnclaimed(uint256 roundId, address to) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        DividendRound storage round = rounds[roundId];
        if (round.totalAmount == 0) revert RoundNotFound(roundId);

        uint256 unclaimed = round.totalAmount - round.claimedAmount;
        if (unclaimed == 0) revert ZeroAmount();

        round.claimedAmount = round.totalAmount; // Prevent further claims

        (bool success,) = payable(to).call{value: unclaimed}("");
        if (!success) revert TransferFailed();

        emit UnclaimedDividendsRecovered(roundId, unclaimed, to);
    }
}
