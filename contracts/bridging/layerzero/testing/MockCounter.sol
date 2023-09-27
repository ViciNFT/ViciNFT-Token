// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../../../access/AccessConstants.sol";
import "../../../access/ViciAccess.sol";

contract MockCounter is ViciAccess {
    uint256 public count;

    function initialize(IAccessServer _accessServer) public virtual initializer {
        __MockCounter_init(_accessServer);
    }

    function __MockCounter_init(IAccessServer _accessServer)
        internal
        onlyInitializing
    {
        __ViciAccess_init(_accessServer);
        __MockCounter_init_unchained();
    }

    function __MockCounter_init_unchained() internal onlyInitializing {}

    function counterIncremented() public onlyRole(BRIDGE_CONTRACT) {
        count++;
    }
}