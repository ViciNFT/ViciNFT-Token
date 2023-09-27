// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../IBridgeable.sol";
import "./core/LzTunnel.sol";

/**
 * @title LayerZero Token Tunnel
 * @dev abstract superclass for cross-chain token transfers
 * @dev subclasses need to know what to do 
 * - On the sending side when tokens are sent
 * - On the receiving side when tokens are received
 */
abstract contract LzTokenTunnel is LzTunnel {
    /**
     * @dev Emitted when `amount` tokens are moved from the `sender` to (`dstChainId`, `toAddress`)
     * `nonce` is the outbound nonce
     */
    event SendToChain(
        uint16 indexed dstChainId,
        address indexed from,
        uint64 indexed nonce,
        address toAddress,
        uint256 tokenId,
        uint256 amount
    );

    /**
     * @dev Emitted when `amount` tokens are received from `srcChainId` into the `toAddress` on the local chain.
     * `nonce` is the inbound nonce.
     */
    event ReceiveFromChain(
        uint16 indexed srcChainId,
        address indexed to,
        uint64 indexed nonce,
        uint256 tokenId,
        uint256 amount
    );

    uint256 internal constant NO_EXTRA_GAS = 0;

    // packet type
    uint16 internal constant PT_SEND = 0;

    uint256 internal constant MIN_GAS_LIMIT = 450000;

    function initialize(
        IAccessServer _accessServer,
        address _endpoint,
        address _localAddress
    ) public initializer {
        __LzApp_init(_accessServer, _endpoint, _localAddress, MIN_GAS_LIMIT);
    }

    /**
     * @notice estimate the bridge fee required to send the tokens
     * @param params.fromAddress the owner of the tokens that were sent
     * @param params.toAddress the destination address on the other chain
     * @param params.dstChainId the chain id for the destination
     * @param params.itemId the token id for ERC721 or ERC1155 tokens. Ignored for ERC20 tokens.
     * @param params.amount the amount of tokens sent for ERC20 and ERC1155 tokens. Ignored for ERC721 tokens.
     * @param _useZro LayerZero future parameter -- send false
     * @param _adapterParams Empty bytes is default settings
     */
    function estimateSendFee(
        SendParams calldata params,
        bool _useZro,
        bytes memory _adapterParams
    ) public view virtual returns (uint nativeFee, uint zroFee) {
        // mock the payload for sendFrom()
        bytes memory payload = _encodePayload(_msgSender(), params);

        if (_adapterParams.length == 0) {
            _adapterParams = defaultAdapterParams;
        }

        return
            lzEndpoint.estimateFees(
                normalChainIdsToLayerZeroChainIds[params.dstChainId],
                address(this),
                payload,
                _useZro,
                _adapterParams
            );
    }

    /**
     * @notice Sends tokens from `fromAddress` on this chain to `toAddress` on `dstChainId`.
     * @dev emits SendToChain
     * @param params.fromAddress the owner of the tokens that were sent
     * @param params.toAddress the destination address on the other chain
     * @param params.dstChainId the chain id for the destination
     * @param params.itemId the token id for ERC721 or ERC1155 tokens. Ignored for ERC20 tokens.
     * @param params.amount the amount of tokens sent for ERC20 and ERC1155 tokens. Ignored for ERC721 tokens.
     * @param _refundAddress where to send the refund if the fee paid is too high
     * @param _zroPaymentAddress LayerZero future parameter
     * @param _adapterParams Empty bytes is default settings
     */
    function sendFrom(
        SendParams calldata params,
        address payable _refundAddress,
        address _zroPaymentAddress,
        bytes memory _adapterParams
    )
        public
        payable
        virtual
        noBannedAccounts
        notBanned(params.fromAddress)
        notBanned(params.toAddress)
    {
        uint16 lzChainId = normalChainIdsToLayerZeroChainIds[params.dstChainId];
        require(lzChainId > 0, "invalid chain id");

        if (_adapterParams.length > 0) {
            _checkGasLimit(_adapterParams, NO_EXTRA_GAS);
        } else {
            _adapterParams = defaultAdapterParams;
        }

        bytes memory payload = _encodePayload(_msgSender(), params);

        _lzSend(
            lzChainId,
            payload,
            _refundAddress,
            _zroPaymentAddress,
            _adapterParams,
            msg.value
        );

        _doSend(
            BridgeArgs(
                _msgSender(),
                params.fromAddress,
                params.toAddress,
                params.dstChainId,
                params.itemId,
                params.amount
            )
        );

        emit SendToChain(
            lzChainId,
            params.fromAddress,
            lzEndpoint.getOutboundNonce(lzChainId, address(this)),
            params.toAddress,
            params.itemId,
            params.amount
        );
    }

    /**
     * Decrement balances, burn, move to vault, etc.
     */
    function _doSend(BridgeArgs memory args) internal virtual;

    /**
     * Payload tells receiving token to increment balances, mint, move from vault, etc.
     */
    function _encodePayload(
        address caller,
        SendParams calldata params
    ) internal view virtual returns (bytes memory);

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint[49] private __gap;
}
