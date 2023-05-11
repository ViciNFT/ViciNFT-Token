// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../access/Ownable.sol";
import "../utils/EnumerableUint256Set.sol";
import "./IOwnerOperator.sol";

/**
 * @title Owner Operator
 * @notice (c) 2023 ViciNFT https://vicinft.com/
 * @author Josh Davis <josh.davis@vicinft.com>
 *
 * @dev This contract manages ownership of items, and allows an owner to delegate
 *     other addresses as their agent.
 * @dev Concrete subclasses SHOULD add functionality to support a specific type
 *     of item.
 * @dev It can be used to manage ownership of various types of tokens, such as
 *     ERC20, ERC677, ERC721, ERC777, and ERC1155.
 * @dev For coin-type tokens such as ERC20, ERC677, or ERC721, always pass `1`
 *     as `thing`. Comments that refer to the use of this library to manage
 *     these types of tokens will use the shorthand `COINS:`.
 * @dev For NFT-type tokens such as ERC721, always pass `1` as the `amount`.
 *     Comments that refer to the use of this library to manage these types of
 *     tokens will use the shorthand `NFTS:`.
 * @dev For semi-fungible tokens such as ERC1155, use `thing` as the token ID
 *     and `amount` as the number of tokens with that ID.
 */

abstract contract OwnerOperator is Ownable, IOwnerOperator {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableUint256Set for EnumerableUint256Set.Uint256Set;

    /*
     * For ERC20 / ERC777, there will only be one item
     */
    EnumerableUint256Set.Uint256Set allItems;

    EnumerableSet.AddressSet allOwners;

    /*
     * amount of each item
     * mapping(itemId => amount)
     * for ERC721, amount will be 1 or 0
     * for ERC20 / ERC777, there will only be one key
     */
    mapping(uint256 => uint256) amountOfItem;

    /*
     * which items are owned by which owners?
     * for ERC20 / ERC777, the result will have 0 or 1 elements
     */
    mapping(address => EnumerableUint256Set.Uint256Set) itemIdsByOwner;

    /*
     * which owners hold which items?
     * For ERC20 / ERC777, there will only be 1 key
     * For ERC721, result will have 0 or 1 elements
     */
    mapping(uint256 => EnumerableSet.AddressSet) ownersByItemIds;

    /*
     * for a given item id, what is the address's balance?
     * mapping(itemId => mapping(owner => amount))
     * for ERC20 / ERC777, there will only be 1 key
     * for ERC721, result is 1 or 0
     */
    mapping(uint256 => mapping(address => uint256)) balances;
    mapping(address => mapping(uint256 => address)) itemApprovals;

    /*
     * for a given owner, how much of each item id is an operator allowed to control?
     */
    mapping(address => mapping(uint256 => mapping(address => uint256))) allowances;
    mapping(address => mapping(address => bool)) operatorApprovals;

    /* ################################################################
     * Initialization
     * ##############################################################*/

    function __OwnerOperator_init() internal onlyInitializing {
        __Ownable_init();
        __OwnerOperator_init_unchained();
    }

    function __OwnerOperator_init_unchained() internal onlyInitializing {}

    /**
     * @dev revert if the item does not exist
     */
    modifier itemExists(uint256 thing) {
        require(exists(thing), "invalid item");
        _;
    }

    /**
     * @dev revert if the user is the null address
     */
    modifier validUser(address user) {
        require(user != address(0), "invalid user");
        _;
    }

    /**
     * @dev revert if the item does not exist
     */
    function enforceItemExists(uint256 thing)
        public
        view
        virtual
        override
        itemExists(thing)
    {}

    /* ################################################################
     * Queries
     * ##############################################################*/

    /**
     * @dev Returns whether `thing` exists. Things are created by transferring
     *     from the null address, and things are destroyed by tranferring to
     *     the null address.
     * @dev COINS: returns whether any have been minted and are not all burned.
     *
     * @param thing identifies the thing.
     *
     * Requirements:
     * - COINS: `thing` SHOULD be 1.
     */
    function exists(uint256 thing) public view virtual override returns (bool) {
        return amountOfItem[thing] > 0;
    }

    /**
     * @dev Returns the number of distict owners.
     * @dev use with `ownerAtIndex()` to iterate.
     */
    function ownerCount() public view virtual override returns (uint256) {
        return allOwners.length();
    }

    /**
     * @dev Returns the address of the owner at the index.
     * @dev use with `ownerCount()` to iterate.
     *
     * @param index the index into the list of owners
     *
     * Requirements
     * - `index` MUST be less than the number of owners.
     */
    function ownerAtIndex(uint256 index)
        public
        view
        virtual
        override
        returns (address)
    {
        require(allOwners.length() > index, "owner index out of bounds");
        return allOwners.at(index);
    }

    /**
     * @dev Returns the number of distict items.
     * @dev use with `itemAtIndex()` to iterate.
     * @dev COINS: returns 1 or 0 depending on whether any tokens exist.
     */
    function itemCount() public view virtual override returns (uint256) {
        return allItems.length();
    }

    /**
     * @dev Returns the ID of the item at the index.
     * @dev use with `itemCount()` to iterate.
     * @dev COINS: don't use this function. The ID is always 1.
     *
     * @param index the index into the list of items
     *
     * Requirements
     * - `index` MUST be less than the number of items.
     */
    function itemAtIndex(uint256 index)
        public
        view
        virtual
        override
        returns (uint256)
    {
        require(allItems.length() > index, "item index out of bounds");
        return allItems.at(index);
    }

    /**
     * @dev for a given item, returns the number that exist.
     * @dev NFTS: don't use this function. It returns 1 or 0 depending on
     *     whether the item exists. Use `exists()` instead.
     */
    function itemSupply(uint256 thing)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return amountOfItem[thing];
    }

    /**
     * @dev Returns how much of an item is held by an address.
     * @dev NFTS: Returns 0 or 1 depending on whether the address owns the item.
     *
     * @param owner the owner
     * @param thing identifies the item.
     *
     * Requirements:
     * - `owner` MUST NOT be the null address.
     * - `thing` MUST exist.
     */
    function getBalance(address owner, uint256 thing)
        public
        view
        virtual
        override
        validUser(owner)
        returns (uint256)
    {
        return balances[thing][owner];
    }

    /**
     * @dev Returns the list of distinct items held by an address.
     * @dev COINS: Don't use this function.
     *
     * @param user the user
     *
     * Requirements:
     * - `owner` MUST NOT be the null address.
     */
    function userWallet(address user)
        public
        view
        virtual
        override
        validUser(user)
        returns (uint256[] memory)
    {
        return itemIdsByOwner[user].asList();
    }

    /**
     * @dev For a given address, returns the number of distinct items.
     * @dev Returns 0 if the address doesn't own anything here.
     * @dev use with `itemOfOwnerByIndex()` to iterate.
     * @dev COINS: don't use this function. It returns 1 or 0 depending on
     *     whether the address has a balance. Use `balance()` instead.
     *
     * Requirements:
     * - `owner` MUST NOT be the null address.
     * - `thing` MUST exist.
     */
    function ownerItemCount(address owner)
        public
        view
        virtual
        override
        validUser(owner)
        returns (uint256)
    {
        return itemIdsByOwner[owner].length();
    }

    /**
     * @dev For a given address, returns the id of the item at the index.
     * @dev COINS: don't use this function.
     *
     * @param owner the owner.
     * @param index the index in the list of items.
     *
     * Requirements:
     * - `owner` MUST NOT be the null address.
     * - `index` MUST be less than the number of items.
     */
    function itemOfOwnerByIndex(address owner, uint256 index)
        public
        view
        virtual
        override
        validUser(owner)
        returns (uint256)
    {
        require(
            itemIdsByOwner[owner].length() > index,
            "item index out of bounds"
        );
        return itemIdsByOwner[owner].at(index);
    }

    /**
     * @dev For a given item, returns the number of owners.
     * @dev use with `ownerOfItemAtIndex()` to iterate.
     * @dev COINS: don't use this function. Use `ownerCount()` instead.
     * @dev NFTS: don't use this function. If `thing` exists, the answer is 1.
     *
     * Requirements:
     * - `thing` MUST exist.
     */
    function itemOwnerCount(uint256 thing)
        public
        view
        virtual
        override
        itemExists(thing)
        returns (uint256)
    {
        return ownersByItemIds[thing].length();
    }

    /**
     * @dev For a given item, returns the owner at the index.
     * @dev use with `itemOwnerCount()` to iterate.
     * @dev COINS: don't use this function. Use `ownerAtIndex()` instead.
     * @dev NFTS: Returns the owner.
     *
     * @param thing identifies the item.
     * @param index the index in the list of owners.
     *
     * Requirements:
     * - `thing` MUST exist.
     * - `index` MUST be less than the number of owners.
     * - NFTS: `index` MUST be 0.
     */
    function ownerOfItemAtIndex(uint256 thing, uint256 index)
        public
        view
        virtual
        override
        itemExists(thing)
        returns (address owner)
    {
        require(
            ownersByItemIds[thing].length() > index,
            "owner index out of bounds"
        );
        return ownersByItemIds[thing].at(index);
    }

    /* ################################################################
     * Minting / Burning / Transferring
     * ##############################################################*/

    /**
     * @dev transfers an amount of thing from one address to another.
     * @dev if `fromAddress` is the null address, `amount` of `thing` is
     *     created.
     * @dev if `toAddress` is the null address, `amount` of `thing` is
     *     destroyed.
     *
     * @param operator the operator
     * @param fromAddress the current owner
     * @param toAddress the current owner
     * @param thing identifies the item.
     * @param amount the amount
     *
     * Requirements:
     * - NFTS: `amount` SHOULD be 1
     * - COINS: `thing` SHOULD be 1
     * - `fromAddress` and `toAddress` MUST NOT both be the null address
     * - `amount` MUST be greater than 0
     * - if `fromAddress` is not the null address
     *   - `amount` MUST NOT be greater than the current owner's balance
     *   - `operator` MUST be approved
     */
    function doTransfer(
        address operator,
        address fromAddress,
        address toAddress,
        uint256 thing,
        uint256 amount
    ) public virtual override onlyOwner {
        // can't mint and burn in same transaction
        require(
            fromAddress != address(0) || toAddress != address(0),
            "invalid transfer"
        );

        // can't transfer nothing
        require(amount > 0, "invalid transfer");

        if (fromAddress == address(0)) {
            // minting
            allItems.add(thing);
            amountOfItem[thing] += amount;
        } else {
            enforceItemExists(thing);
            if (operator != fromAddress) {
                require(
                    _checkApproval(operator, fromAddress, thing, amount),
                    "not authorized"
                );
                if (allowances[fromAddress][thing][operator] > 0) {
                    allowances[fromAddress][thing][operator] -= amount;
                }
            }
            require(
                balances[thing][fromAddress] >= amount,
                "insufficient balance"
            );

            itemApprovals[fromAddress][thing] = address(0);

            if (fromAddress == toAddress) return;

            balances[thing][fromAddress] -= amount;
            if (balances[thing][fromAddress] == 0) {
                allOwners.remove(fromAddress);
                ownersByItemIds[thing].remove(fromAddress);
                itemIdsByOwner[fromAddress].remove(thing);
                if (itemIdsByOwner[fromAddress].length() == 0) {
                    delete itemIdsByOwner[fromAddress];
                }
            }
        }

        if (toAddress == address(0)) {
            // burning
            amountOfItem[thing] -= amount;
            if (amountOfItem[thing] == 0) {
                allItems.remove(thing);
                delete ownersByItemIds[thing];
            }
        } else {
            allOwners.add(toAddress);
            itemIdsByOwner[toAddress].add(thing);
            ownersByItemIds[thing].add(toAddress);
            balances[thing][toAddress] += amount;
        }
    }

    /* ################################################################
     * Allowances / Approvals
     * ##############################################################*/

    /**
     * @dev Reverts if `operator` is allowed to transfer `amount` of `thing` on
     *     behalf of `fromAddress`.
     * @dev Reverts if `fromAddress` is not an owner of at least `amount` of
     *     `thing`.
     *
     * @param operator the operator
     * @param fromAddress the owner
     * @param thing identifies the item.
     * @param amount the amount
     *
     * Requirements:
     * - NFTS: `amount` SHOULD be 1
     * - COINS: `thing` SHOULD be 1
     */
    function enforceAccess(
        address operator,
        address fromAddress,
        uint256 thing,
        uint256 amount
    ) public view virtual override {
        require(
            balances[thing][fromAddress] >= amount &&
                _checkApproval(operator, fromAddress, thing, amount),
            "not authorized"
        );
    }

    /**
     * @dev Returns whether `operator` is allowed to transfer `amount` of
     *     `thing` on behalf of `fromAddress`.
     *
     * @param operator the operator
     * @param fromAddress the owner
     * @param thing identifies the item.
     * @param amount the amount
     *
     * Requirements:
     * - NFTS: `amount` SHOULD be 1
     * - COINS: `thing` SHOULD be 1
     */
    function isApproved(
        address operator,
        address fromAddress,
        uint256 thing,
        uint256 amount
    ) public view virtual override returns (bool) {
        return _checkApproval(operator, fromAddress, thing, amount);
    }

    /**
     * @dev Returns whether an operator is approved for all items belonging to
     *     an owner.
     *
     * @param fromAddress the owner
     * @param operator the operator
     */
    function isApprovedForAll(address fromAddress, address operator)
        public
        view
        virtual
        override
        returns (bool)
    {
        return operatorApprovals[fromAddress][operator];
    }

    /**
     * @dev Toggles whether an operator is approved for all items belonging to
     *     an owner.
     *
     * @param fromAddress the owner
     * @param operator the operator
     * @param approved the new approval status
     *
     * Requirements:
     * - `fromUser` MUST NOT be the null address
     * - `operator` MUST NOT be the null address
     * - `operator` MUST NOT be the `fromUser`
     */
    function setApprovalForAll(
        address fromAddress,
        address operator,
        bool approved
    ) public override onlyOwner validUser(fromAddress) validUser(operator) {
        require(operator != fromAddress, "approval to self");
        operatorApprovals[fromAddress][operator] = approved;
    }

    /**
     * @dev returns the approved allowance for an operator.
     * @dev NFTS: Don't use this function. Use `getApprovedForItem()`
     *
     * @param fromAddress the owner
     * @param operator the operator
     * @param thing identifies the item.
     *
     * Requirements:
     * - COINS: `thing` SHOULD be 1
     */
    function allowance(
        address fromAddress,
        address operator,
        uint256 thing
    ) public view virtual override returns (uint256) {
        return allowances[fromAddress][thing][operator];
    }

    /**
     * @dev sets the approval amount for an operator.
     * @dev NFTS: Don't use this function. Use `approveForItem()`
     *
     * @param fromAddress the owner
     * @param operator the operator
     * @param thing identifies the item.
     * @param amount the allowance amount.
     *
     * Requirements:
     * - COINS: `thing` SHOULD be 1
     * - `fromUser` MUST NOT be the null address
     * - `operator` MUST NOT be the null address
     * - `operator` MUST NOT be the `fromUser`
     */
    function approve(
        address fromAddress,
        address operator,
        uint256 thing,
        uint256 amount
    )
        public
        virtual
        override
        onlyOwner
        validUser(fromAddress)
        validUser(operator)
    {
        require(operator != fromAddress, "approval to self");
        allowances[fromAddress][thing][operator] = amount;
    }

    /**
     * @dev Returns the address of the operator who is approved for an item.
     * @dev Returns the null address if there is no approved operator.
     * @dev COINS: Don't use this function.
     *
     * @param fromAddress the owner
     * @param thing identifies the item.
     *
     * Requirements:
     * - `thing` MUST exist
     */
    function getApprovedForItem(address fromAddress, uint256 thing)
        public
        view
        virtual
        override
        returns (address)
    {
        require(amountOfItem[thing] > 0);
        return itemApprovals[fromAddress][thing];
    }

    /**
     * @dev Approves `operator` to transfer `thing` to another account.
     * @dev COINS: Don't use this function. Use `setApprovalForAll()` or
     *     `approve()`
     *
     * @param fromAddress the owner
     * @param operator the operator
     * @param thing identifies the item.
     *
     * Requirements:
     * - `fromUser` MUST NOT be the null address
     * - `operator` MAY be the null address
     * - `operator` MUST NOT be the `fromUser`
     * - `fromUser` MUST be an owner of `thing`
     */
    function approveForItem(
        address fromAddress,
        address operator,
        uint256 thing
    ) public virtual override onlyOwner validUser(fromAddress) {
        require(operator != fromAddress, "approval to self");
        require(ownersByItemIds[thing].contains(fromAddress));
        itemApprovals[fromAddress][thing] = operator;
    }

    function _checkApproval(
        address operator,
        address fromAddress,
        uint256 thing,
        uint256 amount
    ) internal view virtual returns (bool) {
        return (operator == fromAddress ||
            operatorApprovals[fromAddress][operator] ||
            itemApprovals[fromAddress][thing] == operator ||
            allowances[fromAddress][thing][operator] >= amount);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[41] private __gap;
}
