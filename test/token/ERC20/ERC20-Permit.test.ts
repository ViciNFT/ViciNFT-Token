import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  BigNumber,
  ContractReceipt,
  ContractTransaction,
  Wallet,
} from "ethers";
import { expect } from "chai";
import hardhat, { ethers } from "hardhat";
import { ECDSASignature } from "ethereumjs-util";

import {
  domainSeparator,
  sign,
  getPermitDigest,
} from "./ERC20-Permit-Functions";

import { MOCK_CONTRACTS, deployERC20v1 } from "../../test-utils/CommonContracts";
import { expectEvent } from "../../helper";
import {
  AccessServer,
  MockSanctions,
  ViciERC20v01,
} from "../../../typechain-types";

const AMOUNT = BigNumber.from(100);
const maxDeadline: BigNumber = BigNumber.from(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
);

const BANNED =
  "0x62616e6e65640000000000000000000000000000000000000000000000000000";

const name = "Vici ERC20 Token";
const symbol = "VICI";
const decimals = 18;
const max_supply = 100000;
let version = "1";

describe("Test ERC20 Permit", () => {
  // define common variables here
  let signers: SignerWithAddress[];

  let contractOwner: SignerWithAddress;
  let spender: SignerWithAddress;

  let customer: Wallet;
  let banned: Wallet;
  let oligarch: Wallet;
  let l33tHaxx0r: Wallet;

  let accessServer: AccessServer;
  let tokenContract: ViciERC20v01;
  let sanctionsOracle: MockSanctions;
  let chainId: number;

  async function setup() {
    tokenContract = await deployERC20v1(
      accessServer,
      name,
      symbol,
      decimals,
      max_supply
    );

    await tokenContract.mint(customer.address, AMOUNT);
    await tokenContract.mint(banned.address, AMOUNT);
    await tokenContract.mint(oligarch.address, AMOUNT);
    await tokenContract.grantRole(BANNED, banned.address);

    await sanctionsOracle.addToSanctionsList([oligarch.address]);

    chainId = (await tokenContract.getChainId()).toNumber();
    // console.log("erc20 contract is ", tokenContract.address);
    // console.log("customer is ", customer.address);
    // console.log(
    //   "customer balance is ",
    //   await tokenContract.balanceOf(customer.address)
    // );
  }

  before(async function () {
    signers = await hardhat.ethers.getSigners();
    contractOwner = signers[0];
    spender = signers[1];

    customer = Wallet.createRandom();
    banned = Wallet.createRandom();
    oligarch = Wallet.createRandom();
    l33tHaxx0r = Wallet.createRandom();

    sanctionsOracle = await MOCK_CONTRACTS.mockSanctionsList();

    accessServer = await MOCK_CONTRACTS.mockAccessServer();
    await accessServer.setSanctionsList(sanctionsOracle.address);
  }); // main beforeEach

  afterEach(async function () {
    await sanctionsOracle.removeFromSanctionsList([oligarch.address]);
  });

  context("When the contract is first deployed", function () {
    this.beforeAll(async function () {
      await setup();
    });

    it("chain id is expected value", async function () {
      expect(await tokenContract.getChainId()).to.equal(chainId);
    });

    it("initial nonce is 0", async function () {
      expect(await tokenContract.nonces(customer.address)).to.equal(0);
    });

    it("domain separator has expected value", async function () {
      expect(await tokenContract.DOMAIN_SEPARATOR()).to.equal(
        await domainSeparator(name, version, chainId, tokenContract.address)
      );
    });
  }); // When the contract is first deployed

  context("When performing a gasless ERC20 transfer", function () {
    let testCustomer: Wallet;
    let testSigner: Wallet;
    let permitCaller: SignerWithAddress;
    let testSpender: SignerWithAddress;

    let customerOriginalMatic: BigNumber;
    let permitCallerOriginalMatic: BigNumber;
    let spenderOriginalMatic: BigNumber;
    let originalNonce: BigNumber;

    let tx: ContractTransaction;
    let receipt: ContractReceipt;

    let deadline: BigNumber = maxDeadline;

    this.beforeAll(async function () {
      testSpender = spender;
    });

    async function doTestInit() {
      customerOriginalMatic = await ethers
        .getDefaultProvider()
        .getBalance(testCustomer.address);
      permitCallerOriginalMatic = await permitCaller.getBalance();
      spenderOriginalMatic = await testSpender.getBalance();
      originalNonce = await tokenContract.nonces(testCustomer.address);
    }

    async function signTheThing(): Promise<ECDSASignature> {
      let approve = {
        owner: testCustomer.address,
        spender: testSpender.address,
        value: AMOUNT,
      };

      let digest = await getPermitDigest(
        name,
        tokenContract.address,
        chainId,
        approve,
        originalNonce,
        deadline
      );

      let pk = Buffer.from(testSigner.privateKey.substring(2), "hex");
      return sign(digest, pk);
    }

    async function callPermit(signature: ECDSASignature) {
      let { v, r, s } = signature;
      tx = await tokenContract
        .connect(permitCaller)
        .permit(
          testCustomer.address,
          testSpender.address,
          AMOUNT,
          deadline,
          v,
          r,
          s
        );
      receipt = await tx.wait();
    }

    async function makeTheTransfer(amount = AMOUNT) {
      // console.log("erc20 contract is ", tokenContract.address);
      // console.log("customer is ", testCustomer.address);
      // console.log(
      //   "customer balance is ",
      //   await tokenContract.balanceOf(testCustomer.address)
      // );
      // console.log("attempting to transfer ", amount);

      await tokenContract
        .connect(testSpender)
        .transferFrom(testCustomer.address, contractOwner.address, amount);
    }

    async function doTheThing() {
      await doTestInit();
      let signature = await signTheThing();
      await callPermit(signature);
      await makeTheTransfer();
    }

    function permitWasSuccessful() {
      // positive tests:
      it("nonce is incremented", async function () {
        expect(await tokenContract.nonces(testCustomer.address)).to.equal(
          originalNonce.toNumber() + 1
        );
      });

      it("Emits an approval event", async function () {
        expectEvent(receipt, "Approval", {
          owner: testCustomer.address,
          spender: testSpender.address,
          value: AMOUNT,
        });
      });

      it("Successfully transfers the tokens", async function () {
        expect(await tokenContract.balanceOf(testCustomer.address)).to.equal(0);
        expect(await tokenContract.balanceOf(contractOwner.address)).to.equal(
          AMOUNT
        );
      });

      it("signer pays no gas", async function () {
        expect(
          await ethers.getDefaultProvider().getBalance(testCustomer.address)
        ).to.equal(customerOriginalMatic);
      });

      it("permit caller pays gas", async function () {
        expect(await permitCaller.getBalance()).to.be.lessThan(
          permitCallerOriginalMatic
        );
      });

      it("spender pays gas", async function () {
        expect(await testSpender.getBalance()).to.be.lessThan(
          spenderOriginalMatic
        );
      });
    } // permitWasSuccessful()

    context("if permit signed by the customer", function () {
      this.beforeAll(async function () {
        testCustomer = customer;
        testSigner = customer;
        permitCaller = spender;
        await setup();
      });

      context("and the permit is valid", function () {
        this.beforeAll(async function () {
          await doTheThing();
        });

        this.afterAll(async function () {
          await tokenContract.mint(testCustomer.address, AMOUNT);
        });

        permitWasSuccessful();
      }); // and the permit is valid

      context("but the signature is reused", function () {
        let signature: ECDSASignature;

        this.beforeAll(async function () {
          await doTestInit();
          signature = await signTheThing();
          await callPermit(signature);
          await makeTheTransfer();
        });

        this.afterAll(async function () {
          await tokenContract.mint(testCustomer.address, AMOUNT);
        });

        it("reverts with ERC20Permit: invalid signature", async function () {
          await expect(callPermit(signature)).to.be.revertedWith(
            "ERC20Permit: invalid signature"
          );
        });
      }); // the signature is reused

      context("but the permit is expired", function () {
        let signature: ECDSASignature;

        this.beforeAll(async function () {
          deadline = BigNumber.from(
            Math.floor(new Date(Date.now()).getTime() / 1000) - 86400
          );
          await doTestInit();
          signature = await signTheThing();
        });

        this.afterAll(async function () {
          deadline = maxDeadline;
        });

        it("reverts with ERC20Permit: expired deadline", async function () {
          await expect(callPermit(signature)).to.be.revertedWith(
            "ERC20Permit: expired deadline"
          );
        });
      }); // the permit is expired

      context(
        "but the permittee tries to transfer more than permitted",
        function () {
          let signature: ECDSASignature;

          this.beforeAll(async function () {
            await doTestInit();
            signature = await signTheThing();
            await callPermit(signature);
          });

          it("reverts with ERC20Permit: not authorized", async function () {
            await expect(makeTheTransfer(AMOUNT.add(1))).to.be.revertedWith(
              "not authorized"
            );
          });
        }
      ); // permittee tries to transfer more than permitted
    }); // if permit signed by the customer

    context("if permit for customer signed by l33tHaxx0r", function () {
      this.beforeEach(async function () {
        testCustomer = customer;
        testSigner = l33tHaxx0r;
        permitCaller = spender;
        await setup();
        await doTestInit();
      });

      it("reverts with invalid signature", async function () {
        let signature = await signTheThing();
        await expect(callPermit(signature)).to.be.revertedWith(
          "ERC20Permit: invalid signature"
        );
      });
    });

    context("if the customer is banned", function () {
      this.beforeEach(async function () {
        testCustomer = banned;
        testSigner = banned;
        permitCaller = spender;
        await setup();
        await doTestInit();
      });

      it("reverts with AccessControl: banned", async function () {
        let signature = await signTheThing();
        await expect(callPermit(signature)).to.be.revertedWith(
          "AccessControl: banned"
        );
      });
    });

    context("if the customer is under OFAC sanctions", function () {
      this.beforeEach(async function () {
        testCustomer = oligarch;
        testSigner = oligarch;
        permitCaller = spender;
        await setup();
        await doTestInit();
      });

      it("reverts with OFAC sanctioned address", async function () {
        let signature = await signTheThing();
        await expect(callPermit(signature)).to.be.revertedWith(
          "OFAC sanctioned address"
        );
      });
    });
  }); //When performing a gasless ERC20 transfer
}); //Test ERC20 Permit
