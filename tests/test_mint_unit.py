'''
Created on Nov 24, 2021

@author: jdavis
'''
import pytest

from brownie import network

from scripts import vicinity
from scripts.util import network_utils

from . import test_helper

def test_minting():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_minting running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Mint Unit Test", "MUT-0", as_account=account)
    
    vicinity.mint(10000)
    
    assert vicinity_contract.totalSupply() == 10000
    assert vicinity_contract.balanceOf(account) == 10000
    
def test_minting_permissions():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_minting_permissions running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Mint Unit Test", "MUT-1", as_account=account)
    test_helper.setup_roles()
    
    admin = network_utils.get_account(index=1)
    minter = network_utils.get_account(index=2)
    airdropper = network_utils.get_account(index=3)
    regular_user = network_utils.get_account(index=4)
    
    vicinity.mint(10000, as_account=minter)
    assert vicinity_contract.totalSupply() == 10000
    assert vicinity_contract.balanceOf(minter) == 10000
    
    with pytest.raises(Exception):
        vicinity.mint(10000, as_account=airdropper)
    
    assert vicinity_contract.totalSupply() == 10000
    
    with pytest.raises(Exception):
        vicinity.mint(10000, as_account=admin)
    
    assert vicinity_contract.totalSupply() == 10000
    
    with pytest.raises(Exception):
        vicinity.mint(10000, as_account=regular_user)
    
    assert vicinity_contract.totalSupply() == 10000
    
    vicinity.mint(10000, as_account=minter)
    assert vicinity_contract.totalSupply() == 20000
    assert vicinity_contract.balanceOf(minter) == 20000
    
def test_cant_mint_while_paused():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_cant_mint_while_paused running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Mint Unit Test", "MUT-2", as_account=account)
    
    assert vicinity_contract.totalSupply() == 0
    
    vicinity.pause()
    with pytest.raises(Exception):
        vicinity.mint(10000)
    assert vicinity_contract.totalSupply() == 0
        
    vicinity.unpause()
    vicinity.mint(10000)
    assert vicinity_contract.totalSupply() == 10000