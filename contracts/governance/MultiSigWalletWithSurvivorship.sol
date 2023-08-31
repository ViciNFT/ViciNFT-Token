// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "../common/Initializable.sol";
import "../finance/Wallet.sol";

/**
 * @title Multi-Signature Wallet with Timelock and Survivorship
 * @notice Allows multiple parties to agree on transactions before execution.
 * @notice Enforces a delay before allowing a transaction to execute.
 * @author Original: Stefan George - <stefan.george@consensys.net>
 * @author Josh Davis - <josh.davis@vicinft.com>
 * changelog:
 * - update to 0.8
 * - use Address set for owners
 * - add support for sending/holding/receiving tokens
 * - add function to veto transactions
 * - replace boolean executed flag with a status enum
 * - add support for upgrades
 * - add support for timelock
 * - add rights of survivorship
 *
 * Based heavily on the contract at https://polygonscan.com/address/0x355b8e02e7f5301e6fac9b7cac1d6d9c86c0343f
 *
 * This contract has
 * - A set of owners - addresses allowed to submit and confirm transactions
 * - A minimum number of owner for a quorum - the number of confirmations a
 *   transaction must have before it can be executed.
 * - A timelock period - the amount of time that must pass after a transaction
 *   has received the required number of confirmations before it can be
 *   executed.
 * - A live account timer - the amount of time after which, if an owner has
 *   not interacted with this contract (see #ping), that owner's vote is no
 *   longer required for a quorum. That is to say, inactive owners auto-
 *   confirm transactions.
 *
 * Any owner may veto a transaction. A vetoed transaction cannot be confirmed
 * or executed.
 *
 * A multi-sig wallet has a set of owners and a number of required signatures.
 * Any owner can submit a transaction, and the other owners can then confirm
 * the transaction.
 *
 * When a transaction reached the required number of confirmations, a countdown
 * timer begins. The transaction cannot be executed until the required amount
 * of time has passed. If enough owners revoke their confirmation so that the
 * transation no longer has the required number of confirmations, the timer is
 * reset, and will start over if the required number of confirmations is
 * reached again.
 *
 * If the timelock period is 0, then the timelock period feature is turned off.
 * Transactions will executed immediately once they reach the required number
 * of confirmations. If the timelock period is nonzero, transactions must be
 * executed manually by calling the `executeTransaction()` function.
 *
 * If the live account timer is 0, then the survivorship feature is turned off,
 * and owners are never considered to be inactive.
 *
 * IMPORTANT: If the number of required confirmations change, and the change
 * causes pending transactions to reach or fall below the new value, the
 * countdown timers are NOT automatically set or cleared. You can manually
 * set or reset the timer for a transaction by calling `resetConfirmationTimer()`.
 */

enum TransactionStatus {
    // 0: Every status, use for querying. No tx should ever have this status.
    EVERY_STATUS,
    // 1: Unconfirmed, Tx submitted but not confirmed
    UNCONFIRMED,
    // 2: Confirmed, but not yet executed
    CONFIRMED,
    // 3: Executed
    EXECUTED,
    // 4: Vetoed, cannot be executed
    VETOED,
    // 5: Reverted, may be tried again
    REVERTED
}

contract MultiSigWalletWithSurvivorship is Initializable, Wallet {
    using EnumerableSet for EnumerableSet.AddressSet;

    /**
     * @notice Emitted when an owner votes to confirm a transaction.
     */
    event Confirmation(address indexed sender, uint256 indexed transactionId);

    /**
     * @notice Emitted when an owner revokes their vote to confirm a transaction.
     */
    event Revocation(address indexed sender, uint256 indexed transactionId);

    /**
     * @notice Emitted when an owner submits a new transaction.
     */
    event Submission(uint256 indexed transactionId);

    /**
     * @notice Emitted when a confirmed transaction has been performed.
     */
    event Execution(uint256 indexed transactionId);

    /**
     * @notice Emitted when a confirmed transaction failed to execute.
     */
    event ExecutionFailure(uint256 indexed transactionId, string reason);

    /**
     * @notice Emitted when a transaction has been vetoed.
     */
    event Vetoed(address indexed sender, uint256 indexed transactionId);

    /**
     * @notice Emitted when a new owner is added.
     */
    event OwnerAddition(address indexed owner);

    /**
     * @notice Emitted when an owner is removed.
     */
    event OwnerRemoval(address indexed owner);

    /**
     * @notice Emitted when the required number of signatures changes.
     */
    event RequirementChange(uint256 previous, uint256 required);

    /**
     * @notice Emitted when the timelock period is changed.
     */
    event TimelockChange(uint256 previous, uint256 timelock);

    /**
     * @notice Emitted with the live account checkin time period has changed.
     */
    event LiveAccountCheckinChange(
        uint256 previous,
        uint256 liveAccountCheckin
    );

    /**
     * @notice Emitted when the countdown timer for a transaction has been set.
     */
    event ConfirmationTimeSet(uint256 transactionId, uint256 confirmationTime);

    /**
     * @notice Emitted when the countdown timer for a transaction has been cleared.
     */
    event ConfirmationTimeUnset(uint256 transactionId);

    struct Transaction {
        /**
         * What the tx does. Be succinct! You only have 32 characters.
         */
        bytes32 description;
        /**
         * The address of the contract to call.
         */
        address destination;
        /**
         * The amount of crypto to send.
         */
        uint256 value;
        /**
         * Set to true when this transaction is successfully executed.
         */
        TransactionStatus status;
        /**
         * The ABI-encoded function call.
         */
        bytes data;
    }

    uint256 internal constant MAX_OWNER_COUNT = 50;

    /**
     * @dev All submitted transactions by id. Transaction ids are sequential
     *     starting at 1.
     */
    mapping(uint256 => Transaction) public transactions;

    /**
     * @dev For each transaction id, whether an owner has approved it.
     */
    mapping(uint256 => mapping(address => bool)) public confirmations;

    /**
     * @dev address to whether or not they are an owner
     */
    mapping(address => bool) public isOwner;

    /**
     * @dev address to the last blockchain timestamp at which they interacted
     *     with this contract.
     */
    mapping(address => uint256) public lastCheckin;

    /**
     * @dev The set of owners
     */
    EnumerableSet.AddressSet owners;

    /**
     * @dev The number of required confirmations
     */
    uint256 public required;

    /**
     * @dev The total number of submitted transactions
     */
    uint256 public transactionCount;

    /**
     * @dev The number of seconds to wait after confirmation before any
     *     transaction can be executed.
     */
    uint256 public lockPeriod;

    /**
     * @dev The amount of time, after which, an onwer may be considered
     *     inactive.
     */
    uint256 public liveAccountCheckin;

    /**
     * @dev Tracks when a transaction received the required number of
     *     confirmations.
     * @dev Key is transactionId, value is block.timestamp
     */
    mapping(uint256 => uint256) public confirmationTimes;

    modifier onlyWallet() {
        require(msg.sender == address(this), "Must be wallet");
        _;
    }

    modifier ownerDoesNotExist(address owner) {
        enforceNotOwner(owner);
        _;
    }

    modifier ownerExists(address owner) {
        enforceOwner(owner);
        _;
    }

    modifier onlyOwner() {
        enforceOwner(msg.sender);
        _checkin(msg.sender);
        _;
    }

    modifier transactionExists(uint256 transactionId) {
        require(
            transactions[transactionId].destination != address(0),
            string.concat("Invalid TX: ", Strings.toString(transactionId))
        );
        _;
    }

    modifier confirmed(uint256 transactionId, address owner) {
        require(
            confirmations[transactionId][owner],
            string.concat(
                "TX ",
                Strings.toString(transactionId),
                " not confirmed by ",
                Strings.toHexString(owner)
            )
        );
        _;
    }

    modifier notConfirmed(uint256 transactionId, address owner) {
        require(
            !confirmations[transactionId][owner],
            string.concat(
                "TX ",
                Strings.toString(transactionId),
                " already confirmed by ",
                Strings.toHexString(owner)
            )
        );
        _;
    }

    modifier notExecuted(uint256 transactionId) {
        require(
            transactions[transactionId].status != TransactionStatus.EXECUTED,
            string.concat(
                "Already executed TX: ",
                Strings.toString(transactionId)
            )
        );
        _;
    }

    modifier notVetoed(uint256 transactionId) {
        require(
            transactions[transactionId].status != TransactionStatus.VETOED,
            string.concat("Vetoed TX: ", Strings.toString(transactionId))
        );
        _;
    }

    modifier notNull(address _address) {
        enforceValidOwnerAddress(_address);
        _;
    }

    modifier validRequirement(uint256 ownerCount, uint256 _required) {
        enforceValidRequirement(ownerCount, _required);
        _;
    }

    function enforceNotOwner(address owner) internal view virtual {
        require(
            !isOwner[owner],
            string.concat("Already owner: ", Strings.toHexString(owner))
        );
    }

    function enforceOwner(address owner) internal view virtual {
        require(
            isOwner[owner],
            string.concat("Not owner: ", Strings.toHexString(owner))
        );
    }

    function enforceValidOwnerAddress(address _address) internal view virtual {
        require(_address != address(0), "Null owner address");
    }

    function enforceValidRequirement(
        uint256 ownerCount,
        uint256 _required
    ) internal view virtual {
        require(ownerCount <= MAX_OWNER_COUNT, "Too many owners");
        require(_required <= ownerCount, "Not enough owners");
        require(_required != 0, "Required can't be zero");
    }

    /**
     * @param _owners The initial list of owners.
     * @param _required The initial required number of confirmations.
     * @param _lockPeriod The number of seconds to wait after confirmation
     *     before a transaction can be executed.
     * @param _liveAccountCheckin The amount of time, after which, an onwer may
     *     be considered inactive.
     *
     * Requirements:
     * - `_owners` MUST NOT contain any duplicates.
     * - `_owners` MUST NOT contain the null address.
     * - `_required` MUST be greater than 0.
     * - The length of `_owners` MUST NOT be less than `_required`.
     * - The length of `_owners` MUST NOT be greater than `MAX_OWNER_COUNT`.
     * - `_lockPeriod` MAY be 0, in which case transactions will execute
     *     immediately upon receiving the required number of confirmations.
     * - `_liveAccountCheckin` MAY be 0, in which case owners are never
     *    considered to be inactive.
     */
    function initialize(
        address[] calldata _owners,
        uint256 _required,
        uint256 _lockPeriod,
        uint256 _liveAccountCheckin
    ) public virtual initializer {
        __MultiSigWalletWithSurvivorship_init(
            _owners,
            _required,
            _lockPeriod,
            _liveAccountCheckin
        );
    }

    function __MultiSigWalletWithSurvivorship_init(
        address[] calldata _owners,
        uint256 _required,
        uint256 _lockPeriod,
        uint256 _liveAccountCheckin
    ) internal onlyInitializing {
        __MultiSigWalletWithSurvivorship_init_unchained(
            _owners,
            _required,
            _lockPeriod,
            _liveAccountCheckin
        );
    }

    function __MultiSigWalletWithSurvivorship_init_unchained(
        address[] calldata _owners,
        uint256 _required,
        uint256 _lockPeriod,
        uint256 _liveAccountCheckin
    ) internal onlyInitializing validRequirement(_owners.length, _required) {
        for (uint256 i = 0; i < _owners.length; i++) {
            enforceValidOwnerAddress(_owners[i]);
            enforceNotOwner(_owners[i]);
            isOwner[_owners[i]] = true;
            owners.add(_owners[i]);
        }
        required = _required;
        lockPeriod = _lockPeriod;
        liveAccountCheckin = _liveAccountCheckin;
    }

    /**
     * @notice Changes the lock period.
     * @notice emits TimeLockChange
     * @param _newLockPeriod the new lock period, in seconds.
     *
     * Requirements:
     * - Transaction MUST be sent by the wallet.
     * - `_newLockPeriod` MUST be different from the current value.
     * - `_newLockPeriod` MAY be 0, in which case transactions will execute
     *     immediately upon receiving the required number of confirmations.
     */
    function changeLockPeriod(
        uint256 _newLockPeriod
    ) public virtual onlyWallet {
        require(lockPeriod != _newLockPeriod);

        uint256 previous = lockPeriod;
        lockPeriod = _newLockPeriod;
        emit TimelockChange(previous, lockPeriod);
    }

    /**
     * @notice Changes the live account period.
     * @notice emits LiveAccountCheckinChange
     * @param _liveAccountCheckin the new live account checkin period, in seconds.
     *
     * Requirements:
     * - _liveAccountCheckin MUST be sent by the wallet.
     * - `_newLockPeriod` MUST be different from the current value.
     * - `_liveAccountCheckin` MAY be 0, in which case owners are never
     *    considered to be inactive.
     */
    function changeLiveAccountCheckinPeriod(
        uint256 _liveAccountCheckin
    ) public virtual onlyWallet {
        require(liveAccountCheckin != _liveAccountCheckin);

        uint256 previous = liveAccountCheckin;
        liveAccountCheckin = _liveAccountCheckin;
        emit LiveAccountCheckinChange(previous, liveAccountCheckin);
    }

    /**
     * @notice Adds a new owner
     * @notice emits OwnerAddition
     * @param owner the owner address
     *
     * Requirements:
     * - Transaction MUST be sent by the wallet.
     * - `owner` MUST NOT already be an owner.
     * - `owner` MUST NOT be the null address.
     * - The current number of owners MUST be less than `MAX_OWNER_COUNT`.
     */
    function addOwner(
        address owner
    )
        public
        virtual
        onlyWallet
        ownerDoesNotExist(owner)
        notNull(owner)
        validRequirement(owners.length() + 1, required)
    {
        _addOwner(owner);
        emit OwnerAddition(owner);
    }

    function _addOwner(address owner) internal virtual {
        isOwner[owner] = true;
        owners.add(owner);
        lastCheckin[owner] = block.timestamp;
    }

    /**
     * @notice Removes an owner.
     * @notice emits OwnerRemoval
     * @notice If the current number of owners is reduced to below the number
     * of required signatures, `required` will be reduced to match.
     * @param owner the owner to be removed
     *
     * Requirements:
     * - Transaction MUST be sent by the wallet.
     * - `owner` MUST be an existing owner
     * - The current number of owners MUST be greater than 1 (i.e. you can't
     *   remove all the owners).
     */
    function removeOwner(
        address owner
    ) public virtual onlyWallet ownerExists(owner) {
        _removeOwner(owner);

        if (required > owners.length()) changeRequirement(owners.length());
        emit OwnerRemoval(owner);
    }

    function _removeOwner(address owner) internal virtual {
        isOwner[owner] = false;
        owners.remove(owner);
    }

    /**
     * @notice Replaces an owner with a new owner.
     * @notice emits OwnerRemoval and OwnerAddition
     * @param owner Address of owner to be replaced.
     * @param newOwner Address of new owner.
     *
     * Requirements:
     * - Transaction MUST be sent by the wallet.
     * - `owner` MUST be an existing owner
     * - `newOwner` MUST NOT already be an owner.
     * - `newOwner` MUST NOT be the null address.
     */
    function replaceOwner(
        address owner,
        address newOwner
    )
        public
        virtual
        onlyWallet
        ownerExists(owner)
        notNull(newOwner)
        ownerDoesNotExist(newOwner)
    {
        _removeOwner(owner);
        _addOwner(newOwner);

        emit OwnerRemoval(owner);
        emit OwnerAddition(newOwner);
    }

    /**
     * @notice Changes the number of required confirmations.
     * @notice emits RequirementChange
     * @param _required Number of required confirmations.
     *
     * Requirements:
     * - Transaction MUST be sent by the wallet.
     * - `_required` MUST be greater than 0.
     * - `_required` MUST NOT be greater than the number of owners.
     * - `_required` MUST be different from the current value.
     */
    function changeRequirement(
        uint256 _required
    ) public virtual onlyWallet validRequirement(owners.length(), _required) {
        require(required != _required);
        uint256 previous = required;
        required = _required;

        emit RequirementChange(previous, _required);
    }

    /**
     * @notice Allows an owner to submit and confirm a transaction.
     * @notice Also resets the caller's last active time to the current
     *     timestamp.
     * @dev The new transaction id will be equal to the new transaction count.
     * @param description The transaction description.
     * @param destination Transaction target address.
     * @param value Transaction ether value.
     * @param data Transaction data payload.
     * @return transactionId transaction ID.
     *
     * Requirements:
     * - Caller MUST be an owner.
     */
    function submitTransaction(
        bytes32 description,
        address destination,
        uint256 value,
        bytes calldata data
    ) public virtual notNull(destination) returns (uint256 transactionId) {
        transactionId = _addTransaction(description, destination, value, data);
        confirmTransaction(transactionId);
    }

    /**
     * @notice Allows an owner to confirm a transaction.
     * @notice emits Confirmation
     * @notice Also resets the caller's last active time to the current
     *     timestamp.
     * @param transactionId Transaction ID.
     *
     * Requirements:
     * - Caller MUST be an owner.
     * - `transactionId` MUST exist.
     * - Caller MUST NOT have already confirmed the transaction.
     */
    function confirmTransaction(
        uint256 transactionId
    )
        public
        virtual
        onlyOwner
        transactionExists(transactionId)
        notConfirmed(transactionId, msg.sender)
    {
        confirmations[transactionId][msg.sender] = true;
        emit Confirmation(msg.sender, transactionId);
        _confirmationHook(transactionId);
        executeTransaction(transactionId);
    }

    /**
     * @notice Allows an owner to revoke a confirmation for a transaction.
     * @notice emits Revocation
     * @param transactionId Transaction ID.
     * @notice Also resets the caller's last active time to the current
     *     timestamp.
     *
     * Requirements:
     * - Caller MUST be an owner.
     * - `transactionId` MUST exist.
     * - Caller MUST have previously confirmed the transaction.
     * - The transaction MUST NOT have already been successfully executed.
     * - The transaction MUST NOT have been vetoed.
     */
    function revokeConfirmation(
        uint256 transactionId
    )
        public
        virtual
        onlyOwner
        confirmed(transactionId, msg.sender)
        notExecuted(transactionId)
        notVetoed(transactionId)
    {
        confirmations[transactionId][msg.sender] = false;
        emit Revocation(msg.sender, transactionId);
        _revocationHook(transactionId);
    }

    /**
     * @notice Allows an owner to veto a transaction.
     * @notice emits Vetoed
     * @param transactionId Transaction ID.
     * @notice Also resets the caller's last active time to the current
     *     timestamp.
     *
     * Requirements:
     * - Caller MUST be an owner.
     * - `transactionId` MUST exist.
     * - The transaction MUST NOT have already been successfully executed.
     * - The transaction MUST NOT have been vetoed.
     */
    function vetoTransaction(
        uint256 transactionId
    )
        public
        virtual
        onlyOwner
        transactionExists(transactionId)
        notExecuted(transactionId)
        notVetoed(transactionId)
    {
        transactions[transactionId].status = TransactionStatus.VETOED;
        emit Vetoed(msg.sender, transactionId);
    }

    /**
     * @notice Allows an owner to execute a confirmed transaction.
     * @notice performs no-op if transaction is not confirmed.
     * @notice emits Execution if the transaction was successfully executed.
     * @notice emits ExecutionFailure if the transaction was attempted and did
     *     not succeed.
     * @notice Also resets the caller's last active time to the current
     *     timestamp, success or fail.
     * @param transactionId Transaction ID.
     *
     * Requirements:
     * - Caller MUST be an owner.
     * - `transactionId` MUST exist.
     * - `transactionId` MUST exist.
     * - The transaction MUST NOT have already been successfully executed.
     * - The transaction MUST NOT have been vetoed.
     */
    function executeTransaction(
        uint256 transactionId
    )
        public
        virtual
        onlyOwner
        transactionExists(transactionId)
        notExecuted(transactionId)
        notVetoed(transactionId)
    {
        if (isConfirmed(transactionId)) {
            if (lockPeriod == 0) {
                _executeTransaction(transactionId);
            } else if (confirmationTimes[transactionId] == 0) {
                _setConfirmed(transactionId);
            } else if (
                block.timestamp >= confirmationTimes[transactionId] + lockPeriod
            ) {
                _executeTransaction(transactionId);
            } else {
                revert("Too early");
            }
        } else if (confirmationTimes[transactionId] > 0) {
            // Catch cases where a confirmed transaction became unconfirmed
            // due to an increase in the required number of confirmations.
            _setUnconfirmed(transactionId);
        }
    }

    /**
     * @notice Returns the confirmation status of a transaction.
     * @notice Returns `false` if the transaction is vetoed.
     * @param transactionId Transaction ID.
     * @return Confirmation status.
     */
    function isConfirmed(
        uint256 transactionId
    ) public view virtual returns (bool) {
        if (transactions[transactionId].status == TransactionStatus.VETOED) {
            return false;
        }

        uint256 count = 0;
        uint256 inactiveCutoff = 0;
        if (liveAccountCheckin > 0 && liveAccountCheckin < block.timestamp) {
            inactiveCutoff = block.timestamp - liveAccountCheckin;
        }
        for (uint256 i = 0; i < owners.length(); i++) {
            address eachOwner = owners.at(i);
            if (confirmations[transactionId][eachOwner]) {
                count += 1;
            } else if (lastCheckin[eachOwner] < inactiveCutoff) {
                count += 1;
            }
            if (count == required) return true;
        }
        return false;
    }

    /**
     * @notice Returns number of confirmations of a transaction.
     * @param transactionId Transaction ID.
     * @return count number of confirmations.
     */
    function getConfirmationCount(
        uint256 transactionId
    ) public view virtual returns (uint256 count, uint256 inactives) {
        uint256 inactiveCutoff = 0;
        if (liveAccountCheckin > 0 && liveAccountCheckin < block.timestamp) {
            inactiveCutoff = block.timestamp - liveAccountCheckin;
        }

        for (uint256 i = 0; i < owners.length(); i++) {
            address eachOwner = owners.at(i);
            if (confirmations[transactionId][eachOwner]) {
                count += 1;
            } else if (lastCheckin[eachOwner] < inactiveCutoff) {
                inactives += 1;
            }
        }
    }

    /**
     * @notice Returns total number of transactions after filters are applied.
     * @dev use with `getTransactionIds` to page through transactions.
     * @dev Pass TransactionStatus.EVERY_STATUS (0) to count all transactions.
     * @param status Only count transactions with the supplied status.
     * @return count Total number of transactions after filters are applied.
     */
    function getTransactionCount(
        TransactionStatus status
    ) public view virtual returns (uint256 count) {
        for (uint256 i = 1; i <= transactionCount; i++)
            if (
                status == TransactionStatus.EVERY_STATUS ||
                transactions[i].status == status
            ) count += 1;
    }

    /**
     * @notice Returns list of transaction IDs in defined range.
     * @dev use with `getTransactionCount` to page through transactions.
     * @dev Pass TransactionStatus.EVERY_STATUS (0) to return all transactions
     *     in range.
     * @param from Index start position of transaction array (inclusive).
     * @param to Index end position of transaction array (exclusive).
     * @param status Only return transactions with the supplied status.
     * @return _transactionIds array of transaction IDs.
     *
     * Requirements:
     * `to` MUST NOT be less than `from`.
     * `to` - `from` MUST NOT be greater than the number of transactions that
     *     meet the filter criteria.
     */
    function getTransactionIds(
        uint256 from,
        uint256 to,
        TransactionStatus status
    ) public view virtual returns (uint256[] memory _transactionIds) {
        uint256[] memory transactionIdsTemp = new uint256[](transactionCount);
        uint256 count = 0;
        uint256 i;
        uint256 maxResults = to - from;
        for (i = 1; i <= transactionCount && count <= to; i++)
            if (
                status == TransactionStatus.EVERY_STATUS ||
                    transactions[i].status == status
            ) {
                transactionIdsTemp[count] = i;
                count += 1;
            }

        _transactionIds = new uint256[](maxResults);
        for (i = from; i < maxResults+from; i++)
            _transactionIds[i - from] = transactionIdsTemp[i];
    }

    /**
     * @notice Returns list of owners.
     * @return List of owner addresses.
     */
    function getOwners() public view virtual returns (address[] memory) {
        return owners.values();
    }

    /**
     * @notice Returns the number of owners.
     * @dev Use with getOwnerAtIndex() to enumerate.
     */
    function getOwnerCount() public view virtual returns (uint256) {
        return owners.length();
    }

    /**
     * @notice Returns the number of owners.
     * @dev Use with getOwnerCount() to enumerate.
     */
    function getOwnerAtIndex(
        uint256 index
    ) public view virtual returns (address) {
        return owners.at(index);
    }

    /**
     * @notice Returns array with owner addresses, which confirmed transaction.
     * @param transactionId Transaction ID.
     * @return _confirmations array of owner addresses.
     */
    function getConfirmations(
        uint256 transactionId
    ) public view virtual returns (address[] memory _confirmations) {
        address[] memory confirmationsTemp = new address[](owners.length());
        uint256 count = 0;
        uint256 i;
        for (i = 0; i < owners.length(); i++)
            if (confirmations[transactionId][owners.at(i)]) {
                confirmationsTemp[count] = owners.at(i);
                count += 1;
            }
        _confirmations = new address[](count);
        for (i = 0; i < count; i++) _confirmations[i] = confirmationsTemp[i];
    }

    /**
     * @notice Withdraws native crypto.
     * @param toAddress the address to receive the crypto
     * @param amount the amount to withdraw
     *
     * Requirements:
     * - Transaction MUST be sent by the wallet.
     * - `toAddress` MUST NOT be the null address.
     * - `amount` MUST NOT exceed the wallet balance.
     */
    function withdraw(
        address payable toAddress,
        uint256 amount
    ) public virtual onlyWallet {
        _withdraw(toAddress, amount);
    }

    /**
     * @notice Withdraws ERC20 crypto.
     * @param toAddress the address to receive the crypto
     * @param amount the amount to withdraw
     * @param tokenContract the ERC20 contract.
     *
     * Requirements:
     * - Transaction MUST be sent by the wallet.
     * - `toAddress` MUST NOT be the null address.
     * - `amount` MUST NOT exceed the wallet balance.
     */
    function withdrawERC20(
        address payable toAddress,
        uint256 amount,
        IERC20 tokenContract
    ) public virtual onlyWallet {
        _withdrawERC20(toAddress, amount, tokenContract);
    }

    /**
     * @notice Withdraws an ERC721 token.
     * @param toAddress the address to receive the token
     * @param tokenId the token id
     * @param tokenContract the ERC721 contract.
     *
     * Requirements:
     * - Transaction MUST be sent by the wallet.
     * - `toAddress` MUST NOT be the null address.
     * - `amount` MUST NOT exceed the wallet balance.
     */
    function withdrawERC721(
        address payable toAddress,
        uint256 tokenId,
        IERC721 tokenContract
    ) public virtual onlyWallet {
        _withdrawERC721(toAddress, tokenId, tokenContract);
    }

    /**
     * @notice Withdraws ERC777 crypto.
     * @param toAddress the address to receive the crypto
     * @param amount the amount to withdraw
     * @param tokenContract the ERC777 contract.
     *
     * Requirements:
     * - Transaction MUST be sent by the wallet.
     * - `toAddress` MUST NOT be the null address.
     * - `amount` MUST NOT exceed the wallet balance.
     */
    function withdrawERC777(
        address payable toAddress,
        uint256 amount,
        IERC777 tokenContract
    ) public virtual onlyWallet {
        _withdrawERC777(toAddress, amount, tokenContract);
    }

    /**
     * @notice Withdraws ERC1155 tokens.
     * @param toAddress the address to receive the tokens
     * @param tokenId the token id
     * @param amount the amount to withdraw
     * @param tokenContract the ERC1155 contract.
     *
     * Requirements:
     * - Transaction MUST be sent by the wallet.
     * - `toAddress` MUST NOT be the null address.
     * - `amount` MUST NOT exceed the wallet balance.
     */
    function withdrawERC1155(
        address payable toAddress,
        uint256 tokenId,
        uint256 amount,
        IERC1155 tokenContract
    ) public virtual onlyWallet {
        _withdrawERC1155(toAddress, tokenId, amount, tokenContract);
    }

    /**
     * @dev Adds a new transaction to the transaction mapping
     * @param description The transaction description.
     * @param destination Transaction target address.
     * @param value Transaction ether value.
     * @param data Transaction data payload.
     * @return transactionId transaction ID.
     */
    function _addTransaction(
        bytes32 description,
        address destination,
        uint256 value,
        bytes calldata data
    ) internal virtual returns (uint256 transactionId) {
        transactionId = transactionCount + 1;
        transactions[transactionId] = Transaction({
            description: description,
            destination: destination,
            value: value,
            status: TransactionStatus.UNCONFIRMED,
            data: data
        });
        transactionCount += 1;
        emit Submission(transactionId);
    }

    function _executeTransaction(uint256 transactionId) internal virtual {
        Transaction storage txn = transactions[transactionId];
        (bool executed, bytes memory result) = txn.destination.call{
            value: txn.value
        }(txn.data);

        if (executed) {
            txn.status = TransactionStatus.EXECUTED;
            emit Execution(transactionId);
        } else {
            transactions[transactionId].status = TransactionStatus.REVERTED;
            if (result.length < 68) {
                emit ExecutionFailure(transactionId, "No revert reason given");
            } else {
                assembly {
                    result := add(result, 0x04)
                }
                emit ExecutionFailure(
                    transactionId,
                    abi.decode(result, (string))
                );
            }
        }
    }

    /**
     * @notice Sets or clears confimation timers for a pending transaction
     *     that may have become confirmed or unconfirmed due to a change to the
     *     required number of confirmations.
     * @notice This should be called for pending transactions after changing
     *     the required number of confirmations.
     * @notice Also resets the caller's last active time to the current
     *     timestamp.
     * @param transactionId Transaction ID.
     *
     * Requirements:
     * - Caller MUST be an owner.
     * - `transactionId` MUST exist.
     * - The transaction MUST NOT have already been successfully executed.
     * - The transaction MUST NOT have been vetoed.
     */
    function resetConfirmationTimer(
        uint256 transactionId
    )
        public
        virtual
        onlyOwner
        transactionExists(transactionId)
        notExecuted(transactionId)
        notVetoed(transactionId)
    {
        if (isConfirmed(transactionId)) {
            if (confirmationTimes[transactionId] == 0) {
                _setConfirmed(transactionId);
            }
        } else {
            if (confirmationTimes[transactionId] > 0) {
                _setUnconfirmed(transactionId);
            }
        }
    }

    /**
     * @notice Call this function periodically to maintain active status.
     * @notice Resets the caller's last active time to the current timestamp.
     *
     * Requirements
     * - Caller MUST be an owner.
     */
    function ping() public virtual onlyOwner {}

    /**
     * @notice Call this function on behalf of another owner to maintain their
     *     active status.
     * @notice Also resets the caller's last active time to the current
     *     timestamp.
     *
     * Requirements
     * - Caller MUST be an owner.
     * - `owner` MUST be an owner.
     */
    function pingFor(address owner) public virtual onlyOwner {
        enforceOwner(owner);
        _checkin(owner);
    }

    function _checkin(address owner) internal virtual {
        lastCheckin[owner] = block.timestamp;
    }

    function _setConfirmed(uint256 transactionId) internal virtual {
        confirmationTimes[transactionId] = block.timestamp;
        transactions[transactionId].status = TransactionStatus.CONFIRMED;
        emit ConfirmationTimeSet(
            transactionId,
            confirmationTimes[transactionId]
        );
    }

    function _setUnconfirmed(uint256 transactionId) internal virtual {
        confirmationTimes[transactionId] = 0;
        transactions[transactionId].status = TransactionStatus.UNCONFIRMED;
        emit ConfirmationTimeUnset(transactionId);
    }

    function _confirmationHook(uint256 transactionId) internal virtual {}

    /**
     * @dev Clears the countdown timer for a transaction if started and we
     *     do not have the required number of confirmations.
     * @dev emits ConfirmationTimeUnset if the countdown timer was cleared.
     */
    function _revocationHook(uint256 transactionId) internal virtual {
        if (confirmationTimes[transactionId] == 0) return;

        if (!isConfirmed(transactionId)) {
            _setUnconfirmed(transactionId);
        }
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[40] private __gap;
}
