'''
Created on Nov 23, 2021

@author: jdavis
'''
import typing

from brownie import network, config, accounts
from brownie.network.account import PublicKeyAccount
from brownie.network.contract import (
    Contract, ContractContainer, ProjectContract,
)

def get_network_data(network_name:str=None) -> typing.Dict[str,typing.Any]:
    network_name = network_name or network.show_active()
    if network_name not in config["networks"]:
        raise Exception(f"Unknown network {network_name}")
    
    return config["networks"][network_name]

def is_local(network_data:typing.Dict[str,typing.Any]=None) -> bool:
    network_data = network_data or get_network_data()
    return network_data.get("local", False)

def is_forked(network_data:typing.Dict[str,typing.Any]=None) -> bool:
    network_data = network_data or get_network_data()
    return network_data.get("forked", False)

def should_verify(network_data:typing.Dict[str,typing.Any]=None) -> bool:
    network_data = network_data or get_network_data()
    return network_data.get("verify", False)

def get_account(index:int=None, account_id:str=None) -> PublicKeyAccount:
    if index is not None:
        return accounts[index]
    
    if account_id:
        return accounts.load(account_id)
    
    network_data = get_network_data()
    
    if network_data.get("local", False) or network_data.get("forked", False):
        return accounts[0]
    
    return accounts.add(config["wallets"]["from_key"])
    
def get_contract(contracts: ContractContainer, *args) -> ProjectContract:
    if is_local():
        if len(contracts) <= 0:
            args.append({"from:": get_account()})
            contracts.deploy(*args)
            
        return contracts[-1]
    
    contract_address = get_network_data()[contracts._name]
    
    return Contract.from_abi(
        contracts._name, contract_address, contracts.abi
    )