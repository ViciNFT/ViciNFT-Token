'''
Created on Nov 24, 2021

@author: jdavis
'''
# The requirement that locked tokens can't be transferred is tested in test_locking.
# The requirement that blacklisted users can't transfer tokens is tested in 
# test_blacklisting.

import pytest

from brownie import network

from scripts import vicinity
from scripts.util import network_utils

def test_transfer_feature():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_minting running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy(
        "Transfer Unit Test", 
        "TUT-0", 
        as_account=account,
    )
    
    vicinity.mint(10000)
    customer = network_utils.get_account(index=5)
    merchant = network_utils.get_account(index=6)
    bystander = network_utils.get_account(index=7)
    vicinity.transfer(customer, 1000)
    vicinity.transfer(merchant, 1000)
    vicinity.transfer(bystander, 1000)
    
    # regular transfer works fine:
    vicinity.transfer(merchant, 50, as_account=customer)
    assert vicinity_contract.balanceOf(customer) == 950
    assert vicinity_contract.balanceOf(merchant) == 1050
    
    # can't transfer negative amount
    with pytest.raises(Exception):
        vicinity.transfer(merchant, -50, as_account=customer)
        
    # can't transfer from other person's account
    with pytest.raises(Exception):
        vicinity.transfer(merchant, 50, from_account=bystander, as_account=customer)
    
def test_transfer_with_allowance():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_minting running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy(
        "Transfer Unit Test", 
        "TUT-0", 
        as_account=account,
    )
    
    vicinity.mint(10000)
    customer = network_utils.get_account(index=5)
    merchant = network_utils.get_account(index=6)
    proxy = network_utils.get_account(index=7)
    vicinity.transfer(customer, 1000)
    vicinity.transfer(merchant, 1000)
    vicinity.transfer(proxy, 1000)
    vicinity.approve(500, proxy, as_account=customer)
    
    assert vicinity_contract.allowance(customer, proxy) == 500
    
    # proxy can make purchaces up to allowed amount
    vicinity.transfer(merchant, 100, from_account=customer, as_account=proxy)
    assert vicinity_contract.balanceOf(customer) == 900
    assert vicinity_contract.balanceOf(merchant) == 1100
    # proxy spent customers's money, not their own
    assert vicinity_contract.balanceOf(proxy) == 1000 
    assert vicinity_contract.allowance(customer, proxy) == 400
    
    # proxy can't exceed allowance
    with pytest.raises(Exception):
        vicinity.transfer(merchant, 500, from_account=customer, as_account=proxy)
        
    # customer can increase proxy's allowance
    vicinity.change_allowance(100, proxy, as_account=customer)
    assert vicinity_contract.allowance(customer, proxy) == 500
    
    # customer can decrease proxy's allowance
    vicinity.change_allowance(-250, proxy, as_account=customer)
    assert vicinity_contract.allowance(customer, proxy) == 250
    
    # customer cannot decrease proxy's allowance below 0
    with pytest.raises(Exception):
        vicinity.change_allowance(-300, proxy, as_account=customer)
        
def test_spender_cant_exceed_customers_balance():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_minting running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy(
        "Transfer Unit Test", 
        "TUT-0", 
        as_account=account,
    )
    
    vicinity.mint(10000)
    customer = network_utils.get_account(index=5)
    merchant = network_utils.get_account(index=6)
    proxy = network_utils.get_account(index=7)
    vicinity.transfer(customer, 1000)
    vicinity.transfer(merchant, 1000)
    vicinity.transfer(proxy, 1000)
    
    # You can set the allowance value as high as you want.
    vicinity.approve(10**18, proxy, as_account=customer)
    assert vicinity_contract.allowance(customer, proxy) == 10**18
    
    # But the proxy can't spend more than you have.
    with pytest.raises(Exception):
        vicinity.transfer(merchant, 5000, from_account=customer, as_account=proxy)
    