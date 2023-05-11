'''
Created on Nov 24, 2021

@author: jdavis
'''
import pytest

from brownie import network

from scripts import vicinity
from scripts.util import network_utils

from . import test_helper

def test_blacklist_user():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_update_locking_time running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Lock Unit Test", "BLT-0", as_account=account)
    vicinity.mint(10000)
    
    crook = network_utils.get_account(index=5)
    accomplice = network_utils.get_account(index=6)
    
    vicinity.transfer(crook, 1000)
    vicinity.transfer(accomplice, 1000)
    
    # before blacklist
    vicinity.transfer(accomplice, 100, as_account=crook)
    assert vicinity_contract.balanceOf(crook) == 900
    assert vicinity_contract.balanceOf(accomplice) == 1100
    
    vicinity.add_black_list(crook)
    
    with pytest.raises(Exception):
        vicinity.transfer(accomplice, 100, as_account=crook)
    with pytest.raises(Exception):
        vicinity.transfer(crook, 100, as_account=accomplice)
    assert vicinity_contract.balanceOf(crook) == 900
    assert vicinity_contract.balanceOf(accomplice) == 1100
    
    # even contract owner can't transfer to crook 
    with pytest.raises(Exception):
        vicinity.transfer(crook, 100, as_account=account)
    
    vicinity.remove_black_list(crook)
    vicinity.transfer(accomplice, 100, as_account=crook)
    assert vicinity_contract.balanceOf(crook) == 800
    assert vicinity_contract.balanceOf(accomplice) == 1200
    
    vicinity.transfer(crook, 100, as_account=accomplice)
    assert vicinity_contract.balanceOf(crook) == 900
    assert vicinity_contract.balanceOf(accomplice) == 1100
    
def test_blacklist_cant_workaround_with_allowances():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_update_locking_time running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Lock Unit Test", "BLT-1", as_account=account)
    vicinity.mint(10000)
    
    crook = network_utils.get_account(index=5)
    accomplices = [
        network_utils.get_account(index=n) for n in range(6,10)
    ]
    
    vicinity.transfer(crook, 1000)
    for accomplice in accomplices:
        vicinity.transfer(accomplice, 1000)

    # crook is allowed to spend 100 tokens on behalf of accomplices[0]
    vicinity.approve(100, crook, as_account=accomplices[0])
    vicinity.transfer(account, 10, accomplices[0], as_account=crook)
    assert vicinity_contract.balanceOf(accomplices[0]) == 990
    
    # accomplices[1] is allowed to spend 100 tokens on behalf of crook
    vicinity.approve(100, accomplices[1], as_account=crook)
    vicinity.transfer(account, 10, crook, as_account=accomplices[1])
    assert vicinity_contract.balanceOf(crook) == 990
    
    vicinity.add_black_list(crook)
    # crook can no longer spend tokens on behalf of accomplices[0]
    with pytest.raises(Exception):
        vicinity.transfer(account, 10, accomplices[0], as_account=crook)
        
    # accomplices[1] can no longer spend tokens on behalf of crook
    with pytest.raises(Exception):
        vicinity.transfer(account, 10, crook, as_account=accomplices[1])
        
    # crook can't create new allowance to accomplices[2]
    with pytest.raises(Exception):
        vicinity.approve(100, accomplices[2], as_account=crook)
        
    # accomplices[3] can't create new allowance to crook
    with pytest.raises(Exception):
        vicinity.approve(100, crook, as_account=accomplices[0])
        
    # crook can't increase or decrease allowance to accomplices[1]
    with pytest.raises(Exception):
        vicinity.change_allowance(-50, accomplices[1], as_account=crook)
    with pytest.raises(Exception):
        vicinity.change_allowance(50, accomplices[1], as_account=crook)
        
    # accomplices[0] can't increase or decrease allowance to crook 
    with pytest.raises(Exception):
        vicinity.change_allowance(-50, crook, as_account=accomplices[0])
    with pytest.raises(Exception):
        vicinity.change_allowance(50, crook, as_account=accomplices[0])
        
def test_can_only_destroy_blacklisted_funds():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_update_locking_time running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Lock Unit Test", "BLT-2", as_account=account)
    vicinity.mint(10000)
    assert vicinity_contract.totalSupply() == 10000
    
    crook = network_utils.get_account(index=5)
    innocent_bystander = network_utils.get_account(index=6)
    
    vicinity.transfer(crook, 1000)
    vicinity.transfer(innocent_bystander, 1000)
    vicinity.add_black_list(crook)
    
    # destroying blacklisted users funds burns them and removes from supply.
    vicinity.destroy_black_funds(crook)
    assert vicinity_contract.balanceOf(crook) == 0
    assert vicinity_contract.totalSupply() == 9000
    
    # can't destroy funds from not blacklisted user
    with pytest.raises(Exception):
        vicinity.destroy_black_funds(innocent_bystander)
    assert vicinity_contract.balanceOf(innocent_bystander) == 1000
    
    # clearing user does NOT restore funds
    vicinity.remove_black_list(crook)
    assert vicinity_contract.balanceOf(crook) == 0
    
def test_only_owner_can_blacklist():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    owner = network_utils.get_account(index=0)    
    print(f"test_update_locking_time running on {network.show_active()}")
    vicinity.deploy("Lock Unit Test", "BLT-3", as_account=owner)  # @UnusedVariable
    vicinity.mint(10000)
    
    test_helper.setup_roles()
    admin = network_utils.get_account(index=1)
    minter = network_utils.get_account(index=2)
    airdropper = network_utils.get_account(index=3)
    regular_user = network_utils.get_account(index=4)
    
    crook = network_utils.get_account(index=5)
    vicinity.transfer(crook, 1000)
    
    # only owner can blacklist
    with pytest.raises(Exception):
        vicinity.add_black_list(crook, as_account=admin)
    with pytest.raises(Exception):
        vicinity.add_black_list(crook, as_account=minter)
    with pytest.raises(Exception):
        vicinity.add_black_list(crook, as_account=airdropper)
    with pytest.raises(Exception):
        vicinity.add_black_list(crook, as_account=regular_user)
    with pytest.raises(Exception):
        vicinity.add_black_list(crook, as_account=crook)
    vicinity.add_black_list(crook, as_account=owner)
    
    # only owner can destroy funds
    with pytest.raises(Exception):
        vicinity.destroy_black_funds(crook, as_account=admin)
    with pytest.raises(Exception):
        vicinity.destroy_black_funds(crook, as_account=minter)
    with pytest.raises(Exception):
        vicinity.destroy_black_funds(crook, as_account=airdropper)
    with pytest.raises(Exception):
        vicinity.destroy_black_funds(crook, as_account=regular_user)
    with pytest.raises(Exception):
        vicinity.destroy_black_funds(crook, as_account=crook)
    vicinity.destroy_black_funds(crook, as_account=owner)
    
    # only owner can remove from blacklist
    with pytest.raises(Exception):
        vicinity.remove_black_list(crook, as_account=admin)
    with pytest.raises(Exception):
        vicinity.remove_black_list(crook, as_account=minter)
    with pytest.raises(Exception):
        vicinity.remove_black_list(crook, as_account=airdropper)
    with pytest.raises(Exception):
        vicinity.remove_black_list(crook, as_account=regular_user)
    with pytest.raises(Exception):
        vicinity.remove_black_list(crook, as_account=crook)
    vicinity.remove_black_list(crook, as_account=owner)