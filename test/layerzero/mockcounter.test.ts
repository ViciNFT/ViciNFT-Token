import { expect } from "chai";
import hardhat from "hardhat";
import { ContractReceipt } from "ethers";
import {
  AccessServer,
  MockCounter,
  MockCounterTunnel,
} from "../../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MOCK_CONTRACTS, proxyDeploy } from "../test-utils/CommonContracts";
import { LayerZeroEcosystem, LayerZeroService } from "./lz_fixtures";

const lzChainId1 = 1;
const lzChainId2 = 2;

const LAYERZERO_ADMIN_ROLE =
  "0x85c4600424d81fbff075e32085ae37829c97adaa85deea5fc84092ce10227b52";
const BRIDGE_CONTRACT_ROLE =
  "0x3fd4a614bd02c8fb908a3b3a05852476cf4c63cfc1b7280860fd956aa0982f9f";

describe("Test MockCounter", function () {
  let signers: SignerWithAddress[];
  let contractOwner: SignerWithAddress;
  let layerzeroAdmin: SignerWithAddress;

  let accessServer: AccessServer;

  let lzEcoSystem: LayerZeroEcosystem;
  let chain1Service: LayerZeroService;
  let chain2Service: LayerZeroService;

  let counter1: MockCounter;
  let counter2: MockCounter;

  let tunnel1: MockCounterTunnel;
  let tunnel2: MockCounterTunnel;

  this.beforeAll(async function () {
    signers = await hardhat.ethers.getSigners();
    contractOwner = signers[0];
    layerzeroAdmin = signers[1];

    accessServer = await MOCK_CONTRACTS.mockAccessServer();
    accessServer.addAdministrator(contractOwner.address);
    await accessServer.grantGlobalRole(
      LAYERZERO_ADMIN_ROLE,
      layerzeroAdmin.address
    );
    lzEcoSystem = new LayerZeroEcosystem();
    chain1Service = await lzEcoSystem.createServiceForChain(
      lzChainId1,
      contractOwner.address
    );
    chain2Service = await lzEcoSystem.createServiceForChain(
      lzChainId2,
      contractOwner.address
    );

    let endpoint1 = chain1Service.endpoint;
    let endpoint2 = chain2Service.endpoint;

    counter1 = (await proxyDeploy(
      "MockCounter",
      accessServer.address
    )) as MockCounter;
    counter2 = (await proxyDeploy(
      "MockCounter",
      accessServer.address
    )) as MockCounter;

    tunnel1 = (await proxyDeploy(
      "MockCounterTunnel",
      accessServer.address,
      endpoint1.address,
      counter1.address
    )) as MockCounterTunnel;
    tunnel2 = (await proxyDeploy(
      "MockCounterTunnel",
      accessServer.address,
      endpoint2.address,
      counter2.address
    )) as MockCounterTunnel;

    await counter1.grantRole(BRIDGE_CONTRACT_ROLE, tunnel1.address);
    await counter2.grantRole(BRIDGE_CONTRACT_ROLE, tunnel2.address);

    await tunnel1.setTrustedRemoteAddress(lzChainId2, tunnel2.address);
    await tunnel2.setTrustedRemoteAddress(lzChainId1, tunnel1.address);

    await tunnel1.setChainIdMappings(
      [lzChainId1, lzChainId2],
      [lzChainId1, lzChainId2]
    );
    await tunnel2.setChainIdMappings(
      [lzChainId1, lzChainId2],
      [lzChainId1, lzChainId2]
    );
  }); // main before

  async function callIncrement(
    tunnel: MockCounterTunnel,
    dstChainId: number
  ): Promise<ContractReceipt> {
    let nativeFee = (await tunnel.estimateSendFee(dstChainId, false, "0x"))
      .nativeFee;

    return lzEcoSystem.sendMessage(tunnel.address, async function () {
      return tunnel.incrementCounter(
        dstChainId,
        contractOwner.address,
        hardhat.ethers.constants.AddressZero,
        "0x",
        { value: nativeFee }
      );
    });
  }

  context("Before any increment messages are sent", function () {
    it("counter 1 is 0", async function () {
      expect(await counter1.count()).to.equal(0);
    });

    it("counter 2 is 0", async function () {
      expect(await counter2.count()).to.equal(0);
    });
  });

  context("When the increment message is sent from chain 1", function () {
    let receipt: ContractReceipt;

    this.beforeAll(async function () {
      receipt = await callIncrement(tunnel1, lzChainId2);
    });

    it("counter 1 is 0", async function () {
      expect(await counter1.count()).to.equal(0);
    });

    it("counter 2 is 1", async function () {
      expect(await counter2.count()).to.equal(1);
    });
  });

  context("When the increment message is sent from chain 2", function () {
    let receipt: ContractReceipt;

    this.beforeAll(async function () {
      receipt = await callIncrement(tunnel2, lzChainId1);
    });

    it("counter 1 is 1", async function () {
      expect(await counter1.count()).to.equal(1);
    });

    it("counter 2 is 1", async function () {
      expect(await counter2.count()).to.equal(1);
    });
  });
});
