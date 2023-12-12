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
     * @notice locked airdrops smaller than this amount CANNOT change a previously set lock date.
     * @notice locked airdrops larger than this amount CAN change a previously set lock date.
     * @dev This value SHOULD be large enough to discourage griefing by using tiny airdrops
     *      to set a user's unlock date far into the future
     */
    uint256 public airdropThreshold;

    event LockUpdated(
        address indexed account,
        uint256 previousRelease,
        uint256 newRelease
    );

    function initialize(
        uint256 _maxSupply,
        uint256 _airdropThreshold
    ) public virtual reinitializer(2) {
        __ERC20Operations_init(_maxSupply);
        __ERC20UtilityOperations_reinit(_airdropThreshold);
    }

    /**
     * @dev Use this one when upgrading from a v1 token
     * @dev Use initialize when deploying for the first time on a new chain.
     */
    function reinit(uint256 _airdropThreshold) public reinitializer(2) {
        __ERC20UtilityOperations_reinit(_airdropThreshold);
    }

    function __ERC20UtilityOperations_reinit(
        uint256 _airdropThreshold
    ) internal onlyInitializing {
        airdropThreshold = _airdropThreshold;
    }

    /**
     *  @dev see {IERC20UtilityOperations-airdropTimelockedTokens}.
     */
    function airdropTimelockedTokens(
        IViciAccess ams,
        ERC20TransferData memory transferData,
        uint256 release
    )
        public
        virtual
        onlyOwner
        onlyOwnerOrRole(ams, transferData.operator, AIRDROP_ROLE_NAME)
    {
        transfer(ams, transferData);
        uint256 currentLockedBalance = lockedBalanceOf(transferData.toAddress);
        uint256 currentLockRelease = releaseDate[transferData.toAddress];
        // unlock date can move forward if amount at least 1K

        if (currentLockedBalance == 0) {
            releaseDate[transferData.toAddress] = release;
            lockedAmount[transferData.toAddress] = transferData.amount;
        } else if (
            transferData.amount >= airdropThreshold &&
            release >= currentLockRelease
        ) {
            lockedAmount[transferData.toAddress] =
                currentLockedBalance +
                transferData.amount;

            releaseDate[transferData.toAddress] = release;
            emit LockUpdated(
                transferData.toAddress,
                currentLockRelease,
                release
            );
        } else {
            lockedAmount[transferData.toAddress] += transferData.amount;
        }
    }

    /**
     *  @dev see {IERC20UtilityOperations-unlockLockedTokens}.
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
        onlyOwnerOrRole(ams, operator, UNLOCK_LOCKED_TOKENS)
    {
        if (unlockAmount >= lockedAmount[account]) {
            lockedAmount[account] = 0;
        } else {
            lockedAmount[account] -= unlockAmount;
        }
    }

    /**
     *  @dev see {IERC20UtilityOperations-updateTimelocks}.
     */
    function updateTimelocks(
        IViciAccess ams,
        address operator,
        uint256 release,
        address[] calldata addresses
    )
        public
        virtual
        onlyOwner
        onlyOwnerOrRole(ams, operator, UNLOCK_LOCKED_TOKENS)
    {
        for (uint256 i = 0; i < addresses.length; i++) {
            uint256 previousRelease = lockReleaseDate(addresses[i]);
            if (previousRelease > 0) {
                releaseDate[addresses[i]] = release;
                emit LockUpdated(addresses[i], previousRelease, release);
            }
        }
    }

    /**
     *  @dev see {IERC20UtilityOperations-lockedBalanceOf}.
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
     *  @dev see {IERC20UtilityOperations-lockReleaseDate}.
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
     *  @dev see {IERC20UtilityOperations-unlockedBalanceOf}.
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
    ) internal virtual view {
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
    function doTransfer(
        address operator,
        address fromAddress,
        address toAddress,
        uint256 thing,
        uint256 amount
    ) public virtual override(OwnerOperator, IOwnerOperator) {
        _checkLocks(fromAddress, amount);

        OwnerOperator.doTransfer(operator, fromAddress, toAddress, thing, amount);
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
    uint256[46] private __gap;
}
