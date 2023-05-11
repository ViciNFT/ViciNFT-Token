'''
Created on Nov 24, 2021

@author: jdavis
'''
from enum import Enum
import functools
import typing

from brownie import (
    network,
    Vicinity,  # @UnresolvedImport
)
from brownie.network.account import PublicKeyAccount
from brownie.network.contract import ProjectContract

from scripts.version import __version__ 
from scripts.util import network_utils

COIN_NAME = f"Vicinity Test {__version__}"
COIN_SYMBOL = f"VCNT_{__version__}"
INITIAL_SUPPLY = 0
DEFAULT_MINT_AMOUNT = 1000000

class Roles(Enum):
    ADMIN = 0
    MINTER = 0x6d696e7465720000000000000000000000000000000000000000000000000000
    AIRDROPPER = 0x61697264726f7000000000000000000000000000000000000000000000000000

def _do_thing_in_transaction(
        contract_function: typing.Callable,
        as_account:PublicKeyAccount,
):
    tx = contract_function({"from": as_account})
    tx.wait(1)

def deploy(
        coin_name:str=COIN_NAME, 
        coin_symbol:str=COIN_SYMBOL,
        initial_supply:int=INITIAL_SUPPLY, *,
        as_account:PublicKeyAccount=None,
) -> ProjectContract:
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity.deploy(
        coin_name, coin_symbol, initial_supply,
        {"from": as_account},
        publish_source = network_utils.should_verify()
    )
    
    print("{} deployed on {} at {}".format(
        vicinity_contract, network.show_active(), vicinity_contract.address,
    ))
    
    return vicinity_contract

def mint(
        amount:int = DEFAULT_MINT_AMOUNT, 
        to_account:PublicKeyAccount=None, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    to_account = to_account or as_account
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(
        functools.partial(vicinity_contract.mint, to_account, amount),
        as_account,
    )

def burn(
        amount:int, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(
        functools.partial(vicinity_contract.burn, amount),
        as_account,
    )

def transfer(
        to_account:PublicKeyAccount,
        amount:int, from_account:PublicKeyAccount=None, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    if from_account is None:
        _do_thing_in_transaction(
            functools.partial(vicinity_contract.transfer, to_account, amount),
            as_account,
        )
    else:
        _do_thing_in_transaction(
            functools.partial(
                vicinity_contract.transferFrom, 
                from_account, 
                to_account, 
                amount
            ),
            as_account,
        )

def approve(
        amount:int, spender_account:PublicKeyAccount, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(
        functools.partial(vicinity_contract.approve, spender_account, amount),
        as_account,
    )

def change_allowance(
        amount:int, spender_account:PublicKeyAccount, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    if amount < 0:
        _do_thing_in_transaction(
            functools.partial(
                vicinity_contract.decreaseAllowance, spender_account, -amount
            ),
            as_account,
        )
    else:
        _do_thing_in_transaction(
            functools.partial(
                vicinity_contract.increaseAllowance, spender_account, amount
            ),
            as_account,
        )

def airdrop(
      accounts:typing.List[PublicKeyAccount],
      amounts:typing.List[int],
      lock_days:typing.List[int]=None, *,
      as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    accounts = [acct.address for acct in accounts]
    vicinity_contract = Vicinity[-1]

    print(f"as_account {as_account} is a {type(as_account)}")
    
    if lock_days is None:
        _do_thing_in_transaction(
            functools.partial(
                vicinity_contract.airdropByOwner, accounts, amounts,
            ),
            as_account,
        )
    else:
        _do_thing_in_transaction(
            functools.partial(
                vicinity_contract.lockedAirdropByOwner, 
                accounts, amounts, lock_days,
            ),
            as_account,
        )
        
def grant_role(
        role: Roles, to_account:PublicKeyAccount, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(
        functools.partial(vicinity_contract.grantRole, role.value, to_account),
        as_account,
    )
    
def revoke_role(
        role: Roles, from_account:PublicKeyAccount, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(
        functools.partial(vicinity_contract.revokeRole, role.value, from_account),
        as_account,
    )
    
def renounce_role(
        role: Roles, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(
        functools.partial(vicinity_contract.renounceRole, role.value, as_account),
        as_account,
    )
    
def transfer_ownership(
        new_owner:PublicKeyAccount, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(
        functools.partial(
            vicinity_contract.transferOwnership, new_owner,
        ),
        as_account,
    )
    
def pause(*, as_account:PublicKeyAccount=None):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(vicinity_contract.pause, as_account)
    
def unpause(*, as_account:PublicKeyAccount=None):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(vicinity_contract.unpause, as_account)
    
def update_locking_time(
        to_account:PublicKeyAccount, 
        amount:int, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    if amount < 0:
        _do_thing_in_transaction(
            functools.partial(
                vicinity_contract.decreaseLockingTimeByAddress,
                to_account, -amount,
            ),
            as_account,
        )
    else:
        _do_thing_in_transaction(
            functools.partial(
                vicinity_contract.increaseLockingTimeByAddress,
                to_account, amount,
            ),
            as_account,
        )
    
def transfer_locked_tokens(
        to_account:PublicKeyAccount, 
        amount:int,
        locking_time: int, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(
        functools.partial(
            vicinity_contract.transferLockedTokens,
            to_account, amount, locking_time,
        ),
        as_account,
    )
    
def get_back_locked_tokens(
        from_account:PublicKeyAccount, 
        to_account:PublicKeyAccount, 
        amount:int, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(
        functools.partial(
            vicinity_contract.GetBackLockedTokens,
            from_account, to_account, amount,
        ),
        as_account,
    )
    
def add_black_list(
        evil_user:PublicKeyAccount, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(
        functools.partial(
            vicinity_contract.addBlackList, evil_user,
        ),
        as_account,
    )
    
def remove_black_list(
        cleared_user:PublicKeyAccount, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(
        functools.partial(
            vicinity_contract.removeBlackList, cleared_user,
        ),
        as_account,
    )
    
def destroy_black_funds(
        blacklisted_user:PublicKeyAccount, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(
        functools.partial(
            vicinity_contract.destroyBlackFunds, blacklisted_user,
        ),
        as_account,
    )
    
def withdraw(
        to_account:PublicKeyAccount=None, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    to_account = to_account or as_account
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(
        functools.partial(
            vicinity_contract.withdrawn, to_account,
        ),
        as_account,
    )
    
def withdraw_tokens(
        amount:int, 
        token_contract,
        to_account:PublicKeyAccount=None, *,
        as_account:PublicKeyAccount=None,
):
    as_account = as_account or network_utils.get_account()
    to_account = to_account or as_account
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(
        functools.partial(
            vicinity_contract.withdrawnTokens,
            amount, to_account, token_contract,
        ),
        as_account,
    )
    
def receive(*, as_account:PublicKeyAccount=None):
    as_account = as_account or network_utils.get_account()
    vicinity_contract = Vicinity[-1]
    
    _do_thing_in_transaction(vicinity_contract.receive, as_account)