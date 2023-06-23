// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../../../token/ERC20/extensions/ERC20UtilityOperations.sol";

contract MockERC20UtilityOperations is ERC20UtilityOperations {
    uint256 public currentTimestamp;

    function _currentTimestamp()
        internal
        view
        virtual
        override
        returns (uint256)
    {
        return currentTimestamp;
    }

    function setCurrentTimestamp(uint256 timestamp) public virtual {
        currentTimestamp = timestamp;
    }

    function incrementTimestamp(uint256 amount) public virtual {
        currentTimestamp += amount;
    }
}
