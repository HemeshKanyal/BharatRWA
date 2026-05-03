// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IComplianceManager
 * @notice Interface for the compliance manager that handles KYC verification and blacklisting
 */
interface IComplianceManager {
    /// @notice Check if an investor wallet is KYC-approved
    function isApproved(address wallet) external view returns (bool);

    /// @notice Check if a wallet is blacklisted
    function isBlacklisted(address wallet) external view returns (bool);

    /// @notice Check if a transfer between two wallets is compliant
    function isTransferCompliant(address from, address to) external view returns (bool);
}
