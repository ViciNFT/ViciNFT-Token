// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ChainalysisSanctionsList} from "../../access/IAccessServer.sol";
import "../../access/Ownable.sol";

/**
 * @title Mock Sanctions
 * @notice (c) 2023 ViciNFT https://vicinft.com/
 * @author Josh Davis <josh.davis@vicinft.com>
 *
 * @dev Test sanctions contract that allows the owner or sanctions manager to
 *     add or remove sanctioned accounts.
 */
contract MockSanctions is Ownable, ChainalysisSanctionsList {
    mapping(address => bool) private sanctionedAddresses;

    event SanctionedAddress(address indexed addr);
    event NonSanctionedAddress(address indexed addr);
    event SanctionedAddressesAdded(address[] addrs);
    event SanctionedAddressesRemoved(address[] addrs);

    function initialize() public virtual initializer {
        __MockSanctions_init();
    }

    function __MockSanctions_init() internal onlyInitializing {
        __Ownable_init_unchained();
        __MockSanctions_init_unchained();
    }

    function __MockSanctions_init_unchained() internal onlyInitializing {}


    function name() external pure returns (string memory) {
        return "Test sanctions oracle";
    }

    function isSanctioned(address addr) public view override returns (bool) {
        return sanctionedAddresses[addr];
    }

    function addToSanctionsList(address[] memory newSanctions)
        public
        onlyOwner
    {
        for (uint256 i = 0; i < newSanctions.length; i++) {
            sanctionedAddresses[newSanctions[i]] = true;
        }
        emit SanctionedAddressesAdded(newSanctions);
    }

    function removeFromSanctionsList(address[] memory removeSanctions)
        public
        onlyOwner
    {
        for (uint256 i = 0; i < removeSanctions.length; i++) {
            sanctionedAddresses[removeSanctions[i]] = false;
        }
        emit SanctionedAddressesRemoved(removeSanctions);
    }

    function isSanctionedVerbose(address addr) public returns (bool) {
        if (isSanctioned(addr)) {
            emit SanctionedAddress(addr);
            return true;
        } else {
            emit NonSanctionedAddress(addr);
            return false;
        }
    }
}
