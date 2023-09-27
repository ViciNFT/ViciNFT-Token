// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@chainlink/contracts/src/v0.8/interfaces/ERC677ReceiverInterface.sol";

import "../../../common/BaseViciContract.sol";
import "../../../utils/cryptography/EIP712.sol";
import "../../../utils/Monotonic.sol";
import "../extensions/IERC677.sol";
import "../IERC20Operations.sol";

/**
 * @title Vici ERC20
 * @notice (c) 2023 ViciNFT https://vicinft.com/
 * @author Josh Davis <josh.davis@vicinft.com>
 *
 * @dev This contract provides base functionality for an ERC20 token.
 * @dev It adds support for pausible, ownable, access roles, and OFAC sanctions
 * compliance.
 * @dev Roles used by the access management are
 * - DEFAULT_ADMIN_ROLE: administers the other roles
 * - MODERATOR_ROLE_NAME: administers the banned role
 * - MINTER_ROLE_NAME: can mint/burn tokens
 * - BANNED_ROLE: cannot send or receive tokens
 */
contract ViciERC20v01 is BaseViciContract, IERC20Metadata, IERC677, EIP712 {
    using Monotonic for Monotonic.Increaser;

    event SanctionedAssetsRecovered(
        address from,
        address to,
        uint256 value
    );

    // Creator can create a new token type and mint an initial supply.
    bytes32 public constant MINTER_ROLE_NAME = "minter";

    // solhint-disable-next-line var-name-mixedcase
    bytes32 private constant _PERMIT_TYPEHASH =
        keccak256(
            "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
        );

    /**
     * @dev In previous versions `_PERMIT_TYPEHASH` was declared as `immutable`.
     * However, to ensure consistency with the upgradeable transpiler, we will continue
     * to reserve a slot.
     * @custom:oz-renamed-from _PERMIT_TYPEHASH
     */
    // solhint-disable-next-line var-name-mixedcase
    bytes32 private _PERMIT_TYPEHASH_DEPRECATED_SLOT;

    mapping(address => Monotonic.Increaser) private _nonces;
    string public name;
    string public symbol;
    uint8 public decimals;

    IERC20Operations public tokenData;

    /* ################################################################
     * Initialization
     * ##############################################################*/

    /**
     * @dev the initializer function
     * @param _accessServer The Access Server contract
     * @param _tokenData The ERC20 Operations contract. You MUST set this
     * contract as the owner of that contract.
     * @param _name the name of the token.
     * @param _symbol the token symbol.
     * @param _decimals the number of decimals.
     */
    function initialize(
        IAccessServer _accessServer,
        IERC20Operations _tokenData,
        string calldata _name,
        string calldata _symbol,
        uint8 _decimals
    ) public virtual initializer {
        __ViciERC20_init(_accessServer, _tokenData, _name, _symbol, _decimals);
    }

    function __ViciERC20_init(
        IAccessServer _accessServer,
        IERC20Operations _tokenData,
        string calldata _name,
        string calldata _symbol,
        uint8 _decimals
    ) internal onlyInitializing {
        EIP712.__EIP712_init(_name, "1");
        BaseViciContract.__BaseViciContract_init(_accessServer);
        __ViciERC20_init_unchained(_tokenData, _name, _symbol, _decimals);
    }

    function __ViciERC20_init_unchained(
        IERC20Operations _tokenData,
        string calldata _name,
        string calldata _symbol,
        uint8 _decimals
    ) internal onlyInitializing {
        tokenData = _tokenData;
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    /* ################################################################
     * Queries
     * ##############################################################*/

    /**
     * @notice Returns the total maximum possible tokens.
     */
    function maxSupply() public view virtual returns (uint256) {
        return tokenData.getMaxSupply();
    }

    /**
     * @inheritdoc IERC20
     */
    function totalSupply() public view virtual returns (uint256) {
        return tokenData.totalSupply();
    }

    /**
     * @notice Returns the total maximum possible tokens.
     */
    function availableSupply() public view virtual returns (uint256) {
        return tokenData.availableSupply();
    }

    /**
     * @dev see IERC20
     */
    function balanceOf(
        address owner
    ) public view virtual returns (uint256 balance) {
        return tokenData.balanceOf(owner);
    }

    /**
     * @dev Returns the number of distict owners.
     * @dev use with `getOwnerAtIndex()` to iterate.
     */
    function getOwnerCount() public view virtual returns (uint256) {
        return tokenData.ownerCount();
    }

    /**
     * @dev Returns the address of the owner at the index.
     * @dev use with `ownerCount()` to iterate.
     *
     * @param index the index into the list of owners
     *
     * Requirements
     * - `index` MUST be less than the number of owners.
     */
    function getOwnerAtIndex(
        uint256 index
    ) public view virtual returns (address) {
        return tokenData.ownerAtIndex(index);
    }

    /* ################################################################
     * Minting / Burning / Transferring
     * ##############################################################*/

    /**
     * @notice Safely mints a new token and transfers it to `toAddress`.
     * @param toAddress The account to receive the newly minted token.
     * @param amount The id of the new token.
     *
     * Requirements:
     *
     * - Contract MUST NOT be paused.
     * - Calling user MUST be owner or have the minter role.
     * - Calling user MUST NOT be banned.
     * - `toAddress` MUST NOT be 0x0.
     * - `toAddress` MUST NOT be banned.
     */
    function mint(
        address toAddress,
        uint256 amount
    ) public virtual whenNotPaused {
        tokenData.mint(
            this,
            ERC20MintData(_msgSender(), MINTER_ROLE_NAME, toAddress, amount)
        );

        _post_mint_hook(toAddress, amount);
    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     */
    function transfer(
        address toAddress,
        uint256 amount
    ) public virtual override returns (bool) {
        tokenData.transfer(
            this,
            ERC20TransferData(_msgSender(), _msgSender(), toAddress, amount)
        );
        _post_transfer_hook(_msgSender(), toAddress, amount);
        return true;
    }

    /**
     * @dev See {IERC20-transferFrom}.
     * @dev See {safeTransferFrom}.
     *
     * Requirements
     *
     * - Contract MUST NOT be paused.
     * - `fromAddress` and `toAddress` MUST NOT be the zero address.
     * - `toAddress`, `fromAddress`, and calling user MUST NOT be banned.
     * - `_tokenId` MUST belong to `fromAddress`.
     * - Calling user must be the `fromAddress` or be approved by the `fromAddress`.
     * - `_tokenId` must exist
     *
     * @inheritdoc IERC20
     */
    function transferFrom(
        address fromAddress,
        address toAddress,
        uint256 amount
    ) public virtual override whenNotPaused returns (bool) {
        tokenData.transfer(
            this,
            ERC20TransferData(_msgSender(), fromAddress, toAddress, amount)
        );
        _post_transfer_hook(fromAddress, toAddress, amount);
        return true;
    }

    /**
     * @inheritdoc IERC677
     */
    function transferAndCall(
        address to,
        uint256 value,
        bytes calldata data
    ) public virtual override returns (bool success) {
        transfer(to, value);
        ERC677ReceiverInterface receiver = ERC677ReceiverInterface(to);
        receiver.onTokenTransfer(_msgSender(), value, data);
        return true;
    }

    /**
     * @notice Burns the identified token.
     * @param amount The amount of tokens to be burned.
     * Emits a {Transfer} event.
     *
     * Requirements:
     *
     * - Contract MUST NOT be paused.
     * - Calling user MUST be owner or have the minter role.
     * - Calling user MUST NOT be banned.
     * - Calling user MUST own the token or be authorized by the owner to
     *     transfer the token.
     */
    function burn(
        address fromAddress,
        uint256 amount
    ) public virtual whenNotPaused {
        tokenData.burn(
            this,
            ERC20BurnData(_msgSender(), MINTER_ROLE_NAME, fromAddress, amount)
        );

        _post_burn_hook(fromAddress, amount);
    }

    /* ################################################################
     * Approvals / Allowances
     * ##############################################################*/

    /**
     * @dev See {IERC20-allowance}.
     */
    function allowance(
        address owner,
        address spender
    ) public view virtual override returns (uint256) {
        return tokenData.allowance(owner, spender);
        //return _allowances[owner][spender];
    }

    /**
     * Requirements
     *
     * - Contract MUST NOT be paused.
     * - caller MUST be the token owner or be approved for all by the token
     *     owner.
     * - `operator` MUST NOT be the zero address.
     * - `operator` and calling user MUST NOT be banned.
     *
     * @inheritdoc IERC20
     */
    function approve(
        address operator,
        uint256 amount
    ) public virtual override whenNotPaused returns (bool) {
        tokenData.permit(this, _msgSender(), operator, amount);
        emit Approval(_msgSender(), operator, amount);
        return true;
    }

    /**
     * @dev See {IERC20Permit-permit}.
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual {
        require(block.timestamp <= deadline, "ERC20Permit: expired deadline");

        bytes32 structHash = keccak256(
            abi.encode(
                _PERMIT_TYPEHASH,
                owner,
                spender,
                value,
                _useNonce(owner),
                deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);

        address signer = ECDSA.recover(hash, v, r, s);
        require(signer == owner, "ERC20Permit: invalid signature");

        tokenData.permit(this, owner, spender, value);
        emit Approval(owner, spender, value);
    }

    function getChainId() public view returns (uint256) {
        return block.chainid;
    }

    /**
     * @dev See {IERC20Permit-nonces}.
     */
    function nonces(address owner) public view virtual returns (uint256) {
        return _nonces[owner].current();
    }

    /**
     * @notice recover assets in banned or sanctioned accounts
     * @dev emits SanctionedAssetsRecovered
     *
     * Requirements
     * - `operator` MUST be the contract owner.
     * - `fromAddress` MUST be banned or OFAC sanctioned
     * - `toAddress` MAY be the zero address, in which case the
     *     assets are burned.
     * - `toAddress` MUST NOT be banned or OFAC sanctioned
     */
    function recoverSanctionedAssets(
        address fromAddress,
        address toAddress
    ) public virtual onlyOwner {
        uint256 amount = tokenData.recoverSanctionedAssets(
            this,
            msg.sender,
            fromAddress,
            toAddress
        );
        emit SanctionedAssetsRecovered(fromAddress, toAddress, amount);
        _post_transfer_hook(fromAddress, toAddress, amount);
    }

    /**
     * @dev "Consume a nonce": return the current value and increment.
     *
     * _Available since v4.1._
     */
    function _useNonce(
        address owner
    ) internal virtual returns (uint256 current) {
        Monotonic.Increaser storage nonce = _nonces[owner];
        current = nonce.current();
        nonce.add(1);
    }

    /**
     * @dev See {IERC20Permit-DOMAIN_SEPARATOR}.
     */
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() public view virtual returns (bytes32) {
        return _domainSeparatorV4();
    }

    /* ################################################################
     * Hooks
     * ##############################################################*/

    function _post_mint_hook(
        address toAddress,
        uint256 amount
    ) internal virtual {
        _post_transfer_hook(address(0), toAddress, amount);
    }

    function _post_burn_hook(
        address fromAddress,
        uint256 amount
    ) internal virtual {
        _post_transfer_hook(fromAddress, address(0), amount);
    }

    function _post_transfer_hook(
        address fromAddress,
        address toAddress,
        uint256 amount
    ) internal virtual {
        emit Transfer(fromAddress, toAddress, amount);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[44] private __gap;
}