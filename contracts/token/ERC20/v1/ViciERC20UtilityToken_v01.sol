// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./ViciERC20v01.sol";
import "../extensions/IERC20UtilityOperations.sol";

/**
 * @title Vici ERC20 Utility Token
 * @notice (c) 2023 ViciNFT https://vicinft.com/
 * @author Josh Davis <josh.davis@vicinft.com>
 *
 * @notice This contract extends the behavior of the base Vici ERC20 contract by
 * providing a limitations to how airdropped tokens can be used by earmarking
 * tokens or by timelocking tokens.
 * @notice Earmarked tokens are airdropped to a user for the purpose of allowing
 * them to attend an event, purchase an NFT, or participate in other experiences
 * or utilities offered by ViciNFT.
 * @notice Time-locked tokens are airdropped to VIPs. Over time, time-locked
 * tokens become unlocked tokens according to a vesting schedule. Time-locked
 * tokens may also be spent in the same manner as earmarked tokens.
 * @notice If a user has earmarked tokens and time-locked tokens, the earmarked
 * tokens are spent first.
 * @dev Roles used by the access management are
 * - DEFAULT_ADMIN_ROLE: administers the other roles
 * - MODERATOR_ROLE_NAME: administers the banned role
 * - MINTER_ROLE_NAME: can mint/burn tokens
 * - AIRDROP_ROLE_NAME: can airdrop tokens and manage the list of addresses
 *   where earmarked tokens may be transferred.
 * - BANNED_ROLE: cannot send or receive tokens
 */
contract ViciERC20UtilityToken_v01 is ViciERC20v01 {
    event LostTokensRecovered(address from, address to, uint256 value);

    function utilityOps()
        internal
        view
        virtual
        returns (IERC20UtilityOperations)
    {
        return IERC20UtilityOperations(address(tokenData));
    }

    /**
     * @notice Transfers tokens from the caller to a recipient and establishes
     * a vesting schedule.
     *
     * Requirements:
     * - caller MUST have the AIRDROPPER role
     * - the transaction MUST meet all requirements for a transfer
     * @dev see IERC20Operations.transfer
     */
    function airdropTimelockedTokens(
        address recipient,
        uint256 amount,
        uint256 duration
    ) public virtual {
        utilityOps().airdropTimelockedTokens(
            this,
            ERC20TransferData(_msgSender(), _msgSender(), recipient, amount),
            duration
        );
        _post_transfer_hook(_msgSender(), recipient, amount);
    }

    /**
     * @notice Unlocks some or all of `account`'s locked tokens.
     * @param account the user
     * @param unlockAmount the amount to unlock
     *
     * Requirements:
     * - caller MUST be the owner or have the AIRDROPPER role
     * - `unlockAmount` MAY be greater than the locked balance, in which case
     *     all of the account's locked tokens are unlocked.
     */
    function unlockLockedTokens(
        address account,
        uint256 unlockAmount
    ) public virtual {
        utilityOps().unlockLockedTokens(
            this,
            msg.sender,
            account,
            unlockAmount
        );
    }

    /**
     * @notice Returns the amount of locked tokens for `account`.
     * @param account the user address
     */
    function lockedBalanceOf(
        address account
    ) public view virtual returns (uint256) {
        return utilityOps().lockedBalanceOf(account);
    }

    /**
     * @notice Returns the Unix timestamp when a user's locked tokens will be
     * released.
     * @param account the user address
     */
    function lockReleaseDate(
        address account
    ) public view virtual returns (uint256) {
        return utilityOps().lockReleaseDate(account);
    }

    /**
     * @notice Returns the difference between `account`'s total balance and its
     * locked balance.
     * @param account the user address
     */
    function unlockedBalanceOf(
        address account
    ) public view virtual returns (uint256) {
        return utilityOps().unlockedBalanceOf(account);
    }

    /**
     * @notice recovers tokens from lost wallets
     * @dev emits LostTokensRecovered
     *
     * Requirements
     * - `operator` MUST be the contract owner.
     * - `fromAddress` MUST have been marked as a "lost wallet".
     * - `toAddress` MUST NOT be banned or OFAC sanctioned
     */
    function recoverMisplacedTokens(
        address lostWallet,
        address toAddress
    ) public virtual onlyOwner {
        uint256 amount = utilityOps().recoverMisplacedTokens(
            this,
            msg.sender,
            lostWallet,
            toAddress
        );
        emit LostTokensRecovered(lostWallet, toAddress, amount);
        _post_transfer_hook(lostWallet, toAddress, amount);
    }
}
