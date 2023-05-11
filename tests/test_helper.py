'''
Created on Nov 24, 2021

@author: jdavis
'''

from scripts import vicinity
from scripts.vicinity import Roles
from scripts.util import network_utils

def setup_roles():
    vicinity.grant_role(Roles.ADMIN, network_utils.get_account(index=1))
    vicinity.grant_role(Roles.MINTER, network_utils.get_account(index=2))
    vicinity.grant_role(Roles.AIRDROPPER, network_utils.get_account(index=3))