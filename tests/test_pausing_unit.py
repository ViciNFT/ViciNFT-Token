'''
Created on Nov 24, 2021

@author: jdavis
'''
# TODO: test permissions around pausing/unpausing
# other tests check whether pausing/unpausing affects their tested functions.
import pytest

from brownie import network

from scripts import vicinity
from scripts.util import network_utils

from . import test_helper

def test_only_owner_can_pause():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_minting_permissions running on {network.show_active()}")
    
    owner = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Pause Unit Test", "PUT-1", as_account=owner)
    test_helper.setup_roles()
    
    admin = network_utils.get_account(index=1)
    minter = network_utils.get_account(index=2)
    airdropper = network_utils.get_account(index=3)
    regular_user = network_utils.get_account(index=4)
    assert not vicinity_contract.paused()
    
    with pytest.raises(Exception):
        vicinity.pause(as_account=admin)
    with pytest.raises(Exception):
        vicinity.pause(as_account=minter)
    with pytest.raises(Exception):
        vicinity.pause(as_account=airdropper)
    with pytest.raises(Exception):
        vicinity.pause(as_account=regular_user)
    assert not vicinity_contract.paused()
    
    vicinity.pause(as_account=owner)
    assert vicinity_contract.paused()
    
def test_only_owner_can_unpause():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_minting_permissions running on {network.show_active()}")
    
    owner = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Pause Unit Test", "PUT-1", as_account=owner)
    test_helper.setup_roles()
    
    admin = network_utils.get_account(index=1)
    minter = network_utils.get_account(index=2)
    airdropper = network_utils.get_account(index=3)
    regular_user = network_utils.get_account(index=4)
    vicinity.pause(as_account=owner)
    assert vicinity_contract.paused()
    
    with pytest.raises(Exception):
        vicinity.unpause(as_account=admin)
    with pytest.raises(Exception):
        vicinity.unpause(as_account=minter)
    with pytest.raises(Exception):
        vicinity.unpause(as_account=airdropper)
    with pytest.raises(Exception):
        vicinity.unpause(as_account=regular_user)
    assert vicinity_contract.paused()
    
    vicinity.unpause(as_account=owner)
    assert not vicinity_contract.paused()