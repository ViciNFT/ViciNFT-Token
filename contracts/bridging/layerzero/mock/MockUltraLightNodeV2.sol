// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.17;
pragma abicoder v2;

import "./interfaces/ILayerZeroRelayerV2.sol";
import "./interfaces/ILayerZeroOracleV2.sol";
import "./interfaces/ILayerZeroValidationLibrary.sol";
import "./UltraLightNodeV2.sol";

contract MockUltraLightNodeV2 is UltraLightNodeV2 {
    ILayerZeroRelayerV2 public defaultRelayer;
    ILayerZeroOracleV2 public defaultOracle;
    ILayerZeroValidationLibrary public defaultValidator;

    constructor(
        address _endpoint,
        address _nonceContract,
        uint16 _localChainId
    ) UltraLightNodeV2(_endpoint, _nonceContract, _localChainId) {}

    function setDefaultRelayer(
        ILayerZeroRelayerV2 _relayer
    ) public virtual onlyOwner {
        defaultRelayer = _relayer;
    }

    function setDefaultOracle(
        ILayerZeroOracleV2 _oracle
    ) public virtual onlyOwner {
        defaultOracle = _oracle;
    }

    function setDefaultValidator(
        ILayerZeroValidationLibrary _validator
    ) public virtual onlyOwner {
        defaultValidator = _validator;
    }

    function connectChain(
        uint16 _remoteChainId,
        address _remoteUln,
        uint64 _blockConfirmations
    ) public virtual onlyOwner {
        setRemoteUln(_remoteChainId, bytes32(uint256(uint160(_remoteUln))));
        setChainAddressSize(_remoteChainId, 20);
        addInboundProofLibraryForChain(
            _remoteChainId,
            address(defaultValidator)
        );
        uint16 libVer = maxInboundProofLibrary[_remoteChainId];
        enableSupportedOutboundProof(_remoteChainId, libVer);
        setDefaultConfigForChainId(
            _remoteChainId,
            libVer,
            _blockConfirmations,
            address(defaultRelayer),
            libVer,
            _blockConfirmations,
            address(defaultOracle)
        );
    }

    function encodeArbitraryPacket(
        uint64 nonce,
        address ua,
        uint16 dstChainId,
        address dstAddress,
        bytes calldata payload
    ) public view returns (bytes memory) {
        return
            abi.encodePacked(
                nonce,
                localChainId,
                ua,
                dstChainId,
                dstAddress,
                payload
            );
    }

    function emitArbitraryPacket(
        uint64 nonce,
        address ua,
        uint16 dstChainId,
        address dstAddress,
        bytes calldata payload
    ) public {
        emit Packet(
            encodeArbitraryPacket(nonce, ua, dstChainId, dstAddress, payload)
        );
    }
}
