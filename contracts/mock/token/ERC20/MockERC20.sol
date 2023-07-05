// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title Mock ERC20
 * @notice (c) 2023 ViciNFT https://vicinft.com/
 * @author Josh Davis <josh.davis@vicinft.com>
 *
 * @dev A simple extension to OpenZeppelin's ERC20 contract with a public 
 * unsecured mint function.
 */
contract MockERC20 is ERC20 {
    uint8 my_decimals;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) ERC20(_name, _symbol) {
        my_decimals = _decimals;
    }

    function decimals() public view override returns (uint8) {
        return my_decimals;
    }

    function mint(address _account, uint256 _amount) public {
        require(_amount < 10 ** (9+decimals()), "Don't be greedy");
        ERC20._mint(_account, _amount);
    }
}
