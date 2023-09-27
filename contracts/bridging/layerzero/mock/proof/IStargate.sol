// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.17;
pragma abicoder v2;

interface IStargate {
    // Stargate objects for abi encoding / decoding
    struct SwapObj {
        uint amount;
        uint eqFee;
        uint eqReward;
        uint lpFee;
        uint protocolFee;
        uint lkbRemove;
    }

    struct CreditObj {
        uint credits;
        uint idealBalance;
    }
}