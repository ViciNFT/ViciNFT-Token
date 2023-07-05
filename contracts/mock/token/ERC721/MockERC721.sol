// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

/**
 * @title Mock ERC721
 * @notice (c) 2023 ViciNFT https://vicinft.com/
 * @author Josh Davis <josh.davis@vicinft.com>
 *
 * @dev A simple extension to OpenZeppelin's ERC721Enumerable contract with 
 * public unsecured mint and batchMint functions.
 */
contract MockERC721 is ERC721Enumerable {
    constructor(string memory name_, string memory symbol_)
        ERC721(name_, symbol_)
    {}

    function mint(address to, uint256 tokenId) public {
        super._safeMint(to, tokenId);
    }

    function batchMint(address[] memory toAddresses, uint256[] memory tokenIds) public {
        require(toAddresses.length == tokenIds.length, "array length mismatch");

        for (uint256 i = 0; i < tokenIds.length; i++) {
            super._safeMint(toAddresses[i], tokenIds[i]);
        }
    }
}
