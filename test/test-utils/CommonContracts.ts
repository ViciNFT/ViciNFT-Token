import { BigNumber, BigNumberish, Contract, ContractFactory } from "ethers";
import { ethers, upgrades } from "hardhat";
import hardhat from "hardhat";
import { Libraries } from "hardhat/types";

import { Manifest } from "@openzeppelin/upgrades-core";
import {
  ERC20UtilityOperations,
  ProxyAdmin,
  ViciERC20MintableUtilityToken,
  AccessServer,
  MockSanctions,
} from "../../typechain-types";
import { EventABI } from "../helper";
import { EventFragment } from "ethers/lib/utils";

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

export const PROXY_UPGRADE_EVENT = new EventABI(
  "Upgraded(address)",
  EventFragment.fromObject({
    name: "Upgraded",
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "implementation",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
  })
);

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
  erc20Name: string = "ViciERC20MintableUtilityToken",
  erc20OpsName: string = "ERC20UtilityOperations"
): Promise<ViciERC20MintableUtilityToken> {
  let erc20Ops = (await proxyDeploy(
    erc20OpsName,
    max_supply
  )) as ERC20UtilityOperations;
  let erc20 = (await proxyDeploy(
    erc20Name,
    accessServer.address,
    erc20Ops.address,
    name,
    symbol,
    decimals
  )) as ViciERC20MintableUtilityToken;
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
