// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ILayerZeroOracleV2.sol";
import "../interfaces/ILayerZeroUltraLightNodeV2.sol";

contract LayerZeroOracleMockV2 is ILayerZeroOracleV2, Ownable, ReentrancyGuard {
    mapping(address => bool) public approvedAddresses;
    mapping(uint16 => mapping(uint16 => uint)) public chainPriceLookup;
    uint public fee;
    ILayerZeroUltraLightNodeV2 public uln; // ultraLightNode instance

    event OracleNotified(
        uint16 dstChainId,
        uint16 _outboundProofType,
        uint blockConfirmations
    );
    event Withdraw(address to, uint amount);

    constructor(ILayerZeroUltraLightNodeV2 _uln) {
        approvedAddresses[msg.sender] = true;
        uln = _uln;
    }

    function updateHash(
        uint16 _remoteChainId,
        bytes32 _blockHash,
        uint _confirmations,
        bytes32 _data
    ) public virtual {
        require(
            approvedAddresses[msg.sender],
            "LayerZeroOracleMock: caller must be approved"
        );
        uln.updateHash(_remoteChainId, _blockHash, _confirmations, _data);
    }

    function assignJob(
        uint16 _dstChainId,
        uint16 _outboundProofType,
        uint64 _outboundBlockConfirmation,
        address _userApplication
    ) public returns (uint256 price) {
        emit OracleNotified(
            _dstChainId,
            _outboundProofType,
            _outboundBlockConfirmation
        );

        price = getFee(
            _dstChainId,
            _outboundProofType,
            _outboundBlockConfirmation,
            _userApplication
        );
    }

    function getFee(
        uint16 _dstChainId,
        uint16 _outboundProofType,
        uint64,
        address
    ) public view returns (uint256 price) {
        price = chainPriceLookup[_outboundProofType][_dstChainId];
    }

    function withdrawFee(
        address payable _to,
        uint _amount
    ) public override onlyOwner nonReentrant {
        (bool success, ) = _to.call{value: _amount}("");
        require(success, "failed to withdraw");
        emit Withdraw(_to, _amount);
    }

    // owner can set uln
    function setUln(address ulnAddress) public virtual onlyOwner {
        uln = ILayerZeroUltraLightNodeV2(ulnAddress);
    }

    // mock, doesnt do anything
    function setJob(
        uint16 _chain,
        address _oracle,
        bytes32 _id,
        uint _fee
    ) public onlyOwner {}

    function setDeliveryAddress(
        uint16 _dstChainId,
        address _deliveryAddress
    ) public onlyOwner {}

    function setApprovedAddress(
        address _oracleAddress,
        bool _approve
    ) public virtual {
        approvedAddresses[_oracleAddress] = _approve;
    }

    function isApproved(address _relayerAddress) public view returns (bool) {
        return approvedAddresses[_relayerAddress];
    }

    fallback() external payable {}

    receive() external payable {}
}
