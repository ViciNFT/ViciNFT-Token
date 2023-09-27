# Summary of changes to support bridging

This release includes changes to make it so that ViciCoin (VCNT) can be bridged to other EVM chains using LayerZero.

## Goals

We developed a bridging implementation in a generic way so that 
- multiple types of tokens are supported
- the bridging service used may be changed without much pain
- it can be easily expanded to support other (non-token) cross-chain use cases

## The implementation

The abstract `LzTunnel` contract provides a generic framework for sending messages to and receiving messages from a LayerZero endpoint. It expects an ABI-encoded function call as the payload, which it sends to the contract referenced as `localAddress`. If it fails, a MessageFailed event is emitted with the payload and the revert message, information about the message is stored so it can be retried, and the receive function returns without reverting so the endpoint will not be blocked.

The abstract `LzTokenTunnel` extends `LzTunnel` with functionality specific for sending and receiving ERC20, ERC721, and ERC1155 tokens.

The `IBridgeable` interface is intended to be implemented by ERC20, ERC721, and ERC1155 token contracts to make them easier to bridge. The `sentToBridge` function is called by the tunnel contract on the source chain when tokens are sent, and the `receivedFromBridge` function is called by the tunnel contract on the destination chain when tokens are received.

The `LzBridgeableToken` interface extends `LzTokenTunnel` to work with tokens that implement the `IBridgeable` interface. When tokens are sent, it calls `sendToBridge` on the client contract and encodes an call to `receivedFromBridge` as payload. Another implementation might call `burn` on the client contract and encode a call to `mint` as the payload.

We made the following changes to the `ViciERC20` contract:
- Added a public boolean field `isMain` and a public address field `vault`.
- Added an `_isMain` parameter to `initialize` and added a `_reinit(bool _isMain)` to set the `isMain` and `vault` fields on initializtion / upgrade. If `isMain` is `false`, `vault` will be the null address.
- Implemented the `IBridgeable` interface with the following stipulations:
    - `sentToBridge` and `receivedFromBridge` may only be called by an address that has the `BRIDGE_CONTRACT` (`0x3fd4a614bd02c8fb908a3b3a05852476cf4c63cfc1b7280860fd956aa0982f9f`) role.
    - if `isMain` is `true`, tokens sent to the bridge are transfered from the sender to the vault, and tokens received from the bridge are transferred from the vault to the receiver.
    - if `isMain` is `false`, tokens sent to the bridge are burned by the sender, and tokens received from the bridge are minted to the receiver.

## Differences from the LayerZero sample code

Our `LzTunnel` contract is based on the `LzAppUpgradeable` and `NonblockingLzAppUpgradeable` contracts from LayerZero's [solidity-examples](https://github.com/LayerZero-Labs/solidity-examples/tree/main) repository. Our `LzTokenTunnel` and `LzBridgeableTokenTunnel` contract is based on the example `OFTCore` and `OFT` contracts.

### Separation of business logic from bridging logic.
This is the major difference. In the sample code, the token contract extends `NonblockingLzApp`, so the logic needed to interact with the LayerZero bridge is inherited. This implementation uses a separate "tunnel" contract to manage the interaction with the bridge. This approach was required for our project to keep our token contract under the 24,576 byte limit, but it also provides the following benefits:

- Makes it possible to switch to another bridge service, or support multiple bridge services at the same time, without modifying the token contract.
- Makes it possible to bridge existing tokens on non-upgradeable contracts without modification.
- The separation of concerns leads to a cleaner implemtation. The token contract only has to worry about being a token, and the tunnel contract manages the bridge interaction.

There are also the following disadvantages to this approach:

- Slightly higher gas usage due to more inter-contract messages
- Additional attack surfaces

### Other differences
- Collapsed the LzApp <-- NonblockingLzApp hierarchy, making non-blocking mode the default. If we have a future use case requiring blocking mode, we can override LzTunnel._receiveMessage to implement it.
- Added role-based access management and the LAYERZERO_ADMIN_ROLE to control access to the configuration functions.
- The `payload` is an ABI-encoded function call on the token contract, rather than ABI-encoded parameters for a receive function on the tunnel contract.
- Added mappings between the standard chain ids and LayerZero's nonstandard chain ids. The `LzTokenTunnel.sendFrom` function takes the standard token id. Function that expect a LayerZero chain id take a parameter type of `uint16`, and functions that expect a standard chain id take `uint256`.
- Omitted the public `precrime` attribute, `SetPrecrime` event, and `setPrecrime` function found in `LzApp`. I didn't understand the intention behind them, they weren't used anywhere in any of the examples, and there was no documentation for any of it.

## Security concerns
### The BRIDGE_CONTRACT role
LayerZero's example implementation is more secure than this implementation because the mint/burn functions  intended for use by the bridge on the token contract may only be called by one address that is stored in an immutable field. In this implementation, these functions may be called by any address with the `BRIDGE_CONTRACT` role.

This means access to `BRIDGE_CONTRACT` role MUST be tightly guarded. In our implementation, the multisignature wallet will be the sole administrator of this role, meaning it will require multiple signatures to grant this role to an address.