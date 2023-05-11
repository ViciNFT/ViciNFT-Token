// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../../common/OwnerOperator.sol";
import "./IERC20Operations.sol";

/**
 * @title ERC20 Operations
 * @notice (c) 2023 ViciNFT https://vicinft.com/
 * @author Josh Davis <josh.davis@vicinft.com>
 * 
 * @dev This contract implements most ERC20 behavior on behalf of a main ERC20
 * contract, to reduce the bytecode size of the main contract.
 * @dev The main contract MUST be the owner of this contract.
 * @dev Main contracts SHOULD refer to this contract via the IERC20Operations
 * interface.
 */
contract ERC20Operations is OwnerOperator, IERC20Operations {

    uint256 maxSupply;

    /* ################################################################
     * Initialization
     * ##############################################################*/

    function initialize(uint256 _maxSupply) public virtual initializer {
        __ERC20Operations_init(_maxSupply);
    }

    function __ERC20Operations_init(uint256 _maxSupply)
        internal
        onlyInitializing
    {
        __OwnerOperator_init();
        __ERC20Operations_init_unchained(_maxSupply);
    }

    function __ERC20Operations_init_unchained(uint256 _maxSupply)
        internal
        onlyInitializing
    {
        maxSupply = _maxSupply;
    }

    /**
     * @dev Emitted when token is transferred from `from` to `to`.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when `owner` enables `approved` to manage the `tokenId` token.
     */
    event Approval(
        address indexed owner,
        address indexed approved,
        uint256 value
    );

    // @dev see ViciAccess
    modifier notBanned(IViciAccess ams, address account) {
        ams.enforceIsNotBanned(account);
        _;
    }

    // @dev see ViciAccess
    modifier onlyOwnerOrRole(
        IViciAccess ams,
        address account,
        bytes32 role
    ) {
        ams.enforceOwnerOrRole(role, account);
        _;
    }

    /* ################################################################
     * Queries
     * ##############################################################*/

    /**
     * @dev Returns the total maximum possible that can be minted.
     */
    function getMaxSupply() public override view virtual returns (uint256) {
        return maxSupply;
    }

    /**
     * @dev Returns the amount that has been minted so far.
     */
    function totalSupply() public override view virtual returns (uint256) {
        return itemSupply(1);
    }

    /**
     * @dev returns the amount available to be minted.
     * @dev {total available} = {max supply} - {amount minted so far}
     */
    function availableSupply() public override view virtual returns (uint256) {
        return maxSupply - itemSupply(1);
    }

    /**
     * @dev see IERC20
     */
    function balanceOf(address account)
        public override
        view
        virtual
        returns (uint256 balance)
    {
        balance = getBalance(account, 1);
    }

    /* ################################################################
     * Minting / Burning / Transferring
     * ##############################################################*/

    /**
     * @dev Safely mints a new token and transfers it to the specified address.
     * @dev Updates available quantities
     *
     * Requirements:
     *
     * - `mintData.operator` MUST be owner or have the required role.
     * - `mintData.operator` MUST NOT be banned.
     * - `mintData.toAddress` MUST NOT be 0x0.
     * - `mintData.toAddress` MUST NOT be banned.
     * - If `mintData.toAddress` refers to a smart contract, it must implement
     *      {IERC20Receiver-onERC20Received}, which is called upon a safe
     *      transfer.
     */
    function mint(IViciAccess ams, ERC20MintData memory mintData)
        public override
        virtual
        onlyOwner
        onlyOwnerOrRole(ams, mintData.operator, mintData.requiredRole)
        notBanned(ams, mintData.toAddress)
    {
        require(availableSupply() >= mintData.amount, "sold out");
        _mint(mintData);
    }

    /** @dev Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function _mint(ERC20MintData memory mintData) internal virtual {
        require(
            mintData.toAddress != address(0),
            "ERC20: mint to the zero address"
        );

        doTransfer(
            mintData.operator,
            address(0),
            mintData.toAddress,
            1,
            mintData.amount
        );
    }

    /**
     * @dev see IERC20
     */
    function transfer(IViciAccess ams, ERC20TransferData memory transferData)
        public override
        virtual
        onlyOwner
        notBanned(ams, transferData.operator)
        notBanned(ams, transferData.fromAddress)
        notBanned(ams, transferData.toAddress)
    {
        require(
            transferData.toAddress != address(0),
            "ERC20: transfer to the zero address"
        );
        doTransfer(
            transferData.operator,
            transferData.fromAddress,
            transferData.toAddress,
            1,
            transferData.amount
        );
    }

    /**
     * @dev see IERC20
     */
    function transferFrom(
        IViciAccess ams,
        ERC20TransferData memory transferData
    )
        public override
        virtual
        onlyOwner
        notBanned(ams, transferData.operator)
        notBanned(ams, transferData.fromAddress)
        notBanned(ams, transferData.toAddress)
    {
        doTransfer(
            transferData.operator,
            transferData.fromAddress,
            transferData.toAddress,
            1,
            transferData.amount
        );
    }

    /**
     * @dev Burns the identified token.
     * @dev Updates available quantities
     *
     * Requirements:
     *
     * - `burnData.operator` MUST be owner or have the required role.
     * - `burnData.operator` MUST NOT be banned.
     * - `burnData.operator` MUST own the token or be authorized by the
     *     owner to transfer the token.
     */
    function burn(IViciAccess ams, ERC20BurnData memory burnData)
        public override
        virtual
        onlyOwner
        onlyOwnerOrRole(ams, burnData.operator, burnData.requiredRole)
    {
        _burn(burnData);
    }

    function _burn(ERC20BurnData memory burnData) internal {
        require(
            burnData.fromAddress != address(0),
            "ERC20: burn from the zero address"
        );
        doTransfer(
            burnData.operator,
            burnData.fromAddress,
            address(0),
            1,
            burnData.amount
        );
    }

    /* ################################################################
     * Approvals / Allowances
     * ##############################################################*/

    /**
     * @dev see IERC20
     */
    function allowance(address owner, address spender)
        public override
        view
        virtual
        returns (uint256)
    {
        return allowance(owner, spender, 1);
    }

    /**
     * @dev See {IERC20Permit-permit}.
     */
    function permit(
        IViciAccess ams,
        address owner,
        address spender,
        uint256 amount
    ) public override virtual onlyOwner notBanned(ams, owner) notBanned(ams, spender) {
        approve(owner, spender, 1, amount);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
