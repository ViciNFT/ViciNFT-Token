'''
Created on Nov 24, 2021

@author: jdavis
'''
import pytest

from brownie import network

from scripts import vicinity
from scripts.util import network_utils

from . import test_helper

def test_airdrop_no_lock():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_airdrop_no_lock running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy(
        "Airdrop Unit Test", 
        "AUT-0", 
        as_account=account,
    )
    vicinity.mint(10000)
    
    accounts = [
        network_utils.get_account(index=n) for n in range(5,10)
    ]
    amounts = [100] * 5
    
    vicinity.airdrop(accounts, amounts)
    
    assert vicinity_contract.totalSupply() == 10000
    assert vicinity_contract.balanceOf(account) == 9500
    for winner in accounts:
        assert vicinity_contract.balanceOf(winner) == 100
        assert not vicinity_contract.getLockingStatus(winner)
        
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, [100]*3)
        
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, [100]*7)

def test_airdrop_lock():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_airdrop_no_lock running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy(
        "Airdrop Unit Test", 
        "AUT-1", 
        as_account=account,
    )
    vicinity.mint(10000)
    
    accounts = [
        network_utils.get_account(index=n) for n in range(5,10)
    ]
    amounts = [100] * 5
    lock_days = [30] * 5
    
    vicinity.airdrop(accounts, amounts, lock_days)
    
    assert vicinity_contract.totalSupply() == 10000
    assert vicinity_contract.balanceOf(account) == 9500
    for winner in accounts:
        assert vicinity_contract.balanceOf(winner) == 100
        assert vicinity_contract.getLockingStatus(winner)
        
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, [100]*3, lock_days)
        
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, [100]*7, lock_days)
        
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, amounts, [100]*3)
        
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, amounts, [100]*7)
        
    vicinity.transfer(accounts[0], 100)
    assert vicinity_contract.balanceOf(accounts[0]) == 200
    assert vicinity_contract.checkLockingAmountByAddress(accounts[0]) == 100
        
def test_rollback_if_insufficient_funds():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_airdrop_no_lock running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy(
        "Airdrop Unit Test", 
        "AUT-2", 
        as_account=account,
    )
    vicinity.mint(10000)
    
    accounts = [
        network_utils.get_account(index=n) for n in range(5,10)
    ]
    amounts = [3000] * 5
    lock_days = [30] * 5
    
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, amounts)
        
    assert vicinity_contract.balanceOf(account) == 10000
    for winner in accounts:
        assert vicinity_contract.balanceOf(winner) == 0
    
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, amounts, lock_days)
        
    assert vicinity_contract.balanceOf(account) == 10000
    for winner in accounts:
        assert vicinity_contract.balanceOf(winner) == 0
        
def test_airdrop_permissions():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_airdrop_no_lock running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy(
        "Airdrop Unit Test", 
        "AUT-3", 
        as_account=account,
    )
    test_helper.setup_roles()
    admin = network_utils.get_account(index=1)
    minter = network_utils.get_account(index=2)
    airdropper = network_utils.get_account(index=3)
    regular_user = network_utils.get_account(index=4)
    
    vicinity.mint(40000, as_account=minter)
    vicinity.transfer(admin, 10000, as_account=minter)
    vicinity.transfer(airdropper, 10000, as_account=minter)
    vicinity.transfer(regular_user, 10000, as_account=minter)
    assert vicinity_contract.balanceOf(minter) == 10000
    assert vicinity_contract.balanceOf(admin) == 10000
    assert vicinity_contract.balanceOf(airdropper) == 10000
    assert vicinity_contract.balanceOf(regular_user) == 10000
    
    accounts = [
        network_utils.get_account(index=n) for n in range(5,10)
    ]
    amounts = [100] * 5
    lock_days = [30] * 5
    
    vicinity.airdrop(accounts, amounts, as_account=airdropper)
    assert vicinity_contract.totalSupply() == 40000
    assert vicinity_contract.balanceOf(airdropper) == 9500
    for winner in accounts:
        assert vicinity_contract.balanceOf(winner) == 100
        assert not vicinity_contract.getLockingStatus(winner)
    
    vicinity.airdrop(accounts, amounts, lock_days, as_account=airdropper)
    assert vicinity_contract.totalSupply() == 40000
    assert vicinity_contract.balanceOf(airdropper) == 9000
    for winner in accounts:
        assert vicinity_contract.balanceOf(winner) == 200
        assert vicinity_contract.getLockingStatus(winner)
    
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, amounts, as_account=admin)
    assert vicinity_contract.balanceOf(admin) == 10000
    
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, amounts, lock_days, as_account=admin)
    assert vicinity_contract.balanceOf(admin) == 10000
    
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, amounts, as_account=minter)
    assert vicinity_contract.balanceOf(minter) == 10000
    
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, amounts, lock_days, as_account=minter)
    assert vicinity_contract.balanceOf(minter) == 10000
    
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, amounts, as_account=regular_user)
    assert vicinity_contract.balanceOf(regular_user) == 10000
    
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, amounts, lock_days, as_account=regular_user)
    assert vicinity_contract.balanceOf(regular_user) == 10000
    
def test_cant_airdrop_while_paused():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_cant_airdrop_while_paused running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy(
        "Airdrop Unit Test", 
        "AUT-1", 
        as_account=account,
    )
    vicinity.mint(10000)
    
    accounts = [
        network_utils.get_account(index=n) for n in range(5,10)
    ]
    amounts = [100] * 5
    lock_days = [30] * 5
    
    vicinity.pause()
    
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, amounts)
        
    assert vicinity_contract.balanceOf(account) == 10000
    for winner in accounts:
        assert vicinity_contract.balanceOf(winner) == 0
    
    with pytest.raises(Exception):
        vicinity.airdrop(accounts, amounts, lock_days)
        
    assert vicinity_contract.balanceOf(account) == 10000
    for winner in accounts:
        assert vicinity_contract.balanceOf(winner) == 0
        
    vicinity.unpause()
    
    vicinity.airdrop(accounts, amounts)
    
    assert vicinity_contract.totalSupply() == 10000
    assert vicinity_contract.balanceOf(account) == 9500
    for winner in accounts:
        assert vicinity_contract.balanceOf(winner) == 100
        assert not vicinity_contract.getLockingStatus(winner)
    
    vicinity.airdrop(accounts, amounts, lock_days)
    
    assert vicinity_contract.totalSupply() == 10000
    assert vicinity_contract.balanceOf(account) == 9000
    for winner in accounts:
        assert vicinity_contract.balanceOf(winner) == 200
        assert vicinity_contract.getLockingStatus(winner)
    