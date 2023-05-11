import { BigNumber, BigNumberish, Contract, ContractFactory } from "ethers";
import { ethers, upgrades } from "hardhat";
import hardhat from "hardhat";
import { Libraries } from "hardhat/types";

import { Manifest } from "@openzeppelin/upgrades-core";
import {
  ERC20Operations,
  MockViciERC20,
  ProxyAdmin,
  ViciERC20,
  AccessServer,
  MockSanctions,
} from "../../typechain-types";

export async function getProxyAdmin(): Promise<ProxyAdmin> {
  let manifest = await Manifest.forNetwork(hardhat.network.provider);
  let proxyAdminFactory = await ethers.getContractFactory("ProxyAdmin");
  let admin = (await manifest.getAdmin()) as { address: string };
  return proxyAdminFactory.attach(admin.address);
}

export async function getImplementationAddress(
  proxyAddress: string
): Promise<string> {
  let proxyAdmin = await getProxyAdmin();
  return proxyAdmin.getProxyImplementation(proxyAddress);
}

export async function deploy(
  name: string,
  libraries: Libraries,
  ...args: any[]
): Promise<Contract> {
  let factory = await ethers.getContractFactory(name, { libraries: libraries });
  return factory.deploy(...args);
}

export async function proxyDeploy(
  name: string,
  ...args: any[]
): Promise<Contract> {
  let factory = await ethers.getContractFactory(name);
  // console.log("args=", args);
  let result = await upgrades.deployProxy(factory, args, {
    kind: "transparent",
  });

  await result.deployed();
  // console.log("deployed", result);
  return result;
}

export async function proxyUpgrade(
  proxy: Contract,
  name: string
): Promise<Contract> {
  let factory = await ethers.getContractFactory(name);
  return await upgrades.upgradeProxy(proxy.address, factory);
}

export async function proxyUpgradeWithInitSignature(
  proxy: Contract,
  name: string,
  initSignature: string,
  ...args: any[]
): Promise<Contract> {
  let factory = await ethers.getContractFactory(name);
  return await upgrades.upgradeProxy(proxy.address, factory, {
    call: { fn: initSignature, args: args },
  });
}

export async function proxyDeployWithInitSignature(
  name: string,
  initSignature: string,
  ...args: any[]
): Promise<Contract> {
  let factory = await ethers.getContractFactory(name);
  // console.log("args=", args);
  let result = await upgrades.deployProxy(factory, args, {
    initializer: initSignature,
    kind: "transparent",
  });

  await result.deployed();
  // console.log("deployed", result);
  return result;
}

export async function deployERC20(
  accessServer: Contract,
  name: string,
  symbol: string,
  decimals: BigNumberish,
  max_supply: BigNumberish,
  erc20Name: string = "ViciERC20",
  erc20OpsName: string = "ERC20Operations"
): Promise<ViciERC20> {
  let erc20Ops = (await proxyDeploy(
    erc20OpsName,
    max_supply
  )) as ERC20Operations;
  let erc20 = (await proxyDeploy(
    erc20Name,
    accessServer.address,
    erc20Ops.address,
    name,
    symbol,
    decimals
  )) as ViciERC20;
  erc20Ops.transferOwnership(erc20.address);
  return erc20;
}

class MockContracts {
  _mockAccessServer: AccessServer | null = null;

  async mockAccessServer(): Promise<AccessServer> {
    if (!this._mockAccessServer) {
      this._mockAccessServer = (await proxyDeploy(
        "AccessServer"
      )) as AccessServer;
    }

    return this._mockAccessServer;
  }

  async mockSanctionsList(): Promise<MockSanctions> {
    return proxyDeploy("MockSanctions") as Promise<MockSanctions>;
  }
}

export const MOCK_CONTRACTS = new MockContracts();
