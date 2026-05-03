// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IZKVerifier} from "../../src/interfaces/IZKVerifier.sol";

/**
 * @title MockZKVerifier
 * @notice Mock ZK verifier for testing — always returns a configurable result
 */
contract MockZKVerifier is IZKVerifier {
    bool public shouldVerify;

    constructor(bool _shouldVerify) {
        shouldVerify = _shouldVerify;
    }

    function setShouldVerify(bool _shouldVerify) external {
        shouldVerify = _shouldVerify;
    }

    function verify(bytes calldata, bytes32[] calldata) external view override returns (bool) {
        return shouldVerify;
    }
}
