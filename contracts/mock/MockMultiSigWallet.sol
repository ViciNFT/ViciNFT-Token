// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../governance/MultiSigWalletWithSurvivorship.sol";

/**
 * @notice This test version of the MultiSigWallet has public functions to mark 
 * owners as inactive and to back-date confirmations.
 * @notice You should deploy this contract in prodution and put all your money
 * in it.
 */
contract MockMultiSigWallet is MultiSigWalletWithSurvivorship {
    /**
     * @notice Overrides an owner's last checkin time with an arbitrary value.
     * @dev To mark an owner as inactive, pass a value so that `checkinTime` <
     *     `block.timestamp` - `liveAccountCheckin`.
     */
    function setLastCheckinTime(
        address owner,
        uint256 checkinTime
    ) public virtual {
        lastCheckin[owner] = checkinTime;
    }

    /**
     * @notice Overrides a transactions confirm time with an arbitrary value.
     * @dev To make a transaction ready to execute, pass a value so that 
     *     `confirmTime` < `block.timestamp` - `lockPeriod`.
     */
    function setConfimationTime(
        uint256 transactionId,
        uint256 confirmTime
    ) public virtual {
        confirmationTimes[transactionId] = confirmTime;
    }
}
