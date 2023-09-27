// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.17;

import "./NonceContract.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NonceContractMock is NonceContract, Ownable {
    constructor(address _endpoint) NonceContract(_endpoint) {}

    function setNonce(
        uint16 _chainId,
        bytes calldata _path,
        uint64 _nonce
    ) public virtual onlyOwner {
        outboundNonce[_chainId][_path] = _nonce;
    }
}
