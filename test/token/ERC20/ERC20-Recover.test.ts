import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, ContractReceipt, ContractTransaction } from "ethers";
import { expect } from "chai";
import hardhat from "hardhat";

import { MOCK_CONTRACTS, deployERC20 } from "../../test-utils/CommonContracts";

import { expectEvent } from "../../helper";
import {
  AccessServer,
  MockSanctions,
  ViciERC20MintableUtilityToken,
} from "../../../typechain-types";

const ADMIN =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const MINTER =
  "0x6d696e7465720000000000000000000000000000000000000000000000000000";
const CUSTOMER_SERVICE =
  "0x437573746f6d6572205365727669636500000000000000000000000000000000";
const BANNED =
  "0x62616e6e65640000000000000000000000000000000000000000000000000000";

const name = "Vici ERC20 Token";
const symbol = "VICI";
const decimals = 18;
const max_supply = BigNumber.from("10000000000000000000000000");

const hodlerTokenAmount = BigNumber.from(100);
const tokenAmountHeldByBannedUser = BigNumber.from(66666);
const tokenAmountHeldByOligarch = BigNumber.from(88888);

describe("Test ERC20 Recover Sanctioned Assets", () => {
  let signers: SignerWithAddress[];

  let contractOwner: SignerWithAddress;
  let admin: SignerWithAddress;
  let customerService: SignerWithAddress;
  let minter: SignerWithAddress;

  let hodler: SignerWithAddress;
  let bannedUser: SignerWithAddress;
  let oligarch: SignerWithAddress;
  let holdingWallet: SignerWithAddress;
  let regularUser: SignerWithAddress;

  let accessServer: AccessServer;
  let sanctionsOracle: MockSanctions;

  let initTokenContract: () => Promise<ViciERC20MintableUtilityToken>;

  before(async function () {
    signers = await hardhat.ethers.getSigners();
    contractOwner = signers[0];
    admin = signers[1];
    customerService = signers[2];
    minter = signers[3];
    hodler = signers[4];
    bannedUser = signers[5];
    oligarch = signers[6];
    holdingWallet = signers[7];
    regularUser = signers[8];

    accessServer = await MOCK_CONTRACTS.mockAccessServer();

    sanctionsOracle = await MOCK_CONTRACTS.mockSanctionsList();
    await sanctionsOracle.addToSanctionsList([oligarch.address]);
    await accessServer.setSanctionsList(sanctionsOracle.address);

    initTokenContract = async function (): Promise<ViciERC20MintableUtilityToken> {
      let newContract = await deployERC20(
        accessServer,
        name,
        symbol,
        decimals,
        max_supply
      );

      await sanctionsOracle.removeFromSanctionsList([oligarch.address]);

      await newContract.mint(bannedUser.address, tokenAmountHeldByBannedUser);
      await newContract.mint(oligarch.address, tokenAmountHeldByOligarch);
      await newContract.mint(hodler.address, hodlerTokenAmount);
      await newContract.grantRole(ADMIN, admin.address);
      await newContract.grantRole(MINTER, minter.address);
      await newContract.grantRole(CUSTOMER_SERVICE, customerService.address);
      await newContract.grantRole(MINTER, minter.address);
      await newContract.grantRole(BANNED, bannedUser.address);

      await sanctionsOracle.addToSanctionsList([oligarch.address]);

      return newContract;
    };
  }); // main before

  after(async function () {
    await sanctionsOracle.removeFromSanctionsList([oligarch.address]);
  });

  describe("Postive tests", function () {
    context("When calling `recoverSanctionedAssets()` as owner", function () {
      let contractUnderTest: ViciERC20MintableUtilityToken;
      let fromAccount: string;
      let toAccount: string;
      let recoverAmount: BigNumber;
      let tx: ContractTransaction;
      let receipt: ContractReceipt;
      let originalHoldingBalance: BigNumber;
      let burnTest: boolean;

      function recoverWasSuccessful() {
        it("a SanctionedAssetsRecovered event is emitted", async function () {
          expectEvent(receipt, "SanctionedAssetsRecovered", {
            from: fromAccount,
            to: toAccount,
            value: recoverAmount,
          });
        });

        it("a Transfer event is emitted", async function () {
          expectEvent(receipt, "Transfer", {
            from: fromAccount,
            to: toAccount,
            value: recoverAmount,
          });
        });

        it("the fromAccount's balance is set to zero", async function () {
          expect(await contractUnderTest.balanceOf(fromAccount)).to.equal(0);
        });

        if (!burnTest) {
          it("the sanctioned assets are transferred to the holding wallet", async function () {
            let expectedAmount = originalHoldingBalance.add(recoverAmount);
            expect(await contractUnderTest.balanceOf(toAccount)).to.equal(
              expectedAmount
            );

            originalHoldingBalance = expectedAmount;
          });
        }
      }

      function doPositiveRecoverTests() {
        context("if the fromAccount is a banned user", function () {
          this.beforeAll(async function () {
            fromAccount = bannedUser.address;
            recoverAmount = tokenAmountHeldByBannedUser;

            tx = await contractUnderTest.recoverSanctionedAssets(
              fromAccount,
              toAccount
            );
            receipt = await tx.wait();
          });

          recoverWasSuccessful();
        });

        context("if the fromAccount is under OFAC sanctions", function () {
          this.beforeAll(async function () {
            fromAccount = oligarch.address;
            recoverAmount = tokenAmountHeldByOligarch;

            tx = await contractUnderTest.recoverSanctionedAssets(
              fromAccount,
              toAccount
            );
            receipt = await tx.wait();
          });

          recoverWasSuccessful();
        });
      }

      context("and transferring the coins to a holding wallet", function () {
        this.beforeAll(async function () {
          contractUnderTest = await initTokenContract();
          toAccount = holdingWallet.address;
          originalHoldingBalance = await contractUnderTest.balanceOf(
            holdingWallet.address
          );
        });

        burnTest = false;
        doPositiveRecoverTests();
      });

      context("and burning the sanctioned coins", function () {
        this.beforeAll(async function () {
          contractUnderTest = await initTokenContract();
          toAccount = hardhat.ethers.constants.AddressZero;
        });

        burnTest = true;
        doPositiveRecoverTests();
      });
    });
  }); // positive tests

  describe("Negative Tests", async function () {
    interface NegativeTestCase {
      operator: SignerWithAddress;
      fromAddress: string;
      balance: BigNumber;
    }

    let contractUnderTest: ViciERC20MintableUtilityToken;
    let operatorAccounts: Map<String, SignerWithAddress> = new Map();
    let testAccounts: Map<string, string> = new Map();
    let testCase: NegativeTestCase = {
      operator: bannedUser,
      fromAddress: "",
      balance: BigNumber.from("0"),
    };
    let operators = [
      "the Admin role",
      "the Minter role",
      "the Customer Service role",
      "no assigned roles",
    ];
    let users = [
      "a banned user",
      "a user under OFAC sanctions",
      "an innocent user",
    ];

    this.beforeAll(async function () {
      contractUnderTest = await initTokenContract();

      operatorAccounts.set("the Admin role", admin);
      operatorAccounts.set("the Minter role", minter);
      operatorAccounts.set("the Customer Service role", customerService);
      operatorAccounts.set("no assigned roles", regularUser);

      testAccounts.set("a banned user", bannedUser.address);
      testAccounts.set("a user under OFAC sanctions", oligarch.address);
      testAccounts.set("an innocent user", hodler.address);
    });

    function runNegativeTests(expectedError: string) {
      it(`the error is "${expectedError}"`, async function () {
        await expect(
          contractUnderTest
            .connect(testCase.operator)
            .recoverSanctionedAssets(
              testCase.fromAddress,
              holdingWallet.address
            )
        ).to.be.revertedWith(expectedError);
      });

      it("the user's funds are safu", async function () {
        expect(
          await contractUnderTest.balanceOf(testCase.fromAddress)
        ).to.equal(testCase.balance);
      });
    }

    context("When the contract owner tries to recover assets", function () {
      context("from an innocent user", function () {
        this.beforeAll(async function () {
          testCase = {
            operator: contractOwner,
            fromAddress: hodler.address,
            balance: await contractUnderTest.balanceOf(hodler.address),
          };
        });

        runNegativeTests("Not banned or sanctioned");
      });
    });

    for (let operatorName of operators) {
      context(
        `When a user with ${operatorName} tries to recover assets`,
        function () {
          this.beforeAll(async function () {
            testCase.operator = operatorAccounts.get(
              operatorName
            ) as SignerWithAddress;
          });
          for (let userName of users) {
            context(`from ${userName}`, function () {
              this.beforeEach(async function () {
                let userAddress = testAccounts.get(userName) as string;
                testCase.fromAddress = userAddress;
                testCase.balance = await contractUnderTest.balanceOf(
                  userAddress
                );
              });

              runNegativeTests("AccessControl: not owner");
            });
          } // for each user
        }
      );
    } // for each operator
  });
}); // "Test ERC20 Recover Sanctioned Assets"
