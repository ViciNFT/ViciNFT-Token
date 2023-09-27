// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../core/LzTunnel.sol";
import "./MockCounter.sol";

contract MockCounterTunnel is LzTunnel {
    uint256 internal constant MIN_GAS_LIMIT = 200000;

    bytes internal constant PAYLOAD =
        abi.encodeWithSelector(MockCounter.counterIncremented.selector);

    function initialize(
        IAccessServer _accessServer,
        address _endpoint,
        address _localAddress
    ) public initializer {
        __LzApp_init(_accessServer, _endpoint, _localAddress, MIN_GAS_LIMIT);
    }

    function estimateSendFee(
        uint256 _dstChainId,
        bool _useZro,
        bytes memory _adapterParams
    ) public view virtual returns (uint nativeFee, uint zroFee) {
        if (_adapterParams.length == 0) {
            _adapterParams = defaultAdapterParams;
        }

        return
            lzEndpoint.estimateFees(
                normalChainIdsToLayerZeroChainIds[_dstChainId],
                address(this),
                PAYLOAD,
                _useZro,
                _adapterParams
            );
    }

    function incrementCounter(
        uint256 _dstChainId,
        address payable _refundAddress,
        address _zroPaymentAddress,
        bytes memory _adapterParams
    ) public payable virtual {
        uint16 lzChainId = normalChainIdsToLayerZeroChainIds[_dstChainId];
        require(lzChainId > 0, "invalid chain id");

        if (_adapterParams.length > 0) {
            _checkGasLimit(_adapterParams, 0);
        } else {
            _adapterParams = defaultAdapterParams;
        }

        _lzSend(
            lzChainId,
            PAYLOAD,
            _refundAddress,
            _zroPaymentAddress,
            _adapterParams,
            msg.value
        );
    }
}
