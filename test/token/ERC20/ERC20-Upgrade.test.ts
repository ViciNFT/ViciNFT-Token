import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, BigNumberish, Contract, Wallet } from "ethers";
import { expect } from "chai";
import hardhat, { ethers } from "hardhat";
import { ECDSASignature } from "ethereumjs-util";

import {
  MOCK_CONTRACTS,
  proxyDeploy,
  proxyUpgrade,
  getImplementationAddress,
} from "../../test-utils/CommonContracts";
import { getPermitDigest, sign } from "./ERC20-Permit-Functions";
import {
  AccessServer,
  ERC20Operations,
  MockERC20OpsForUpgrade,
  MockViciERC20,
  ViciERC20,
} from "../../../typechain-types";

const hodler1OriginalBalance = BigNumber.from("1000");
const hodler2OriginalBalance = BigNumber.from("2000");
const hodler3OriginalBalance = BigNumber.from("3000");

const name = "Upgradeable ERC20";
const symbol = "UPG";
const decimals = 4;
const max_supply = 100000000;

const deadline = BigNumber.from(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
);

describe("ERC20 Upgradeable Test", function () {
  let signers: SignerWithAddress[];
  let contractOwner: SignerWithAddress;
  let hodler1: SignerWithAddress;
  let hodler2: SignerWithAddress;
  let hodler3: Wallet;
  let noCoiner: SignerWithAddress;
  let operator: SignerWithAddress;

  let accessServer: AccessServer;
  let tokenContract: ViciERC20 | MockViciERC20;
  let ownerOperatorContract: ERC20Operations | MockERC20OpsForUpgrade;

  let originalImplAddress: string;
  let originalProxyAddress: string;

  let originalOwnerOpertatorImplAddress: string;
  let originalOwnerOpertatorProxyAddress: string;

  let signature: ECDSASignature;
  let nonceValue: BigNumberish;

  async function doSetup() {
    ownerOperatorContract = (await proxyDeploy(
      "MockERC20OpsForUpgrade",
      max_supply
    )) as MockERC20OpsForUpgrade;

    tokenContract = (await proxyDeploy(
      "MockViciERC20",
      accessServer.address,
      ownerOperatorContract.address,
      name,
      symbol,
      decimals
    )) as MockViciERC20;
    ownerOperatorContract.transferOwnership(tokenContract.address);

    originalProxyAddress = tokenContract.address;
    originalImplAddress = await getImplementationAddress(tokenContract.address);

    originalOwnerOpertatorProxyAddress = ownerOperatorContract.address;
    originalOwnerOpertatorImplAddress = await getImplementationAddress(
      ownerOperatorContract.address
    );

    await tokenContract.mint(hodler1.address, hodler1OriginalBalance);
    await tokenContract.mint(hodler2.address, hodler2OriginalBalance);
    await tokenContract.mint(hodler3.address, hodler3OriginalBalance);

    await tokenContract
      .connect(hodler2)
      .approve(operator.address, hodler2OriginalBalance);

    nonceValue = await tokenContract.nonces(hodler3.address);
    let digest = await getPermitDigest(
      name,
      tokenContract.address,
      (await tokenContract.getChainId()).toNumber(),
      {
        owner: hodler3.address,
        spender: operator.address,
        value: hodler3OriginalBalance,
      },
      nonceValue,
      deadline
    );
    let pk = Buffer.from(hodler3.privateKey.substring(2), "hex");
    signature = sign(digest, pk);
  }

  async function upgradeERC20() {
    tokenContract = (await proxyUpgrade(
      tokenContract,
      "ViciERC20"
    )) as ViciERC20;
  }

  async function upgradeOwnerOperator() {
    ownerOperatorContract = (await proxyUpgrade(
      ownerOperatorContract,
      "ERC20Operations"
    )) as ERC20Operations;
  }

  this.beforeAll(async function () {
    signers = await hardhat.ethers.getSigners();
    contractOwner = signers[0];
    hodler1 = signers[1];
    hodler2 = signers[2];
    hodler3 = Wallet.createRandom();
    noCoiner = signers[4];
    operator = signers[5];

    accessServer = await MOCK_CONTRACTS.mockAccessServer();
  }); // beforeAll

  function checkExpectedState() {
    context("When checking expected balances and allowances", function () {
      it("hodler1 has the expected balance", async function () {
        expect(await tokenContract.balanceOf(hodler1.address)).to.equal(
          hodler1OriginalBalance
        );
      });

      it("hodler2 has the expected balance", async function () {
        expect(await tokenContract.balanceOf(hodler2.address)).to.equal(
          hodler2OriginalBalance
        );
      });

      it("hodler3 has the expected balance", async function () {
        expect(await tokenContract.balanceOf(hodler3.address)).to.equal(
          hodler3OriginalBalance
        );
      });

      it("operator has the expected approval", async function () {
        expect(
          await tokenContract.allowance(hodler2.address, operator.address)
        ).to.equal(hodler2OriginalBalance);
      });

      it("nonce has expected value", async function () {
        expect(await tokenContract.nonces(hodler3.address)).to.equal(
          nonceValue
        );
      });
    });
  }

  function erc20PreUpdateCheck() {
    context("When trying to use the ERC20 freeMint function", function () {
      this.afterAll(async function () {
        await tokenContract
          .connect(noCoiner)
          .transfer(contractOwner.address, hodler3OriginalBalance);
      });

      it("freeMint(address,uint256) is defined", async function () {
        expect(
          typeof (tokenContract as Contract)["freeMint(address,uint256)"]
        ).to.equal("function");
      });

      it("freeMint function may be called", async function () {
        await (tokenContract as MockViciERC20).freeMint(
          noCoiner.address,
          hodler3OriginalBalance
        );
        expect(await tokenContract.balanceOf(noCoiner.address)).to.equal(
          hodler3OriginalBalance
        );
      });
    });
  }

  function ownerOperatorPreUpdateCheck() {
    context(
      "When trying to use the OwnerOperator freeMint function",
      function () {
        this.afterAll(async function () {
          await tokenContract
            .connect(noCoiner)
            .transfer(contractOwner.address, hodler3OriginalBalance);
        });

        it("freeMint(address,uint256) is defined", async function () {
          expect(
            typeof (ownerOperatorContract as Contract)[
              "freeMint(address,uint256)"
            ]
          ).to.equal("function");
        });

        it("freeMint function may be called", async function () {
          await (ownerOperatorContract as MockERC20OpsForUpgrade).freeMint(
            noCoiner.address,
            hodler3OriginalBalance
          );
          expect(
            await ownerOperatorContract.balanceOf(noCoiner.address)
          ).to.equal(hodler3OriginalBalance);
        });
      }
    );
  }

  function ownerOperatorPostUpdateCheck() {
    context("When checking the OwnerOperator addresses", function () {
      it("the implementation address is different", async function () {
        expect(
          await getImplementationAddress(ownerOperatorContract.address)
        ).to.not.equal(originalOwnerOpertatorImplAddress);
      });

      it("the proxy address is the same", async function () {
        expect(ownerOperatorContract.address).to.equal(
          originalOwnerOpertatorProxyAddress
        );
      });
    });

    context(
      "When trying to use the OwnerOperator freeMint function",
      function () {
        it("freeMint(address,uint256) is not defined", async function () {
          expect(
            typeof (ownerOperatorContract as Contract)[
              "freeMint(address,uint256)"
            ]
          ).to.equal("undefined");
        });

        it("attempting to call freeMint on the original contract doesn't work", async function () {
          let factory = await ethers.getContractFactory(
            "MockERC20OpsForUpgrade"
          );
          let originalImpl = factory.attach(originalOwnerOpertatorImplAddress);
          await originalImpl.freeMint(noCoiner.address, hodler3OriginalBalance);

          expect(await tokenContract.balanceOf(noCoiner.address)).to.equal(0);
        });
      }
    );
  }

  function erc20PostUpdateCheck() {
    context("When checking the ERC20 addresses", function () {
      it("the implementation address is different", async function () {
        expect(
          await getImplementationAddress(tokenContract.address)
        ).to.not.equal(originalImplAddress);
      });

      it("the proxy address is the same", async function () {
        expect(tokenContract.address).to.equal(originalProxyAddress);
      });
    });

    context("When trying to use the ERC20 freeMint function", function () {
      it("freeMint(address,uint256) is not defined", async function () {
        expect(
          typeof (tokenContract as Contract)["freeMint(address,uint256)"]
        ).to.equal("undefined");
      });

      it("attempting to call freeMint on the original contract reverts", async function () {
        let factory = await ethers.getContractFactory("MockViciERC20");
        let originalImpl = factory.attach(originalImplAddress);
        await expect(
          originalImpl.freeMint(noCoiner.address, hodler3OriginalBalance)
        ).to.be.reverted;
      });
    });

    context("When using a permit signed before the upgrade", function () {
      it("permit signature is still valid", async function () {
        let { v, r, s } = signature;
        await tokenContract.permit(
          hodler3.address,
          operator.address,
          hodler3OriginalBalance,
          deadline,
          v,
          r,
          s
        );
      });

      it("allowance is granted", async function () {
        expect(
          await tokenContract.allowance(hodler3.address, operator.address)
        ).to.equal(hodler3OriginalBalance);
      });
    });
  }

  context("Before upgrading anything", function () {
    this.beforeAll(async function () {
      await doSetup();
    });

    checkExpectedState();
    erc20PreUpdateCheck();
    ownerOperatorPreUpdateCheck();
  }); // Before upgrading anything

  context("After upgrading OwnerOperator only", function () {
    this.beforeAll(async function () {
      await doSetup();
      await upgradeOwnerOperator();
    });

    checkExpectedState();
    erc20PreUpdateCheck();
    ownerOperatorPostUpdateCheck();
  }); // After upgrading OwnerOperator only

  context("After upgrading ERC20 only", function () {
    this.beforeAll(async function () {
      await doSetup();
      await upgradeERC20();
    });

    checkExpectedState();
    erc20PostUpdateCheck();
    ownerOperatorPreUpdateCheck();
  });

  context("After upgrading OwnerOperator followed by ERC20", function () {
    this.beforeAll(async function () {
      await doSetup();
      await upgradeOwnerOperator();
      await upgradeERC20();
    });

    checkExpectedState();
    erc20PostUpdateCheck();
    ownerOperatorPostUpdateCheck();
  }); // After upgrading OwnerOperator followed by ERC20

  context("After upgrading ERC20 followed by OwnerOperator", function () {
    this.beforeAll(async function () {
      await doSetup();
      await upgradeERC20();
      await upgradeOwnerOperator();
    });

    checkExpectedState();
    erc20PostUpdateCheck();
    ownerOperatorPostUpdateCheck();
  }); // After upgrading ERC20 followed by OwnerOperator
}); // ERC20 Upgradeable Test
