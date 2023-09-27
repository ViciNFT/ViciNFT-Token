// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.17;

interface ILayerZeroTreasury {
    function getFees(
        bool payInZro,
        uint relayerFee,
        uint oracleFee
    ) external view returns (uint);
}
