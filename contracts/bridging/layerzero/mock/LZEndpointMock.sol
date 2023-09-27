// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;
pragma abicoder v2;

import "./LZEndpoint.sol";

/*
like a real LayerZero endpoint but can be mocked, which handle message transmission, verification, and receipt.
- blocking: LayerZero provides ordered delivery of messages from a given sender to a destination chain.
- non-reentrancy: endpoint has a non-reentrancy guard for both the send() and receive(), respectively.
- adapter parameters: allows UAs to add arbitrary transaction params in the send() function, like airdrop on destination chain.
unlike a real LayerZero endpoint, it has
- ability to force block a message
*/
contract LZEndpointMock is LZEndpoint {
    bool public nextMsgBlocked;

    constructor(uint16 _chainId) LZEndpoint(_chainId) {
        require(_chainId > 0, "Invalid chainId");
    }

    function _doReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        address _dstAddress,
        uint64 _nonce,
        uint _gasLimit,
        bytes calldata _payload
    ) internal virtual override {
        if (nextMsgBlocked) {
            string memory reason = "BLOCKED";
            _storeMessage(
                _srcChainId,
                _srcAddress,
                _dstAddress,
                _nonce,
                _payload,
                abi.encodeWithSelector(bytes4(0x08c379a0), reason)
            );

            nextMsgBlocked = false;
        } else {
            LZEndpoint._doReceive(
                _srcChainId,
                _srcAddress,
                _dstAddress,
                _nonce,
                _gasLimit,
                _payload
            );
        }
    }

    function blockNextMessage() public {
        nextMsgBlocked = true;
    }
}
