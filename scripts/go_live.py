'''
Created on Nov 24, 2021

@author: jdavis
'''
from brownie import accounts
from web3 import Web3

from scripts import vicinity
from scripts.vicinity import Roles
from scripts.util import network_utils

def main():
    account = network_utils.get_account()
    vicinity_contract = vicinity.deploy("Vicinity", "VCNT")  # @UnusedVariable  # noqa: F841, E501
    vicinity.grant_role(Roles.ADMIN, account)
    vicinity.grant_role(Roles.MINTER, account)
    vicinity.grant_role(Roles.AIRDROPPER, account)
    
    rich = (
        network_utils.get_account(index=4) if network_utils.is_local()
        else accounts.at(
            "0x6339B2613a2767ff2739d5dF933f85e1177674A9", 
            force=True
        )
    )

    vicinity.grant_role(Roles.ADMIN, rich)
    vicinity.grant_role(Roles.MINTER, rich)
    vicinity.grant_role(Roles.AIRDROPPER, rich)

    vicinity.mint(Web3.toWei(1000000, "ether"), rich)