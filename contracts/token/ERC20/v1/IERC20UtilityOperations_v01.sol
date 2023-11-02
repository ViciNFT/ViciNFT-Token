// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../IERC20Operations.sol";

bytes32 constant AIRDROP_ROLE_NAME = "airdrop";
bytes32 constant LOST_WALLET = keccak256("lost wallet");

/**
 * @title ERC20 Utility Operations Interface
 * @notice (c) 2023 ViciNFT https://vicinft.com/
 * @author Josh Davis <josh.davis@vicinft.com>
 *
 * @dev Interface for ERC20 utiity token operations
 * @dev Main contracts SHOULD refer to the ops contract via the this interface.
 */
interface IERC20UtilityOperations_v01 is IERC20Operations {

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
        IViciAccess ams,
        ERC20TransferData memory transferData,
        uint256 duration
    ) external;

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
        IViciAccess ams,
        address operator,
        address account,
        uint256 unlockAmount
    ) external;

    /**
     * @notice Returns the amount of locked tokens for `account`.
     * @param account the user address
     */
    function lockedBalanceOf(address account) external view returns (uint256);

    /**
     * @notice Returns the Unix timestamp when a user's locked tokens will be
     * released.
     * @param account the user address
     */
    function lockReleaseDate(address account) external view returns (uint256);

    /**
     * @notice Returns the difference between `account`'s total balance and its
     * locked balance.
     * @param account the user address
     */
    function unlockedBalanceOf(address account) external view returns (uint256);

    /**
     * @notice recovers tokens from lost wallets
     */
    function recoverMisplacedTokens(
        IViciAccess ams,
        address operator,
        address fromAddress,
        address toAddress
    ) external returns (uint256 amount);
}
