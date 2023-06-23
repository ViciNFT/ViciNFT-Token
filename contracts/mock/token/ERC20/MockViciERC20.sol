// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../../../token/ERC20/extensions/ViciERC20UtilityToken.sol";

/**
 * @title Mock Vici ERC20
 * @notice (c) 2023 ViciNFT https://vicinft.com/
 * @author Josh Davis <josh.davis@vicinft.com>
 *
 * @dev A simple extension to our ViciERC20 contract with a public unsecured 
 * freeMint function.
 */
contract MockViciERC20 is ViciERC20UtilityToken {
    function initialize(
        IAccessServer _accessServer,
        IERC20Operations _tokenData,
        string calldata _name,
        string calldata _symbol,
        uint8  _decimals
    ) public virtual override initializer {
        __MockViciERC20_init(_accessServer, _tokenData, _name, _symbol, _decimals);
    }

    function __MockViciERC20_init(
        IAccessServer _accessServer,
        IERC20Operations _tokenData,
        string calldata _name,
        string calldata _symbol,
        uint8  _decimals
    ) internal onlyInitializing {
        __ViciERC20_init(_accessServer, _tokenData, _name, _symbol, _decimals);
        __MockViciERC20_init_unchained();
    }

    function __MockViciERC20_init_unchained() internal onlyInitializing {}

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
