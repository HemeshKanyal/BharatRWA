// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IZKVerifier.sol";

contract MockZKVerifier is IZKVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure override returns (bool) {
        return true;
    }
}
