// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title Wallet
 * @notice (c) 2023 ViciNFT https://vicinft.com/
 * @author Josh Davis <josh.davis@vicinft.com>
 *
 * @dev This is an abstract contract with basic wallet functionality. It can
 *     send and receive native crypto, ERC20 tokens, ERC721 tokens, ERC777 
 *     tokens, and ERC1155 tokens.
 * @dev The withdraw events are always emitted when crypto or tokens are
 *     withdrawn.
 * @dev The deposit events are less reliable, and normally only work when the
 *     safe transfer functions are used.
 * @dev There is no DepositERC20 event defined, because the ERC20 standard 
 *     doesn't include a safe transfer function.
 * @dev The withdraw functions are all marked as internal. Subclasses should
 *     add public withdraw functions that delegate to these, preferably with 
 *     some kind of control over who is allowed to call them.
 */
abstract contract Wallet is
    IERC721Receiver,
    IERC777Recipient,
    IERC1155Receiver,
    ERC165
{
    /**
     * @dev May be emitted when native crypto is deposited.
     * @param sender the source of the crypto
     * @param value the amount deposited
     */
    event Deposit(address indexed sender, uint256 value);

    /**
     * @dev May be emitted when an NFT is deposited.
     * @param sender the source of the NFT
     * @param tokenContract the NFT contract
     * @param tokenId the id of the deposited token
     */
    event DepositERC721(
        address indexed sender,
        address indexed tokenContract,
        uint256 tokenId
    );

    /**
     * @dev May be emitted when ERC777 tokens are deposited.
     * @param sender the source of the ERC777 tokens
     * @param tokenContract the ERC777 contract
     * @param amount the amount deposited
     */
    event DepositERC777(
        address indexed sender,
        address indexed tokenContract,
        uint256 amount
    );

    /**
     * @dev May be emitted when semi-fungible tokens are deposited.
     * @param sender the source of the semi-fungible tokens
     * @param tokenContract the semi-fungible token contract
     * @param tokenId the id of the semi-fungible tokens
     * @param amount the number of tokens deposited
     */
    event DepositERC1155(
        address indexed sender,
        address indexed tokenContract,
        uint256 tokenId,
        uint256 amount
    );

    /**
     * @dev Emitted when native crypto is withdrawn.
     * @param recipient the destination of the crypto
     * @param value the amount withdrawn
     */
    event Withdraw(address indexed recipient, uint256 value);

    /**
     * @dev Emitted when ERC20 tokens are withdrawn.
     * @param recipient the destination of the ERC20 tokens
     * @param tokenContract the ERC20 contract
     * @param amount the amount withdrawn
     */
    event WithdrawERC20(
        address indexed recipient,
        address indexed tokenContract,
        uint256 amount
    );

    /**
     * @dev Emitted when an NFT is withdrawn.
     * @param recipient the destination of the NFT
     * @param tokenContract the NFT contract
     * @param tokenId the id of the withdrawn token
     */
    event WithdrawERC721(
        address indexed recipient,
        address indexed tokenContract,
        uint256 tokenId
    );

    /**
     * @dev Emitted when ERC777 tokens are withdrawn.
     * @param recipient the destination of the ERC777 tokens
     * @param tokenContract the ERC777 contract
     * @param amount the amount withdrawn
     */
    event WithdrawERC777(
        address indexed recipient,
        address indexed tokenContract,
        uint256 amount
    );

    /**
     * @dev Emitted when semi-fungible tokens are withdrawn.
     * @param recipient the destination of the semi-fungible tokens
     * @param tokenContract the semi-fungible token contract
     * @param tokenId the id of the semi-fungible tokens
     * @param amount the number of tokens withdrawn
     */
    event WithdrawERC1155(
        address indexed recipient,
        address indexed tokenContract,
        uint256 tokenId,
        uint256 amount
    );

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC165, IERC165)
        returns (bool)
    {
        return
            interfaceId == type(IERC721Receiver).interfaceId ||
            interfaceId == type(IERC777Recipient).interfaceId ||
            interfaceId == type(IERC1155Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    receive() external payable {
        if (msg.value > 0) emit Deposit(msg.sender, msg.value);
    }

    /**
     * @dev See {IERC721Receiver-onERC721Received}.
     */
    function onERC721Received(
        address,
        address from,
        uint256 tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        emit DepositERC721(from, msg.sender, tokenId);
        return IERC721Receiver.onERC721Received.selector;
    }

    /**
     * @dev See {IERC777Recipient-tokensReceived}.
     */
    function tokensReceived(
        address,
        address from,
        address,
        uint256 amount,
        bytes calldata,
        bytes calldata
    ) external override {
        emit DepositERC777(from, msg.sender, amount);
    }

    /**
     * @dev See {IERC1155Receiver-onERC1155Received}.
     */
    function onERC1155Received(
        address,
        address from,
        uint256 tokenId,
        uint256 value,
        bytes calldata
    ) external override returns (bytes4) {
        emit DepositERC1155(from, msg.sender, tokenId, value);
        return
            bytes4(
                keccak256(
                    "onERC1155Received(address,address,uint256,uint256,bytes)"
                )
            );
    }

    /**
     * @dev See {IERC1155Receiver-onERC1155BatchReceived}.
     */
    function onERC1155BatchReceived(
        address,
        address from,
        uint256[] calldata tokenIds,
        uint256[] calldata values,
        bytes calldata
    ) external override returns (bytes4) {
        for (uint256 i = 0; i < values.length; i++) {
            emit DepositERC1155(from, msg.sender, tokenIds[i], values[i]);
        }
        return
            bytes4(
                keccak256(
                    "onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"
                )
            );
    }

    /**
     * @dev Withdraw native crypto.
     * @notice Emits Withdraw
     * @param toAddress Where to send the crypto
     * @param amount The amount to send
     */
    function _withdraw(address payable toAddress, uint256 amount)
        internal
        virtual
    {
        require(toAddress != address(0), "ETH: transfer to the zero address");
        toAddress.transfer(amount);
        emit Withdraw(toAddress, amount);
    }

    /**
     * @dev Withdraw ERC20 tokens.
     * @notice Emits WithdrawERC20
     * @param toAddress Where to send the ERC20 tokens
     * @param tokenContract The ERC20 token contract
     * @param amount The amount withdrawn
     */
    function _withdrawERC20(
        address payable toAddress,
        uint256 amount,
        IERC20 tokenContract
    ) internal virtual {
        require(toAddress != address(0), "ERC20: transfer to the zero address");
        tokenContract.transfer(toAddress, amount);
        emit WithdrawERC20(toAddress, address(tokenContract), amount);
    }

    /**
     * @dev Withdraw an NFT.
     * @notice Emits WithdrawERC721
     * @param toAddress Where to send the NFT
     * @param tokenContract The NFT contract
     * @param tokenId The id of the NFT
     */
    function _withdrawERC721(
        address payable toAddress,
        uint256 tokenId,
        IERC721 tokenContract
    ) internal virtual {
        require(toAddress != address(0), "ERC721: transfer to the zero address");
        tokenContract.safeTransferFrom(address(this), toAddress, tokenId);
        emit WithdrawERC721(toAddress, address(tokenContract), tokenId);
    }

    /**
     * @dev Withdraw ERC777 tokens.
     * @notice Emits WithdrawERC777
     * @param toAddress Where to send the ERC777 tokens
     * @param tokenContract The ERC777 token contract
     * @param amount The amount withdrawn
     */
    function _withdrawERC777(
        address payable toAddress,
        uint256 amount,
        IERC777 tokenContract
    ) internal virtual {
        require(toAddress != address(0), "ERC777: transfer to the zero address");
        tokenContract.operatorSend(address(this), toAddress, amount, "", "");
        emit WithdrawERC777(toAddress, address(tokenContract), amount);
    }

    /**
     * @dev Withdraw semi-fungible tokens.
     * @notice Emits WithdrawERC1155
     * @param toAddress Where to send the semi-fungible tokens
     * @param tokenContract The semi-fungible token contract
     * @param tokenId The id of the semi-fungible tokens
     * @param amount The number of tokens withdrawn
     */
    function _withdrawERC1155(
        address payable toAddress,
        uint256 tokenId,
        uint256 amount,
        IERC1155 tokenContract
    ) internal virtual {
        require(toAddress != address(0), "ERC1155: transfer to the zero address");
        tokenContract.safeTransferFrom(
            address(this),
            toAddress,
            tokenId,
            amount,
            ""
        );
        emit WithdrawERC1155(
            toAddress,
            address(tokenContract),
            tokenId,
            amount
        );
    }
}
