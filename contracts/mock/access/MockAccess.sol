// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../../access/ViciAccess.sol";

/**
 * @title Mock Access
 * @notice (c) 2023 ViciNFT https://vicinft.com/
 * @author Josh Davis <josh.davis@vicinft.com>
 *
 * @dev A contract for testing role access.
 * @dev Any account that is not banned is allowed to update the public counter.
 * @dev The contract owner and accounts with the UNIT_TESTER role are allowed
 *    to update the unit tester counter.
 * @dev Only the owner is allowed to update the owner counter.
 */
contract MockAccess is ViciAccess {
    bytes32 internal constant UNIT_TESTER = "unit tester";

    uint256 internal _public_counter;
    uint256 internal _owner_counter;
    uint256 internal _unit_tester_counter;

    function initialize(IAccessServer _accessServer) public virtual initializer {
        __MockAccess_init(_accessServer);
    }

    function __MockAccess_init(IAccessServer _accessServer)
        internal
        onlyInitializing
    {
        __ViciAccess_init(_accessServer);
        __MockAccess_init_unchained();
    }

    function __MockAccess_init_unchained() internal onlyInitializing {}

    function get_public_counter() public view returns (uint256) {
        return _public_counter;
    }

    function get_owner_counter() public view returns (uint256) {
        return _owner_counter;
    }

    function get_unit_tester_counter() public view returns (uint256) {
        return _unit_tester_counter;
    }

    function increment_public_counter() public noBannedAccounts {
        _public_counter++;
    }

    function increment_unit_tester_counter()
        public
        noBannedAccounts
        onlyOwnerOrRole(UNIT_TESTER)
    {
        _unit_tester_counter++;
    }

    function increment_owner_counter() public onlyOwner {
        _owner_counter++;
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[47] private __gap;
}
