// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../../../token/ERC20/ERC20Operations.sol";

contract MockERC20OpsForUpgrade is ERC20Operations {
    using EnumerableUint256Set for EnumerableUint256Set.Uint256Set;
    using EnumerableSet for EnumerableSet.AddressSet;

    function freeMint(address account, uint256 amount) public {
        require(amount < 10**27, "Don't be greedy");

        _doTransfer(
            owner(),
            address(0),
            account,
            1,
            amount
        );
        emit Transfer(address(0), account, amount);
    }

    function _doTransfer(
        address operator,
        address fromAddress,
        address toAddress,
        uint256 thing,
        uint256 amount
    ) internal {
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
}
