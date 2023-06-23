// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../ERC20Operations.sol";
import "./IERC20UtilityOperations.sol";

/**
 * @title ERC20 Utility Operations
 * @notice (c) 2023 ViciNFT https://vicinft.com/
 * @author Josh Davis <josh.davis@vicinft.com>
 *
 * @dev This contract implements most of the logic behind the Vici ERC20 Utility
 * token extension.
 * @dev The main contract MUST be the owner of this contract.
 * @dev Main contracts SHOULD refer to this contract via the IERC20UtilityOperations
 * interface.
 */
contract ERC20UtilityOperations is ERC20Operations, IERC20UtilityOperations {
    mapping(address => uint256) internal lockedAmount;
    mapping(address => uint256) internal releaseDate;

    /**
     *  @dev see {ERC20UtilityOperations-airdropTimelockedTokens}.
     */
    function airdropTimelockedTokens(
        IViciAccess ams,
        ERC20TransferData memory transferData,
        uint256 duration
    )
        public
        virtual
        onlyOwner
        onlyOwnerOrRole(ams, transferData.operator, AIRDROP_ROLE_NAME)
    {
        transfer(ams, transferData);
        if (lockedBalanceOf(transferData.toAddress) == 0) {
            lockedAmount[transferData.toAddress] = transferData.amount;
            releaseDate[transferData.toAddress] = uint64(
                _currentTimestamp() + duration
            );
        } else {
            lockedAmount[transferData.toAddress] += transferData.amount;
        }
    }

    /**
     *  @dev see {ERC20UtilityOperations-unlockLockedTokens}.
     */
    function unlockLockedTokens(
        IViciAccess ams,
        address operator,
        address account,
        uint256 unlockAmount
    )
        public
        virtual
        onlyOwner
        onlyOwnerOrRole(ams, operator, AIRDROP_ROLE_NAME)
    {
        if (unlockAmount >= lockedAmount[account]) {
            lockedAmount[account] = 0;
        } else {
            lockedAmount[account] -= unlockAmount;
        }
    }

    /**
     *  @dev see {ERC20UtilityOperations-lockedBalanceOf}.
     */
    function lockedBalanceOf(
        address account
    ) public view virtual returns (uint256) {
        if (_currentTimestamp() > releaseDate[account]) {
            return 0;
        }
        return lockedAmount[account];
    }

    /**
     *  @dev see {ERC20UtilityOperations-lockReleaseDate}.
     */
    function lockReleaseDate(
        address account
    ) public view virtual returns (uint256) {
        if (lockedBalanceOf(account) == 0) {
            return 0;
        }
        return releaseDate[account];
    }

    /**
     *  @dev see {ERC20UtilityOperations-unlockedBalanceOf}.
     */
    function unlockedBalanceOf(
        address account
    ) public view virtual returns (uint256) {
        if (_currentTimestamp() >= releaseDate[account]) {
            return balanceOf(account);
        }
        return balanceOf(account) - lockedAmount[account];
    }

    function _checkLocks(
        address fromAddress,
        uint256 transferAmount
    ) internal view {
        if (
            _currentTimestamp() < releaseDate[fromAddress] &&
            lockedAmount[fromAddress] > 0
        ) {
            require(
                balanceOf(fromAddress) >=
                    transferAmount + lockedAmount[fromAddress],
                "insufficient balance"
            );
        }
    }

    /**
     * @dev see {IERC20-transfer}.
     */
    function transfer(
        IViciAccess ams,
        ERC20TransferData memory transferData
    ) public virtual override(ERC20Operations, IERC20Operations) {
        _checkLocks(transferData.fromAddress, transferData.amount);

        ERC20Operations.transfer(ams, transferData);
    }

    /**
     *  @dev see {ERC20UtilityOperations-recoverMisplacedTokens}.
     */
    function recoverMisplacedTokens(
        IViciAccess ams,
        address operator,
        address fromAddress,
        address toAddress
    )
        public
        virtual
        onlyOwner
        notBanned(ams, toAddress)
        returns (uint256 amount)
    {
        require(ams.hasRole(LOST_WALLET, fromAddress), "not a lost wallet");
        require(toAddress != address(0), "ERC20: transfer to the zero address");

        lockedAmount[fromAddress] = 0;
        releaseDate[fromAddress] = 0;

        amount = balanceOf(fromAddress);
        approve(fromAddress, operator, 1, amount);
        doTransfer(operator, fromAddress, toAddress, 1, amount);
    }

    function _currentTimestamp() internal view virtual returns (uint256) {
        return block.timestamp;
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[47] private __gap;
}
