// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./MockViciERC20.sol";

contract MockViciERC20Reinit is MockViciERC20 {
    function reinit(string calldata newSymbol, uint8 version) reinitializer(version) public {
        symbol = newSymbol;
    }
}