'''
Created on Nov 24, 2021

@author: jdavis
'''
import pytest

from brownie import network

from scripts.util import network_utils

from scripts import constants, vicinity

def test_do_deploy():
    if not network_utils.is_local():
        pytest.skip("We only run this test on development")
        
    print(f"test_do_deploy running on {network.show_active()}")
    
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Deploy Unit Test", "DUT", as_account=account)
    
    assert vicinity_contract.hasRole(constants.DEFAULT_ADMIN_ROLE, account)
    
    assert vicinity_contract.name() == "Deploy Unit Test"
    assert vicinity_contract.symbol() == "DUT"
    assert vicinity_contract.totalSupply() == 0