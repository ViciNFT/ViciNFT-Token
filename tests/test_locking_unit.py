'''
Created on Nov 24, 2021

@author: jdavis
'''
import datetime
import pytest

from brownie import network
from brownie.network.account import PublicKeyAccount
from brownie.network.contract import ProjectContract

from scripts import vicinity
from scripts.util import network_utils

from . import test_helper

def check_expire_time(
        expected_expire_days:int, 
        account:PublicKeyAccount,
        vicinity_contract:ProjectContract,
):
    expected_expire = (
        datetime.date.today() + 
        datetime.timedelta(days=expected_expire_days)
    )
    actual_expire = datetime.date.fromtimestamp(
        vicinity_contract.checkLockingTimeByAddress(account)
    )
    assert expected_expire == actual_expire

def test_update_locking_time():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_update_locking_time running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Lock Unit Test", "LUT-0", as_account=account)
    vicinity.mint(10000)
    
    winners = [
        network_utils.get_account(index=n) for n in range(5,7)
    ]
    amounts = [100] * 2
    lock_days = [30] * 2
    
    vicinity.airdrop(winners, amounts, lock_days)
    
    assert vicinity_contract.totalSupply() == 10000
    assert vicinity_contract.balanceOf(account) == 9800
    for winner in winners:
        assert vicinity_contract.balanceOf(winner) == 100
        assert vicinity_contract.getLockingStatus(winner)
        
    test_winner = winners[0]
    check_expire_time(30, test_winner, vicinity_contract)
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 100
    
    vicinity.update_locking_time(test_winner, 10)
    check_expire_time(40, test_winner, vicinity_contract)
    
    vicinity.update_locking_time(test_winner, -20)
    check_expire_time(20, test_winner, vicinity_contract)
    
    vicinity.update_locking_time(test_winner, -100)
    check_expire_time(-80, test_winner, vicinity_contract)
    assert not vicinity_contract.getLockingStatus(test_winner)
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 0
    
    # now that lock time has passed, user can transfer the tokens
    winners_friend = network_utils.get_account(index=9)
    vicinity.transfer(winners_friend, 75, as_account=test_winner)
    assert vicinity_contract.balanceOf(test_winner) == 25
    
def test_transfer_locked_tokens():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_update_locking_time running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Lock Unit Test", "LUT-1", as_account=account)
    vicinity.mint(10000)
    
    test_winner = network_utils.get_account(index=5)
    
    # give some unlocked.
    vicinity.transfer(test_winner, 100)
    # and give some locked.
    vicinity.transfer_locked_tokens(test_winner, 100, 30)
    
    assert vicinity_contract.balanceOf(account) == 9800
    assert vicinity_contract.balanceOf(test_winner) == 200
    assert vicinity_contract.getLockingStatus(test_winner)
    check_expire_time(30, test_winner, vicinity_contract)
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 100
    
    winners_friend = network_utils.get_account(index=6)
    # can transfer unlocked tokens:
    vicinity.transfer(winners_friend, 75, as_account=test_winner)
    assert vicinity_contract.balanceOf(test_winner) == 125
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 100
    assert vicinity_contract.balanceOf(winners_friend) == 75
    assert not vicinity_contract.getLockingStatus(winners_friend)
    
    # but cannot transfer locked tokens:
    with pytest.raises(Exception):
        vicinity.transfer(winners_friend, 75, as_account=test_winner)
    assert vicinity_contract.balanceOf(test_winner) == 125
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 100
    assert vicinity_contract.balanceOf(winners_friend) == 75
    assert not vicinity_contract.getLockingStatus(winners_friend)
    
    # Transferring more locked tokens resets the locking period:
    vicinity.transfer_locked_tokens(test_winner, 100, 45)
    assert vicinity_contract.balanceOf(account) == 9700
    assert vicinity_contract.balanceOf(test_winner) == 225
    assert vicinity_contract.getLockingStatus(test_winner)
    check_expire_time(45, test_winner, vicinity_contract)
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 200
    
def test_unlock_tokens():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_update_locking_time running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Lock Unit Test", "LUT-2", as_account=account)
    vicinity.mint(10000)
    
    test_winner = network_utils.get_account(index=5)
    winners_friend = network_utils.get_account(index=6)
    
    # give some unlocked.
    vicinity.transfer(test_winner, 100)
    # and give some locked.
    vicinity.transfer_locked_tokens(test_winner, 100, 30)
    
    # Can't transfer and unlock more tokens than are locked.
    with pytest.raises(Exception):
        vicinity.get_back_locked_tokens(test_winner, winners_friend, 125)
        
    # tokens go into new account unlocked
    vicinity.get_back_locked_tokens(test_winner, winners_friend, 50)
    assert vicinity_contract.balanceOf(test_winner) == 150
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 50
    assert vicinity_contract.balanceOf(winners_friend) == 50
    assert vicinity_contract.checkLockingAmountByAddress(winners_friend) == 0
    
    # unlock tokens by transferring to same account
    vicinity.get_back_locked_tokens(test_winner, test_winner, 25)
    assert vicinity_contract.balanceOf(test_winner) == 150
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 25
    
    # unlock all tokens
    vicinity.get_back_locked_tokens(
        test_winner, test_winner, 
        vicinity_contract.checkLockingAmountByAddress(test_winner),
    )
    assert vicinity_contract.balanceOf(test_winner) == 150
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 0
    assert not vicinity_contract.getLockingStatus(test_winner)
    
def test_locking_permissions():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_update_locking_time running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Lock Unit Test", "LUT-3", as_account=account)
    vicinity.mint(50000)
    test_helper.setup_roles()
    admin = network_utils.get_account(index=1)
    minter = network_utils.get_account(index=2)
    airdropper = network_utils.get_account(index=3)
    regular_user = network_utils.get_account(index=4)
    
    vicinity.airdrop(
        [admin, minter, airdropper, regular_user], [10000]*4,
    )
    
    accounts = [
        network_utils.get_account(index=n) for n in range(5,10)
    ]
    amounts = [1000] * 5
    lock_days = [30] * 5
    
    # give each test winner some locked and unlocked tokens
    for winner in accounts:
        vicinity.transfer(winner, 1000)
    vicinity.airdrop(accounts, amounts, lock_days)
    test_winner = accounts[0]
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 1000
    assert vicinity_contract.balanceOf(test_winner) == 2000
    
    # only owner or minter can update locking time:
    with pytest.raises(Exception):
        vicinity.update_locking_time(test_winner, 10, as_account=admin)
    check_expire_time(30, test_winner, vicinity_contract)

    with pytest.raises(Exception):
        vicinity.update_locking_time(test_winner, 10, as_account=airdropper)
    check_expire_time(30, test_winner, vicinity_contract)
    
    with pytest.raises(Exception):
        vicinity.update_locking_time(test_winner, 10, as_account=regular_user)
    check_expire_time(30, test_winner, vicinity_contract)
    
    vicinity.update_locking_time(test_winner, 10, as_account=minter)
    check_expire_time(40, test_winner, vicinity_contract)
    
    # only owner or minter can transfer locked tokens:
    with pytest.raises(Exception):
        vicinity.transfer_locked_tokens(test_winner, 1000, 60, as_account=admin)
    check_expire_time(40, test_winner, vicinity_contract)
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 1000
    assert vicinity_contract.balanceOf(test_winner) == 2000

    with pytest.raises(Exception):
        vicinity.transfer_locked_tokens(test_winner, 1000, 60, as_account=airdropper)
    check_expire_time(40, test_winner, vicinity_contract)
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 1000
    assert vicinity_contract.balanceOf(test_winner) == 2000
    
    with pytest.raises(Exception):
        vicinity.transfer_locked_tokens(test_winner, 1000, 60, as_account=regular_user)
    check_expire_time(40, test_winner, vicinity_contract)
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 1000
    assert vicinity_contract.balanceOf(test_winner) == 2000
    
    vicinity.transfer_locked_tokens(test_winner, 1000, 60, as_account=minter)
    check_expire_time(60, test_winner, vicinity_contract)
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 2000
    assert vicinity_contract.balanceOf(test_winner) == 3000
    
    # only owner or minter can unlock tokens:
    with pytest.raises(Exception):
        vicinity.get_back_locked_tokens(test_winner, test_winner, 500, as_account=admin)
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 2000
    assert vicinity_contract.balanceOf(test_winner) == 3000

    with pytest.raises(Exception):
        vicinity.get_back_locked_tokens(
            test_winner, 
            test_winner, 
            500, 
            as_account=airdropper,
        )
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 2000
    assert vicinity_contract.balanceOf(test_winner) == 3000
    
    with pytest.raises(Exception):
        vicinity.get_back_locked_tokens(
            test_winner, 
            test_winner, 
            500, 
            as_account=regular_user,
        )
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 2000
    assert vicinity_contract.balanceOf(test_winner) == 3000
    
    vicinity.get_back_locked_tokens(test_winner, test_winner, 500, as_account=minter)
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 1500
    assert vicinity_contract.balanceOf(test_winner) == 3000
    
def test_cant_use_locking_features_while_paused():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_update_locking_time running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Lock Unit Test", "LUT-4", as_account=account)
    vicinity.mint(10000)
    
    test_winner = network_utils.get_account(index=5)
    vicinity.transfer(test_winner, 1000)
    vicinity.transfer_locked_tokens(test_winner, 1000, 30)
    
    vicinity.pause()
    with pytest.raises(Exception):
        vicinity.update_locking_time(test_winner, 10)
    check_expire_time(30, test_winner, vicinity_contract)
    
    with pytest.raises(Exception):
        vicinity.transfer_locked_tokens(test_winner, 1000, 60)
    check_expire_time(30, test_winner, vicinity_contract)
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 1000
    assert vicinity_contract.balanceOf(test_winner) == 2000
    
    with pytest.raises(Exception):
        vicinity.get_back_locked_tokens(test_winner, test_winner, 500)
    assert vicinity_contract.checkLockingAmountByAddress(test_winner) == 1000
    assert vicinity_contract.balanceOf(test_winner) == 2000
    