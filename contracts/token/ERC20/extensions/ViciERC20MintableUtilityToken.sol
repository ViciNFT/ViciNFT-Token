// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./ViciERC20UtilityToken.sol";

contract ViciERC20MintableUtilityToken is ViciERC20UtilityToken {

    /* ################################################################
     * Minting / Burning
     * ##############################################################*/

    /**
     * @notice Safely mints a new token and transfers it to `toAddress`.
     * @param toAddress The account to receive the newly minted token.
     * @param amount The id of the new token.
     *
     * Requirements:
     *
     * - Calling user MUST be owner or have the minter role.
     * - Calling user MUST NOT be banned.
     * - `toAddress` MUST NOT be 0x0.
     * - `toAddress` MUST NOT be banned.
     */
    function mint(
        address toAddress,
        uint256 amount
    ) public virtual {
        tokenData.mint(
            this,
            ERC20MintData(_msgSender(), MINTER_ROLE_NAME, toAddress, amount)
        );

        _post_mint_hook(toAddress, amount);
    }

    /**
     * @notice Burns the identified token.
     * @param amount The amount of tokens to be burned.
     * Emits a {Transfer} event.
     *
     * Requirements:
     *
     * - Calling user MUST be owner or have the minter role.
     * - Calling user MUST NOT be banned.
     * - Calling user MUST own the token or be authorized by the owner to
     *     transfer the token.
     */
    function burn(
        address fromAddress,
        uint256 amount
    ) public virtual {
        tokenData.burn(
            this,
            ERC20BurnData(_msgSender(), MINTER_ROLE_NAME, fromAddress, amount)
        );

        _post_burn_hook(fromAddress, amount);
    }
}