// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

/**
 * @title Mock ERC1155
 * @notice (c) 2023 ViciNFT https://vicinft.com/
 * @author Josh Davis <josh.davis@vicinft.com>
 *
 * @dev A simple extension to OpenZeppelin's ERC1155 contract with a public 
 * unsecured mint function.
 */
contract MockERC1155 is ERC1155 {
    constructor(string memory uri_) ERC1155(uri_) {}

    function mint(
        address to,
        uint256 id,
        uint256 amount
    ) public {
        super._mint(to, id, amount, "");
    }
}
