// SPDX-License-Identifier: MIT

pragma solidity >=0.5.0;

interface ILayerZeroUserApplicationConfig {
    /**
     * @notice set the configuration of the LayerZero messaging library of the specified version
     * @param _version - messaging library version
     * @param _chainId - the chainId for the pending config change
     * @param _configType - type of configuration. every messaging library has its own convention.
     * @param _config - configuration in the bytes. can encode arbitrary content.
     *
     * For the UltraLightNode, valid values for `_configType` are
     * - 1: inbound proof libary version, `_config` MUST be uint16 representing a valid version
     * - 2: inbound block confirmations, `_config` MUST be uint64
     * - 3: relayer, `_config` MUST be address of a contract implenting ILayerZeroRelayer
     * - 4: outbound proof type, `_config` MUST be uint16 representing a valid proof type
     * - 5: outbound block confirmations, `_config` MUST be uint64
     * - 6: oracle, must be address of a contract implementing ILayerZeroOracle
     */
    function setConfig(
        uint16 _version,
        uint16 _chainId,
        uint _configType,
        bytes calldata _config
    ) external;

    /**
     * @notice set the send() LayerZero messaging library version to _version
     * @param _version - new messaging library version
     */
    function setSendVersion(uint16 _version) external;

    /**
     * @notice set the lzReceive() LayerZero messaging library version to _version
     * @param _version - new messaging library version
     */
    function setReceiveVersion(uint16 _version) external;

    /**
     * @notice Only when the UA needs to resume the message flow in blocking mode and clear the stored payload
     * @param _srcChainId - the chainId of the source chain
     * @param _srcAddress - the contract address of the source contract at the source chain
     */
    function forceResumeReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress
    ) external;
}
