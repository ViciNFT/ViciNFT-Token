// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../../../token/ERC20/extensions/ViciERC20MintableUtilityToken.sol";

/**
 * @title Mock Vici ERC20 Mintable Utility Token
 * @notice (c) 2023 ViciNFT https://vicinft.com/
 * @author Josh Davis <josh.davis@vicinft.com>
 *
 * @dev A simple extension to our ViciERC20 contract with a public unsecured 
 * freeMint function.
 */
contract MockViciERC20UtilityToken is ViciERC20MintableUtilityToken {
    function freeMint(address _toAddress, uint256 _amount) public {
        require(_amount < 10**(9 + decimals), "Don't be greedy");
        tokenData.mint(
            this,
            ERC20MintData(owner(), MINTER_ROLE_NAME, _toAddress, _amount)
        );

        _post_mint_hook(_toAddress, _amount);
    }

    function domainSeparatorV4() public view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function hashTypedDataV4(bytes32 structHash) public view virtual returns (bytes32) {
        return _hashTypedDataV4(structHash);
    }

    function EIP712NameHash() public virtual view returns (bytes32) {
        return _EIP712NameHash();
    }

    function EIP712VersionHash() public virtual view returns (bytes32) {
        return _EIP712VersionHash();
    }
}
