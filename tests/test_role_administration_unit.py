'''
Created on Nov 24, 2021

@author: jdavis
'''

import pytest

from brownie import network

from scripts import vicinity
from scripts.vicinity import Roles
from scripts.util import network_utils

from . import test_helper

def test_add_remove_role():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_add_remove_role running on {network.show_active()}")
    
    owner = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Role Unit Test", "RUT-0", as_account=owner)
    test_helper.setup_roles()
    
    admin = network_utils.get_account(index=1)
    minter = network_utils.get_account(index=2)
    airdropper = network_utils.get_account(index=3)
    regular_user = network_utils.get_account(index=4)
    regular_user_1 = network_utils.get_account(index=5)
    regular_user_2 = network_utils.get_account(index=6)
    
    with pytest.raises(Exception):
        # Minter can't grant roles
        vicinity.grant_role(Roles.AIRDROPPER, regular_user_1, as_account=minter)
    
    with pytest.raises(Exception):
        # airdropper can't grant roles
        vicinity.grant_role(Roles.AIRDROPPER, regular_user_1, as_account=airdropper)
    
    with pytest.raises(Exception):
        # regular_user can't grant roles
        vicinity.grant_role(Roles.AIRDROPPER, regular_user_1, as_account=regular_user)
        
    vicinity.grant_role(Roles.ADMIN, regular_user_1, as_account=owner)
    assert vicinity_contract.hasRole(Roles.ADMIN.value, regular_user_1)
    vicinity.grant_role(Roles.AIRDROPPER, regular_user_2, as_account=admin)
    assert vicinity_contract.hasRole(Roles.AIRDROPPER.value, regular_user_2)
    vicinity.grant_role(Roles.AIRDROPPER, regular_user_1, as_account=regular_user_1)
    assert vicinity_contract.hasRole(Roles.AIRDROPPER.value, regular_user_1)
    
    with pytest.raises(Exception):
        # Minter can't revoke roles
        vicinity.revoke_role(Roles.AIRDROPPER, regular_user_1, as_account=minter)
    
    with pytest.raises(Exception):
        # airdropper can't revoke roles
        vicinity.revoke_role(Roles.AIRDROPPER, regular_user_1, as_account=airdropper)
    
    with pytest.raises(Exception):
        # regular_user can't revoke roles
        vicinity.revoke_role(Roles.AIRDROPPER, regular_user_1, as_account=regular_user)
        
    vicinity.revoke_role(Roles.AIRDROPPER, regular_user_1, as_account=regular_user_1)
    assert not vicinity_contract.hasRole(Roles.AIRDROPPER.value, regular_user_1)
    vicinity.revoke_role(Roles.AIRDROPPER, regular_user_2, as_account=admin)
    assert not vicinity_contract.hasRole(Roles.AIRDROPPER.value, regular_user_2)
    vicinity.revoke_role(Roles.ADMIN, regular_user_1, as_account=owner)
    assert not vicinity_contract.hasRole(Roles.ADMIN.value, regular_user_1)
    
    vicinity.renounce_role(Roles.ADMIN, as_account=admin)
    assert not vicinity_contract.hasRole(Roles.ADMIN.value, admin)
    vicinity.renounce_role(Roles.MINTER, as_account=minter)
    assert not vicinity_contract.hasRole(Roles.MINTER.value, minter)
    vicinity.renounce_role(Roles.AIRDROPPER, as_account=airdropper)
    assert not vicinity_contract.hasRole(Roles.AIRDROPPER.value, airdropper)
    
def test_ownership_rules():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_add_remove_role running on {network.show_active()}")
    
    owner = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Role Unit Test", "RUT-1", as_account=owner)
    
    with pytest.raises(Exception):
        vicinity.renounce_role(Roles.ADMIN, as_account=owner)
    
    with pytest.raises(Exception):
        vicinity.revoke_role(Roles.ADMIN, owner, as_account=owner)
    
    with pytest.raises(Exception):
        vicinity.renounce_role(Roles.ADMIN, as_account=owner)
    
    new_owner = network_utils.get_account(index=1)
    vicinity.transfer_ownership(new_owner)
    # should automatically get ADMIN role
    assert vicinity_contract.hasRole(Roles.ADMIN.value, new_owner)
    
    # now old owner can renounce admin role.
    vicinity.renounce_role(Roles.ADMIN, as_account=owner)
    assert not vicinity_contract.hasRole(Roles.ADMIN.value, owner)