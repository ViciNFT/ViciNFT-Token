import { BigNumber, BigNumberish, Contract, ContractFactory } from "ethers";
import { ethers, upgrades } from "hardhat";
import hardhat from "hardhat";
import { Libraries } from "hardhat/types";

import { Manifest } from "@openzeppelin/upgrades-core";
import {
  ERC20UtilityOperations,
  ERC20UtilityOperations_v01,
  ProxyAdmin,
  ViciERC20MintableUtilityToken,
  ViciERC20v01,
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

export interface ERC20DeployArgs {
  accessServer: Contract;
  name: string;
  symbol: string;
  decimals: BigNumberish;
  max_supply: BigNumberish;
  isMain?: boolean;
  airdropThreshold?: BigNumberish;
  erc20Name?: string;
  erc20OpsName?: string;
}

export async function deployERC20v1(
  accessServer: Contract,
  name: string,
  symbol: string,
  decimals: BigNumberish,
  max_supply: BigNumberish,
  erc20Name: string = "ViciERC20v01",
  erc20OpsName: string = "ERC20UtilityOperations_v01"
): Promise<ViciERC20v01> {
  let erc20Ops = (await proxyDeploy(
    erc20OpsName,
    max_supply
  )) as ERC20UtilityOperations_v01;
  let erc20 = (await proxyDeploy(
    erc20Name,
    accessServer.address,
    erc20Ops.address,
    name,
    symbol,
    decimals
  )) as ViciERC20v01;
  erc20Ops.transferOwnership(erc20.address);
  return erc20;
}

export async function deployERC20({
  accessServer,
  name,
  symbol,
  decimals,
  max_supply,
  isMain = false,
  airdropThreshold = hardhat.ethers.utils.parseUnits("1000", 18),
  erc20Name = "ViciERC20MintableUtilityToken",
  erc20OpsName = "ERC20UtilityOperations",
}: ERC20DeployArgs): Promise<ViciERC20MintableUtilityToken> {
  let erc20Ops = (await proxyDeployWithInitSignature(
    erc20OpsName,
    "initialize(uint256,uint256)",
    max_supply,
    airdropThreshold
  )) as ERC20UtilityOperations;
  let erc20 = (await proxyDeployWithInitSignature(
    erc20Name,
"initialize(address,address,string,string,uint8,bool)",
    accessServer.address,
    erc20Ops.address,
    name,
    symbol,
    decimals,
    isMain
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
