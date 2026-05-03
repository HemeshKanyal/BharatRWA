// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IZKVerifier
 * @notice Interface for the Zero-Knowledge proof verifier
 */
interface IZKVerifier {
    /// @notice Verify a ZK proof against public inputs
    /// @param proof The serialized proof bytes
    /// @param publicInputs The public inputs to the circuit
    /// @return True if the proof is valid
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}
