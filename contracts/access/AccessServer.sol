// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "./AccessConstants.sol";
import "./IAccessServer.sol";
import "./Ownable.sol";

/**
 * @title Access Server
 * @notice (c) 2023 ViciNFT https://vicinft.com/
 * @author Josh Davis <josh.davis@vicinft.com>
 *
 * @dev This contract serves as a centralized repository for managing 
 * role-based access and OFAC sanctions compliance.
 * @dev Accounts can be granted roles globally across all client contracts,
 * or may be granted roles for individual client contracts.
 * @dev Client contracts register by calling `register()`.
 * @dev Client contracts SHOULD refer to this contract via the IAccessServer
 * interface.
 */
contract AccessServer is Ownable, IAccessServer {
    using Strings for string;
    using EnumerableSet for EnumerableSet.AddressSet;

    struct RoleData {
        mapping(address => bool) members;
        bytes32 adminRole;
    }

    struct ResourcePolicy {
        address owner;
        mapping(bytes32 => EnumerableSet.AddressSet) roleMembers;
        mapping(bytes32 => RoleData) roles;
    }

    address internal constant GLOBAL_RESOURCE = address(0);

    ChainalysisSanctionsList public sanctionsList;
    mapping(address => ResourcePolicy) managedResources;
    EnumerableSet.AddressSet administrators;

    /* ################################################################
     * Initialization
     * ##############################################################*/

    function initialize() public virtual initializer {
        __AccessServer_init();
    }

    function __AccessServer_init() internal onlyInitializing {
        __Ownable_init_unchained();
        __AccessServer_init_unchained();
    }

    function __AccessServer_init_unchained() internal onlyInitializing {
        _setRoleAdmin(GLOBAL_RESOURCE, BANNED, MODERATOR);
    }

    /* ################################################################
     * Modifiers / Rule Enforcement
     * ##############################################################*/

    /**
     * @dev Reverts if the caller is not a registered resource.
     */
    modifier registeredResource() {
        require(isRegistered(_msgSender()), "AccessServer: not registered");
        _;
    }

    /**
     * @dev Reverts if the caller is not an administrator of this AccessServer.
     */
    modifier onlyAdministrator() {
        require(
            isAdministrator(_msgSender()),
            "AccessServer: caller is not admin"
        );
        _;
    }

    /**
     * @dev Throws if the account is not the resource's owner.
     */
    function enforceIsOwner(address resource, address account)
        public
        view
        virtual
        override
    {
        require(
            account == getResourceOwner(resource),
            "AccessControl: not owner"
        );
    }

    /**
     * @dev Throws if the account is not the calling resource's owner.
     */
    function enforceIsMyOwner(address account) public view virtual override {
        require(
            account == getResourceOwner(_msgSender()),
            "AccessControl: not owner"
        );
    }

    /**
     * @dev Reverts if the account is not the resource owner or doesn't have
     * the moderator role for the resource.
     */
    function enforceIsModerator(address resource, address account)
        public
        view
        virtual
        override
    {
        require(
            account == getResourceOwner(resource) ||
                hasRole(resource, MODERATOR, account),
            "AccessControl: not moderator"
        );
    }

    /**
     * @dev Reverts if the account is not the resource owner or doesn't have
     * the moderator role for the calling resource.
     */
    function enforceIsMyModerator(address account)
        public
        view
        virtual
        override
    {
        enforceIsModerator(_msgSender(), account);
    }

    /**
     * @dev Reverts if the account is under OFAC sanctions or is banned for the
     * resource
     */
    function enforceIsNotBanned(address resource, address account)
        public
        view
        virtual
        override
    {
        enforceIsNotSanctioned(account);
        require(!isBanned(resource, account), "AccessControl: banned");
    }

    /**
     * @dev Reverts if the account is under OFAC sanctions or is banned for the
     * calling resource
     */
    function enforceIsNotBannedForMe(address account)
        public
        view
        virtual
        override
    {
        enforceIsNotBanned(_msgSender(), account);
    }

    /**
     * @dev Reverts the account is on the OFAC sanctions list.
     */
    function enforceIsNotSanctioned(address account)
        public
        view
        virtual
        override
    {
        require(!isSanctioned(account), "OFAC sanctioned address");
    }

    /**
     * @dev Reverts if the account is not the resource owner or doesn't have
     * the required role for the resource.
     */
    function enforceOwnerOrRole(
        address resource,
        bytes32 role,
        address account
    ) public view virtual override {
        if (account != getResourceOwner(resource)) {
            checkRole(resource, role, account);
        }
    }

    /**
     * @dev Reverts if the account is not the resource owner or doesn't have
     * the required role for the calling resource.
     */
    function enforceOwnerOrRoleForMe(bytes32 role, address account)
        public
        view
        virtual
        override
    {
        enforceOwnerOrRole(_msgSender(), role, account);
    }

    /* ################################################################
     * Administration
     * ##############################################################*/

    /**
     * @dev Returns `true` if `admin` is an administrator of this AccessServer.
     */
    function isAdministrator(address admin)
        public
        view
        virtual
        override
        returns (bool)
    {
        return administrators.contains(admin);
    }

    /**
     * @dev Adds `admin` as an administrator of this AccessServer.
     */
    function addAdministrator(address admin) public virtual override onlyOwner {
        require(!isAdministrator(admin), "AccessServer: already admin");
        administrators.add(admin);
        emit AdminAddition(admin);
    }

    /**
     * @dev Removes `admin` as an administrator of this AccessServer.
     */
    function removeAdministrator(address admin) public virtual override {
        require(
            _msgSender() == owner() || _msgSender() == admin,
            "AccessServer: caller is not owner or self"
        );
        administrators.remove(admin);
        emit AdminRemoval(admin);
    }

    /**
     * @dev Returns the number of administrators of this AccessServer.
     * @dev Use with `getAdminAt()` to enumerate.
     */
    function getAdminCount() public view virtual override returns (uint256) {
        return administrators.length();
    }

    /**
     * @dev Returns the administrator at the index.
     * @dev Use with `getAdminCount()` to enumerate.
     */
    function getAdminAt(uint256 index)
        public
        view
        virtual
        override
        returns (address)
    {
        return administrators.at(index);
    }

    /**
     * @dev Returns the list of administrators
     */
    function getAdmins()
        public
        view
        virtual
        override
        returns (address[] memory)
    {
        return administrators.values();
    }

    /**
     * @dev Sets the Chainalysis sanctions oracle.
     * @dev setting this to the zero address disables sanctions compliance.
     * @dev Don't disable sanctions compliance unless there is some problem
     * with the sanctions oracle.
     */
    function setSanctionsList(ChainalysisSanctionsList _sanctionsList)
        public
        virtual
        override
        onlyOwner
    {
        sanctionsList = _sanctionsList;
    }

    /**
     * @dev Returns `true` if `account` is under OFAC sanctions.
     * @dev Returns `false` if sanctions compliance is disabled.
     */
    function isSanctioned(address account)
        public
        view
        virtual
        override
        returns (bool)
    {
        return (address(sanctionsList) != address(0) &&
            sanctionsList.isSanctioned(account));
    }

    /* ################################################################
     * Registration / Ownership
     * ##############################################################*/

    /**
     * @dev Registers the calling resource and sets the resource owner.
     * @dev Grants the default administrator role for the resource to the
     * resource owner.
     *
     * Requirements:
     * - caller SHOULD be a contract
     * - caller MUST NOT be already registered
     * - `owner` MUST NOT be the zero address
     * - `owner` MUST NOT be globally banned
     * - `owner` MUST NOT be under OFAC sanctions
     */
    function register(address owner) public virtual override {
        // require(
        //     Address.isContract(_msgSender()),
        //     "AccessServer: must be contract"
        // );
        ResourcePolicy storage policy = managedResources[_msgSender()];
        require(policy.owner == address(0), "AccessServer: already registered");
        _setResourceOwner(_msgSender(), owner);
        emit ResourceRegistration(_msgSender());
    }

    /**
     * @dev Returns `true` if `resource` is registered.
     */
    function isRegistered(address resource)
        public
        view
        virtual
        override
        returns (bool)
    {
        return managedResources[resource].owner != address(0);
    }

    /**
     * @dev Returns the owner of `resource`.
     */
    function getResourceOwner(address resource)
        public
        view
        virtual
        override
        returns (address)
    {
        return managedResources[resource].owner;
    }

    /**
     * @dev Returns the owner of the calling resource.
     */
    function getMyOwner() public view virtual override returns (address) {
        return getResourceOwner(_msgSender());
    }

    /**
     * @dev Sets the owner for the calling resource.
     *
     * Requirements:
     * - caller MUST be a registered resource
     * - `operator` MUST be the current owner
     * - `newOwner` MUST NOT be the zero address
     * - `newOwner` MUST NOT be globally banned
     * - `newOwner` MUST NOT be banned by the calling resource
     * - `newOwner` MUST NOT be under OFAC sanctions
     * - `newOwner` MUST NOT be the current owner
     */
    function setMyOwner(address operator, address newOwner)
        public
        virtual
        override
        registeredResource
    {
        enforceIsOwner(_msgSender(), operator);
        require(newOwner != getMyOwner(), "AccessControl: already owner");
        _setResourceOwner(_msgSender(), newOwner);
    }

    function _setResourceOwner(address resource, address newOwner)
        internal
        virtual
    {
        require(
            newOwner != address(0),
            "Ownable: new owner is the zero address"
        );
        enforceIsNotBanned(resource, newOwner);
        managedResources[resource].owner = newOwner;
        _do_grant_role(resource, DEFAULT_ADMIN, newOwner);
    }

    /* ################################################################
     * Role Administration
     * ##############################################################*/

    /**
     * @dev Returns the admin role that controls `role` by default for all
     * resources. See {grantRole} and {revokeRole}.
     *
     * To change a role's admin, use {_setRoleAdmin}.
     */
    function getGlobalRoleAdmin(bytes32 role)
        public
        view
        virtual
        override
        returns (bytes32)
    {
        return _getRoleAdmin(GLOBAL_RESOURCE, role);
    }

    /**
     * @dev Returns the admin role that controls `role` for a resource.
     * See {grantRole} and {revokeRole}.
     *
     * To change a role's admin, use {_setRoleAdmin}.
     */
    function getRoleAdminForResource(address resource, bytes32 role)
        public
        view
        virtual
        override
        returns (bytes32)
    {
        bytes32 roleAdmin = _getRoleAdmin(resource, role);
        if (roleAdmin == DEFAULT_ADMIN) {
            return getGlobalRoleAdmin(role);
        }

        return roleAdmin;
    }

    /**
     * @dev Returns the admin role that controls `role` for the calling resource.
     * See {grantRole} and {revokeRole}.
     *
     * To change a role's admin, use {_setRoleAdmin}.
     */
    function getMyRoleAdmin(bytes32 role)
        public
        view
        virtual
        override
        returns (bytes32)
    {
        return getRoleAdminForResource(_msgSender(), role);
    }

    function _getRoleAdmin(address resource, bytes32 role)
        internal
        view
        returns (bytes32)
    {
        return managedResources[resource].roles[role].adminRole;
    }

    /**
     * @dev Sets `adminRole` as ``role``'s admin role on as default all
     * resources.
     *
     * Requirements:
     * - caller MUST be an an administrator of this AccessServer
     */
    function setGlobalRoleAdmin(bytes32 role, bytes32 adminRole)
        public
        virtual
        override
        onlyAdministrator
    {
        bytes32 previousAdminRole = _getRoleAdmin(GLOBAL_RESOURCE, role);
        _setRoleAdmin(GLOBAL_RESOURCE, role, adminRole);
        emit GlobalRoleAdminChanged(role, previousAdminRole, adminRole);
    }

    /**
     * @dev Sets `adminRole` as ``role``'s admin role on the calling resource.
     * @dev There is no set roleAdminForResource vs setRoleAdminForMe.
     * @dev Resources must manage their own role admins or use the global
     * defaults.
     *
     * Requirements:
     * - caller MUST be a registered resource
     */
    function setRoleAdmin(
        address operator,
        bytes32 role,
        bytes32 adminRole
    ) public virtual override registeredResource {
        enforceOwnerOrRole(_msgSender(), DEFAULT_ADMIN, operator);
        _setRoleAdmin(_msgSender(), role, adminRole);
    }

    function _setRoleAdmin(
        address resource,
        bytes32 role,
        bytes32 adminRole
    ) internal virtual {
        managedResources[resource].roles[role].adminRole = adminRole;
    }

    /* ################################################################
     * Checking Role Membership
     * ##############################################################*/

    /**
     * @dev Returns `true` if `account` has been granted `role` as default for
     * all resources.
     */
    function hasGlobalRole(bytes32 role, address account)
        public
        view
        virtual
        override
        returns (bool)
    {
        return hasLocalRole(GLOBAL_RESOURCE, role, account);
    }

    /**
     * @dev Returns `true` if `account` has been granted `role` globally or for
     * `resource`.
     */
    function hasRole(
        address resource,
        bytes32 role,
        address account
    ) public view virtual override returns (bool) {
        return (hasGlobalRole(role, account) ||
            hasLocalRole(resource, role, account));
    }

    /**
     * @dev Returns `true` if `account` has been granted `role` for `resource`.
     */
    function hasLocalRole(
        address resource,
        bytes32 role,
        address account
    ) public view virtual override returns (bool) {
        return managedResources[resource].roles[role].members[account];
    }

    /**
     * @dev Returns `true` if `account` has been granted `role` globally or for
     * the calling resource.
     */
    function hasRoleForMe(bytes32 role, address account)
        public
        view
        virtual
        override
        returns (bool)
    {
        return hasRole(_msgSender(), role, account);
    }

    /**
     * @dev Returns `true` if account` is banned globally or from `resource`.
     */
    function isBanned(address resource, address account)
        public
        view
        virtual
        override
        returns (bool)
    {
        return hasRole(resource, BANNED, account);
    }

    /**
     * @dev Returns `true` if account` is banned globally or from the calling
     * resource.
     */
    function isBannedForMe(address account)
        public
        view
        virtual
        override
        returns (bool)
    {
        return hasRole(_msgSender(), BANNED, account);
    }

    /**
     * @dev Reverts if `account` has not been granted `role` globally or for
     * `resource`.
     */
    function checkRole(
        address resource,
        bytes32 role,
        address account
    ) public view virtual override {
        if (!hasRole(resource, role, account)) {
            revert(
                string.concat(
                    "AccessControl: account ",
                    Strings.toHexString(uint160(account), 20),
                    " is missing role ",
                    Strings.toHexString(uint256(role), 32)
                )
            );
        }
    }

    /**
     * @dev Reverts if `account` has not been granted `role` globally or for
     * the calling resource.
     */
    function checkRoleForMe(bytes32 role, address account)
        public
        view
        virtual
        override
    {
        checkRole(_msgSender(), role, account);
    }

    /* ################################################################
     * Granting Roles
     * ##############################################################*/

    /**
     * @dev Grants `role` to `account` as default for all resources.
     * @dev Warning: This function can do silly things like applying a global
     * ban to a resource owner.
     *
     * Requirements:
     * - caller MUST be an an administrator of this AccessServer
     * - If `role` is not BANNED, `account` MUST NOT be banned or
     *   under OFAC sanctions. Roles cannot be granted to such accounts.
     */
    function grantGlobalRole(bytes32 role, address account)
        public
        virtual
        override
        onlyAdministrator
    {
        if (role != BANNED) {
            enforceIsNotBanned(GLOBAL_RESOURCE, account);
        }
        if (!hasGlobalRole(role, account)) {
            _do_grant_role(GLOBAL_RESOURCE, role, account);
            emit GlobalRoleGranted(role, account, _msgSender());
        }
    }

    /**
     * @dev Grants `role` to `account` for the calling resource as `operator`.
     * @dev There is no set grantRoleForResource vs grantRoleForMe.
     * @dev Resources must manage their own roles or use the global defaults.
     *
     * Requirements:
     * - caller MUST be a registered resource
     * - `operator` SHOULD be the account that called `grantRole()` on the
     *    calling resource.
     * - `operator` MUST be the resource owner or have the role admin role
     *    for `role` on the calling resource.
     * - If `role` is BANNED, `account` MUST NOT be the resource
     *   owner. You can't ban the owner.
     * - If `role` is not BANNED, `account` MUST NOT be banned or
     *   under OFAC sanctions. Roles cannot be granted to such accounts.
     */
    function grantRole(
        address operator,
        bytes32 role,
        address account
    ) public virtual override registeredResource {
        _grantRole(_msgSender(), operator, role, account);
    }

    function _grantRole(
        address resource,
        address operator,
        bytes32 role,
        address account
    ) internal virtual {
        enforceIsNotBanned(resource, operator);
        if (role == BANNED) {
            enforceIsModerator(resource, operator);
            require(
                account != getResourceOwner(resource),
                "AccessControl: ban owner"
            );
        } else {
            enforceIsNotBanned(resource, account);
            if (operator != getResourceOwner(resource)) {
                checkRole(
                    resource,
                    getRoleAdminForResource(resource, role),
                    operator
                );
            }
        }

        _do_grant_role(resource, role, account);
    }

    function _do_grant_role(
        address resource,
        bytes32 role,
        address account
    ) internal virtual {
        if (!hasRole(resource, role, account)) {
            managedResources[resource].roles[role].members[account] = true;
            managedResources[resource].roleMembers[role].add(account);
        }
    }

    /* ################################################################
     * Revoking / Renouncing Roles
     * ##############################################################*/

    /**
     * @dev Revokes `role` as default for all resources from `account`.
     *
     * Requirements:
     * - caller MUST be an an administrator of this AccessServer
     */
    function revokeGlobalRole(bytes32 role, address account)
        public
        virtual
        override
        onlyAdministrator
    {
        _do_revoke_role(GLOBAL_RESOURCE, role, account);
        emit GlobalRoleRevoked(role, account, _msgSender());
    }

    /**
     * @dev Revokes `role` from `account` for the calling resource as
     * `operator`.
     *
     * Requirements:
     * - caller MUST be a registered resource
     * - `operator` SHOULD be the account that called `revokeRole()` on the
     *    calling resource.
     * - `operator` MUST be the resource owner or have the role admin role
     *    for `role` on the calling resource.
     * - if `role` is DEFAULT_ADMIN, `account` MUST NOT be the calling
     *   resource's owner. The admin role cannot be revoked from the owner.
     */
    function revokeRole(
        address operator,
        bytes32 role,
        address account
    ) public virtual override registeredResource {
        enforceIsNotBanned(_msgSender(), operator);
        require(
            role != DEFAULT_ADMIN ||
                account != getResourceOwner(_msgSender()),
            "AccessControl: revoke admin from owner"
        );

        if (role == BANNED) {
            enforceIsModerator(_msgSender(), operator);
        } else {
            enforceOwnerOrRole(
                _msgSender(),
                getRoleAdminForResource(_msgSender(), role),
                operator
            );
        }

        _do_revoke_role(_msgSender(), role, account);
    }

    /**
     * @dev Remove the default role for yourself. You will still have the role
     * for any resources where it was granted individually.
     *
     * Requirements:
     * - caller MUST have the role they are renouncing at the global level.
     * - `role` MUST NOT be BANNED. You can't unban yourself.
     */
    function renounceRoleGlobally(bytes32 role) public virtual override {
        require(role != BANNED, "AccessControl: self unban");
        _do_revoke_role(GLOBAL_RESOURCE, role, _msgSender());
        emit GlobalRoleRevoked(role, _msgSender(), _msgSender());
    }

    /**
     * @dev Renounces `role` for the calling resource as `operator`.
     *
     * Requirements:
     * - caller MUST be a registered resource
     * - `operator` SHOULD be the account that called `renounceRole()` on the
     *    calling resource.
     * - `operator` MUST have the role they are renouncing on the calling
     *   resource.
     * - if `role` is DEFAULT_ADMIN, `operator` MUST NOT be the calling
     *   resource's owner. The owner cannot renounce the admin role.
     * - `role` MUST NOT be BANNED. You can't unban yourself.
     */
    function renounceRole(address operator, bytes32 role)
        public
        virtual
        override
        registeredResource
    {
        require(
            role != DEFAULT_ADMIN ||
                operator != getResourceOwner(_msgSender()),
            "AccessControl: owner renounce admin"
        );
        require(role != BANNED, "AccessControl: self unban");
        _do_revoke_role(_msgSender(), role, operator);
    }

    function _do_revoke_role(
        address resource,
        bytes32 role,
        address account
    ) internal virtual {
        checkRole(_msgSender(), role, account);
        require(
            resource == GLOBAL_RESOURCE ||
                hasLocalRole(resource, role, account),
            "AccessServer: role must be removed globally"
        );
        managedResources[resource].roles[role].members[account] = false;
        managedResources[resource].roleMembers[role].remove(account);
    }

    /* ################################################################
     * Enumerating Role Members
     * ##############################################################*/

    /**
     * @dev Returns the number of accounts that have `role` set at the global
     * level.
     * @dev Use with `getGlobalRoleMember()` to enumerate.
     */
    function getGlobalRoleMemberCount(bytes32 role)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return _getRoleMemberCount(GLOBAL_RESOURCE, role);
    }

    /**
     * @dev Returns one of the accounts that have `role` set at the global
     * level.
     * @dev Use with `getGlobalRoleMemberCount()` to enumerate.
     *
     * Requirements:
     * `index` MUST be >= 0 and < `getGlobalRoleMemberCount(role)`
     */
    function getGlobalRoleMember(bytes32 role, uint256 index)
        public
        view
        virtual
        override
        returns (address)
    {
        return managedResources[GLOBAL_RESOURCE].roleMembers[role].at(index);
    }

    /**
     * @dev Returns the list of accounts that have `role` set at the global
     * level.
     */
    function getGlobalRoleMembers(bytes32 role)
        public
        view
        virtual
        override
        returns (address[] memory)
    {
        return managedResources[GLOBAL_RESOURCE].roleMembers[role].values();
    }

    /**
     * @dev Returns the number of accounts that have `role` set globally or for 
     * `resource`.
     * @dev Use with `getRoleMember()` to enumerate.
     */
    function getRoleMemberCount(address resource, bytes32 role)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return _getRoleMemberCount(resource, role);
    }

    /**
     * @dev Returns one of the accounts that have `role` set globally or for 
     * `resource`. 
     * @dev If a role has global and local members, the global members 
     * will be returned first.
     * @dev If a user has the role globally and locally, the same user will be 
     * returned at two different indexes.
     * @dev If you only want locally assigned role members, start the index at
     * `getGlobalRoleMemberCount(role)`.
     * @dev Use with `getRoleMemberCount()` to enumerate.
     *
     * Requirements:
     * `index` MUST be >= 0 and < `getRoleMemberCount(role)`
     */
    function getRoleMember(
        address resource,
        bytes32 role,
        uint256 index
    ) public view virtual override returns (address) {
        return _getRoleMemberForResourceAtIndex(resource, role, index);
    }

    /**
     * @dev Returns the number of accounts that have `role` set globally or for 
     * the calling resource.
     * @dev Use with `getMyRoleMember()` to enumerate.
     */
    function getMyRoleMemberCount(bytes32 role)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return _getMemberCountForResource(_msgSender(), role);
    }

    /**
     * @dev Returns one of the accounts that have `role` set globally or for 
     * the calling resource.
     * @dev If a role has global and local members, the global members 
     * will be returned first.
     * @dev If a user has the role globally and locally, the same user will be 
     * returned at two different indexes.
     * @dev If you only want locally assigned role members, start the index at
     * `getGlobalRoleMemberCount(role)`.
     * @dev Use with `getMyRoleMemberCount()` to enumerate.
     *
     * Requirements:
     * `index` MUST be >= 0 and < `getMyRoleMemberCount(role)`
     */
    function getMyRoleMember(bytes32 role, uint256 index)
        public
        view
        virtual
        override
        returns (address)
    {
        return _getRoleMemberForResourceAtIndex(_msgSender(), role, index);
    }

    function _getMemberCountForResource(address resource, bytes32 role)
        internal
        view
        virtual
        returns (uint256)
    {
        return
            getGlobalRoleMemberCount(role) +
            _getRoleMemberCount(resource, role);
    }

    function _getRoleMemberForResourceAtIndex(
        address resource,
        bytes32 role,
        uint256 index
    ) internal view virtual returns (address) {
        uint256 globalCount = getGlobalRoleMemberCount(role);
        if (index < globalCount) {
            return getGlobalRoleMember(role, index);
        }

        return
            managedResources[resource].roleMembers[role].at(
                index - globalCount
            );
    }

    function _getRoleMemberCount(address resource, bytes32 role)
        internal
        view
        virtual
        returns (uint256)
    {
        return managedResources[resource].roleMembers[role].length();
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[47] private __gap;
}
