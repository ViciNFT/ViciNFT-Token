// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../IBridgeable.sol";
import "./LzTokenTunnel.sol";

/**
 * @title Layer Zero Bridgeable Token Tunnel
 * @dev This version of the token tunnel knows how to bridge any token that implements the IBridgeable interface. 
 */
contract LzBridgeableTokenTunnel is LzTokenTunnel {
    function token() public view returns (IBridgeable) {
        return IBridgeable(localAddress);
    }

    function _receiveMessageHook(
        uint16 _srcChainId,
        bytes calldata,
        uint64 nonce,
        bytes calldata _payload
    ) internal virtual override {
        BridgeArgs memory args = abi.decode(_payload[4:], (BridgeArgs));
        emit ReceiveFromChain(
            _srcChainId,
            args.toAddress,
            nonce,
            args.itemId,
            args.amount
        );
    }

    function _doSend(BridgeArgs memory args) internal virtual override {
        token().sentToBridge(args);
    }

    function _encodePayload(
        address caller,
        SendParams calldata params
    ) internal view virtual override returns (bytes memory) {
        return
            abi.encodeWithSelector(
                IBridgeable.receivedFromBridge.selector,
                BridgeArgs(
                    caller,
                    params.fromAddress,
                    params.toAddress,
                    layerZeroChainIdsToNormalChainIds[lzEndpoint.getChainId()],
                    params.itemId,
                    params.amount
                )
            );
    }
}