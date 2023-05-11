'''
Created on Nov 24, 2021

@author: jdavis
'''
import pytest

from brownie import network

from scripts import vicinity
from scripts.util import network_utils

from . import test_helper

# This is gone.
# def test_burn_for_user():
#     if not network_utils.is_local():
#         pytest.skip("We only run this test on development")
#
#     print(f"test_minting running on {network.show_active()}")
#
#     account = network_utils.get_account()
#     vicinity_contract = vicinity.deploy("Burn Unit Test", "BUT-0", as_account=account)
#
#     vicinity.mint(10000)
#     burned_user = network_utils.get_account(index=5)
#     vicinity.transfer(burned_user, 1000)
#
#     vicinity.burn(500, from_account=burned_user)
#     assert vicinity_contract.totalSupply() == 9500
#     assert vicinity_contract.balanceOf(burned_user) == 500
#
#     # Can't burn more funds than are in the account
#     with pytest.raises(Exception):
#         vicinity.burn(2000, from_account=burned_user)
#     assert vicinity_contract.totalSupply() == 9500
#     assert vicinity_contract.balanceOf(burned_user) == 500
    
def test_burn_for_owner():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_minting running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Burn Unit Test", "BUT-1", as_account=account)
    
    vicinity.mint(10000)
    vicinity.burn(5000)
    assert vicinity_contract.totalSupply() == 5000
    assert vicinity_contract.balanceOf(account) == 5000
    
    # Can't burn more funds than are in the account
    with pytest.raises(Exception):
        vicinity.burn(7000)
    assert vicinity_contract.totalSupply() == 5000
    assert vicinity_contract.balanceOf(account) == 5000
    
def test_pause_effect_on_burn():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_minting running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Burn Unit Test", "BUT-2", as_account=account)
    
    vicinity.mint(10000)
    burned_user = network_utils.get_account(index=5)
    vicinity.transfer(burned_user, 1000)
    
    vicinity.pause()
    
    # Burn for user functionality is removed:
    # vicinity.burn(500, from_account=burned_user)
    # assert vicinity_contract.totalSupply() == 9500
    # assert vicinity_contract.balanceOf(burned_user) == 500
    
    # Burn for owner does not work when paused:
    with pytest.raises(Exception):
        vicinity.burn(7000)
    assert vicinity_contract.totalSupply() == 10000
    assert vicinity_contract.balanceOf(account) == 9000
    
def test_burn_permissions():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_minting running on {network.show_active()}")
    
    owner = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Burn Unit Test", "BUT-2", as_account=owner)
    vicinity.mint(10000)
    
    test_helper.setup_roles()
    admin = network_utils.get_account(index=1)
    minter = network_utils.get_account(index=2)
    airdropper = network_utils.get_account(index=3)
    regular_user = network_utils.get_account(index=4)
    burned_user = network_utils.get_account(index=5)
    
    vicinity.airdrop(
        [admin, minter, airdropper, regular_user, burned_user], 
        [1000]*5,
    )
    
    # Nobody can burn for user
    # with pytest.raises(Exception):
    #     vicinity.burn(100, from_account=burned_user, as_account=admin)
    # with pytest.raises(Exception):
    #     vicinity.burn(100, from_account=burned_user, as_account=airdropper)
    # with pytest.raises(Exception):
    #     vicinity.burn(100, from_account=burned_user, as_account=regular_user)
    # with pytest.raises(Exception):
    #     vicinity.burn(100, from_account=burned_user, as_account=burned_user)
    # assert vicinity_contract.balanceOf(burned_user) == 1000
    # assert vicinity_contract.totalSupply() == 10000
    #
    # vicinity.burn(100, from_account=burned_user, as_account=owner)
    # assert vicinity_contract.balanceOf(burned_user) == 900
    # vicinity.burn(100, from_account=burned_user, as_account=minter)
    # assert vicinity_contract.balanceOf(burned_user) == 800
    # assert vicinity_contract.totalSupply() == 9800
    
    # Only owner or minter can burn for owner
    with pytest.raises(Exception):
        vicinity.burn(100, as_account=admin)
    with pytest.raises(Exception):
        vicinity.burn(100, as_account=airdropper)
    with pytest.raises(Exception):
        vicinity.burn(100, as_account=regular_user)
    with pytest.raises(Exception):
        vicinity.burn(100, as_account=burned_user)
    assert vicinity_contract.totalSupply() == 10000
        
    vicinity.burn(100, as_account=owner)
    assert vicinity_contract.totalSupply() == 9900
    vicinity.burn(100, as_account=minter)
    assert vicinity_contract.totalSupply() == 9800