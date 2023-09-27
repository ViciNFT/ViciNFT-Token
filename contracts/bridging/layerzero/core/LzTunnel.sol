// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/Strings.sol";

import "../interfaces/ILayerZeroEndpoint.sol";
import "../interfaces/ILayerZeroReceiver.sol";
import "../interfaces/ILayerZeroUserApplicationConfig.sol";
import "../lib/BytesLib.sol";
import "../lib/ExcessivelySafeCall.sol";
import "../lib/LzLib.sol";

import "../../../access/ViciAccess.sol";
import "../../../utils/AddressUtils.sol";

/**
 * @title LayerZero Tunnel
 * @dev Abstract superclass contracts that perform LayerZero integration on behalf of cross-chain contracts
 * @dev The LAYERZERO_ADMIN_ROLE allows an account to configure and reconfigure the LayerZero endpoint connection
 * @dev Subclasses SHOULD provide a public send function that formats a payload in a way that the receiving contract will understand
 *
 * Cross-chain contracts don't extend from this contract. A domain specific subclass of this contract is deployed independently
 * and notifies the cross-chain contract when messages are sent and received. The cross-chain contract SHOULD restrict
 * access to the notification functions so that they me only be called by an authorized bridge adapter class.
 *
 * Other differences from LayerZero's sample code include
 * ----------------------------------------------------------------------
 * - Collapsed the LzApp <-- NonblockingLzApp hierarchy. This version can only be run in non-blocking mode
 * - Made the following modifications to the receive function:
 *   - Use the `excessivelySafeCall` to call the payload function on the client contract instead of on this contract
 * - Added role-based access management and the LAYERZERO_ADMIN_ROLE.
 * - Added mappings for LayerZero's special weird chain ids to real chain ids that everyone else uses
 * - Removed public `precrime` attribute, `SetPrecrime` event, and `setPrecrime` function.
 *    I didn't understand what they were for, they aren't used anywhere, and there's no
 *    documentation for any of it.
 */
abstract contract LzTunnel is
    ViciAccess,
    ILayerZeroUserApplicationConfig,
    ILayerZeroReceiver
{
    using BytesLib for bytes;
    using ExcessivelySafeCall for address;

    // ua can not send payload larger than this by default, but it can be changed by the ua owner
    uint256 public constant DEFAULT_PAYLOAD_SIZE_LIMIT = 10000;
    bytes32 public constant LAYERZERO_ADMIN_ROLE =
        keccak256("LAYERZERO_ADMIN_ROLE");

    ILayerZeroEndpoint public lzEndpoint;
    address public localAddress;

    uint256 minGas;
    bytes public defaultAdapterParams;

    mapping(uint16 => bytes) public trustedRemoteLookup;
    mapping(uint16 => uint256) public payloadSizeLimitLookup;
    mapping(uint16 => mapping(bytes => mapping(uint64 => bytes32)))
        public failedMessages;

    mapping(uint16 => uint256) public layerZeroChainIdsToNormalChainIds;
    mapping(uint256 => uint16) public normalChainIdsToLayerZeroChainIds;

    event SetTrustedRemote(uint16 remoteChainId, bytes path);
    event SetTrustedRemoteAddress(uint16 remoteChainId, bytes remoteAddress);
    event SetMinDstGas(uint256 minDstGas);
    event MessageFailed(
        uint16 srcChainId,
        bytes srcAddress,
        uint64 nonce,
        bytes payload,
        bytes reason
    );
    event RetryMessageSuccess(
        uint16 srcChainId,
        bytes srcAddress,
        uint64 nonce,
        bytes32 payloadHash
    );

    /**
     * @param _accessServer The access server contract, for role administration
     * @param _endpoint The LayerZero endpoint
     * @param _localAddress The address of the client contract
     * @param _minGas The minimum value for the gas limit
     */
    function __LzApp_init(
        IAccessServer _accessServer,
        address _endpoint,
        address _localAddress,
        uint256 _minGas
    ) internal virtual onlyInitializing {
        __ViciAccess_init(_accessServer);
        __LzApp_init_unchained(_endpoint, _localAddress, _minGas);
    }

    function __LzApp_init_unchained(
        address _endpoint,
        address _localAddress,
        uint256 _minGas
    ) internal virtual onlyInitializing {
        lzEndpoint = ILayerZeroEndpoint(_endpoint);
        localAddress = _localAddress;
        minGas = _minGas;
        defaultAdapterParams = LzLib.buildDefaultAdapterParams(minGas);
    }

    /**
     * @notice This function may only be called by the LayerZero endpoint.
     * @notice Emits MessageFailed if calling the client contract with `_payload` reverts.
     * @param _srcChainId The special weird LayerZero chain id referring to the source chain
     * @param _srcAddress A length-40 bytes object, first 20 bytes is the address of the LzTunnel on the source 
     *       chain, second 20 bytes is this contract's address
     * @param _nonce The inbound nonce from our endpoint
     * @param _payload The ABI-encoded function call to be called on our client contract
     *
     * Requirements:
     * - caller MUST be our endpoint
     * - the first 20 bytes of `_srcAddress` MUST be registered as our trusted remote on the source chain
     * - the second 20 bytes of `_srcAddress` MUST be this contract's address
     */
    function lzReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        uint64 _nonce,
        bytes calldata _payload
    ) public virtual override {
        // lzReceive must be called by the endpoint for security
        require(
            _msgSender() == address(lzEndpoint),
            "LzApp: invalid endpoint caller"
        );

        bytes memory trustedRemote = trustedRemoteLookup[_srcChainId];

        // if will still block the message pathway from (srcChainId, srcAddress). should not receive message from untrusted remote.
        require(
            _srcAddress.length == trustedRemote.length &&
                trustedRemote.length > 0 &&
                keccak256(_srcAddress) == keccak256(trustedRemote),
            "LzApp: invalid source sending contract"
        );

        _receiveMessage(_srcChainId, _srcAddress, _nonce, _payload);
    }

    function _receiveMessage(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        uint64 _nonce,
        bytes calldata _payload
    ) internal virtual {
        (bool success, bytes memory reason) = localAddress.excessivelySafeCall(
            gasleft(),
            150,
            _payload
        );

        if (success) {
            _receiveMessageHook(_srcChainId, _srcAddress, _nonce, _payload);
        } else {
            _storeFailedMessage(
                _srcChainId,
                _srcAddress,
                _nonce,
                _payload,
                reason
            );
        }
    }

    /**
     * @dev Subclasses may implement this to do any additional operations when
     *      a valid message has been successfully received.
     */
    function _receiveMessageHook(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        uint64 _nonce,
        bytes calldata _payload
    ) internal virtual {}

    /**
     * @notice Retries a failed message.
     * @notice The parameters needed to call this function are all in the MessageFailed event
     */
    function retryMessage(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        uint64 _nonce,
        bytes calldata _payload
    ) public virtual {
        // assert there is message to retry
        bytes32 payloadHash = failedMessages[_srcChainId][_srcAddress][_nonce];
        require(payloadHash != bytes32(0), "LzApp: no stored message");
        require(keccak256(_payload) == payloadHash, "LzApp: invalid payload");

        // clear the stored message
        failedMessages[_srcChainId][_srcAddress][_nonce] = bytes32(0);

        // execute the message. revert if it fails again
        (bool success, bytes memory reason) = localAddress.excessivelySafeCall(
            gasleft(),
            150,
            _payload
        );

        AddressUtils.verifyCallResult(
            success,
            reason,
            "LzApp: Retry failed, no reason given"
        );

        _receiveMessageHook(_srcChainId, _srcAddress, _nonce, _payload);
        emit RetryMessageSuccess(_srcChainId, _srcAddress, _nonce, payloadHash);
    }

    function _storeFailedMessage(
        uint16 _srcChainId,
        bytes memory _srcAddress,
        uint64 _nonce,
        bytes calldata _payload,
        bytes memory _reason
    ) internal virtual {
        failedMessages[_srcChainId][_srcAddress][_nonce] = keccak256(_payload);
        emit MessageFailed(_srcChainId, _srcAddress, _nonce, _payload, _reason);
    }

    /**
     * @dev Subclasses should call this after constructing `_payload`
     * @param _dstChainId The special weird LayerZero chain id referring to the destination chain
     * @param _payload The ABI-encoded function call to be called on the destination tunnel's client contract
     * @param _refundAddress The address where any overpayment of fees should be sent
     * @param _zroPaymentAddress Future parameter. Pass 0x0000000000000000000000000000000000000000
     * @param _adapterParams Normally pass 0x.
     * @param _nativeFee The fee to be paid. Call estimate fees to get this value.
     *
     * Requirements:
     * - A trusted remote MUST be configured for `_dstChainId`. See `setTrustedRemote` and `setTrustedRemoteAddress`.
     */
    function _lzSend(
        uint16 _dstChainId,
        bytes memory _payload,
        address payable _refundAddress,
        address _zroPaymentAddress,
        bytes memory _adapterParams,
        uint256 _nativeFee
    ) internal virtual {
        bytes memory trustedRemote = trustedRemoteLookup[_dstChainId];
        require(
            trustedRemote.length != 0,
            "LzApp: destination chain is not a trusted source"
        );
        _checkPayloadSize(_dstChainId, _payload.length);
        lzEndpoint.send{value: _nativeFee}(
            _dstChainId,
            trustedRemote,
            _payload,
            _refundAddress,
            _zroPaymentAddress,
            _adapterParams
        );
    }

    function _checkGasLimit(
        bytes memory _adapterParams,
        uint256 _extraGas
    ) internal view virtual {
        uint256 providedGasLimit = _getGasLimit(_adapterParams);
        require(
            providedGasLimit >= minGas + _extraGas,
            "LzApp: gas limit is too low"
        );
    }

    function _getGasLimit(
        bytes memory _adapterParams
    ) internal pure virtual returns (uint256 gasLimit) {
        require(_adapterParams.length >= 34, "LzApp: invalid adapterParams");
        assembly {
            gasLimit := mload(add(_adapterParams, 34))
        }
    }

    function _checkPayloadSize(
        uint16 _dstChainId,
        uint256 _payloadSize
    ) internal view virtual {
        uint256 payloadSizeLimit = payloadSizeLimitLookup[_dstChainId];
        if (payloadSizeLimit == 0) {
            // use default if not set
            payloadSizeLimit = DEFAULT_PAYLOAD_SIZE_LIMIT;
        }
        require(
            _payloadSize <= payloadSizeLimit,
            "LzApp: payload size is too large"
        );
    }

    //---------------------------UserApplication config----------------------------------------

    /**
     *
     */
    function getConfig(
        uint16 _version,
        uint16 _chainId,
        address,
        uint256 _configType
    ) external view returns (bytes memory) {
        return
            lzEndpoint.getConfig(
                _version,
                _chainId,
                address(this),
                _configType
            );
    }

    /**
     * @dev generic config for LayerZero user Application
     * @dev See {ILayerZeroUserApplicationConfig-setConfig}.
     * @inheritdoc ILayerZeroUserApplicationConfig
     */
    function setConfig(
        uint16 _version,
        uint16 _chainId,
        uint256 _configType,
        bytes calldata _config
    ) external override onlyOwnerOrRole(LAYERZERO_ADMIN_ROLE) {
        lzEndpoint.setConfig(_version, _chainId, _configType, _config);
    }

    /**
     * @dev See {ILayerZeroUserApplicationConfig-setSendVersion}.
     * @inheritdoc ILayerZeroUserApplicationConfig
     */
    function setSendVersion(
        uint16 _version
    ) external override onlyOwnerOrRole(LAYERZERO_ADMIN_ROLE) {
        lzEndpoint.setSendVersion(_version);
    }

    /**
     * @dev See {ILayerZeroUserApplicationConfig-setReceiveVersion}.
     * @inheritdoc ILayerZeroUserApplicationConfig
     */
    function setReceiveVersion(
        uint16 _version
    ) external override onlyOwnerOrRole(LAYERZERO_ADMIN_ROLE) {
        lzEndpoint.setReceiveVersion(_version);
    }

    /**
     * @dev See {ILayerZeroUserApplicationConfig-forceResumeReceive}.
     * @inheritdoc ILayerZeroUserApplicationConfig
     */
    function forceResumeReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress
    ) external override onlyOwnerOrRole(LAYERZERO_ADMIN_ROLE) {
        lzEndpoint.forceResumeReceive(_srcChainId, _srcAddress);
    }

    /**
     * @dev Set the trusted path for the cross-chain communication
     * @param _path = abi.encodePacked(remoteAddress, localAddress)
     */
    function setTrustedRemote(
        uint16 _remoteChainId,
        bytes calldata _path
    ) external onlyOwnerOrRole(LAYERZERO_ADMIN_ROLE) {
        trustedRemoteLookup[_remoteChainId] = _path;
        emit SetTrustedRemote(_remoteChainId, _path);
    }

    function setTrustedRemoteAddress(
        uint16 _remoteChainId,
        bytes calldata _remoteAddress
    ) external onlyOwnerOrRole(LAYERZERO_ADMIN_ROLE) {
        trustedRemoteLookup[_remoteChainId] = abi.encodePacked(
            _remoteAddress,
            address(this)
        );
        emit SetTrustedRemoteAddress(_remoteChainId, _remoteAddress);
    }

    function getTrustedRemoteAddress(
        uint16 _remoteChainId
    ) external view returns (bytes memory) {
        bytes memory path = trustedRemoteLookup[_remoteChainId];
        require(path.length != 0, "LzApp: no trusted path record");
        return path.slice(0, path.length - 20); // the last 20 bytes should be address(this)
    }

    function setMinDstGas(
        uint256 _minGas
    ) external onlyOwnerOrRole(LAYERZERO_ADMIN_ROLE) {
        require(_minGas > 0, "LzApp: invalid minGas");
        minGas = _minGas;
        defaultAdapterParams = LzLib.buildDefaultAdapterParams(minGas);
        emit SetMinDstGas(_minGas);
    }

    // if the size is 0, it means default size limit
    function setPayloadSizeLimit(
        uint16 _dstChainId,
        uint256 _size
    ) external onlyOwnerOrRole(LAYERZERO_ADMIN_ROLE) {
        payloadSizeLimitLookup[_dstChainId] = _size;
    }

    function setChainIdMappings(
        uint16[] calldata layerZeroChainIds,
        uint256[] calldata normalChainIds
    ) public onlyOwnerOrRole(LAYERZERO_ADMIN_ROLE) {
        require(
            layerZeroChainIds.length == normalChainIds.length,
            "invalid arrays"
        );
        for (uint256 i; i < layerZeroChainIds.length; i++) {
            layerZeroChainIdsToNormalChainIds[
                layerZeroChainIds[i]
            ] = normalChainIds[i];
            normalChainIdsToLayerZeroChainIds[
                normalChainIds[i]
            ] = layerZeroChainIds[i];
        }
    }

    //--------------------------- VIEW FUNCTION ----------------------------------------
    function isTrustedRemote(
        uint16 _srcChainId,
        bytes calldata _srcAddress
    ) external view returns (bool) {
        bytes memory trustedSource = trustedRemoteLookup[_srcChainId];
        return keccak256(trustedSource) == keccak256(_srcAddress);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/#storage_gaps
     */
    uint256[40] private __gap;
}
