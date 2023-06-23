import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  BigNumber,
  BigNumberish,
  ContractReceipt,
  ContractTransaction,
} from "ethers";
import { expect } from "chai";
import hardhat, { ethers } from "hardhat";

import {
  MOCK_CONTRACTS,
  deployERC20,
  proxyDeploy,
} from "../../test-utils/CommonContracts";

import { expectEvent } from "../../helper";
import {
  AccessServer,
  MockERC20UtilityOperations,
  MockERC20UtilityOperations__factory,
  ViciERC20UtilityToken,
} from "../../../typechain-types";

const ADMIN =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const AIRDROPPER =
  "0x61697264726f7000000000000000000000000000000000000000000000000000";
const LOST_WALLET =
  "0xe33f057fb711996a9186bf42fdf8caf29cf94c723598d4f2a6e4c156c86bc15a";

const ONE_ZILLION = BigNumber.from(
  "115792089237316195423570985008687907853269984665640564039457584007913129639935"
);

const GRANT_TIMESTAMP = BigNumber.from(1000);

describe("Test ERC20 Utility Extensions", () => {
  let signers: SignerWithAddress[];

  let contractOwner: SignerWithAddress;
  let airdropper: SignerWithAddress;
  let timelockedAccount1: SignerWithAddress;
  let timelockedAccount2: SignerWithAddress;
  let timelockedAccount3: SignerWithAddress;
  let regularUser: SignerWithAddress;
  let lostWallet1: SignerWithAddress;
  let lostWallet2: SignerWithAddress;

  let accessServer: AccessServer;

  let initOpsContract: () => Promise<MockERC20UtilityOperations>;
  let initTokenContract: (
    ops: MockERC20UtilityOperations
  ) => Promise<ViciERC20UtilityToken>;

  before(async function () {
    signers = await hardhat.ethers.getSigners();
    contractOwner = signers[0];
    airdropper = signers[1];
    timelockedAccount1 = signers[2];
    timelockedAccount2 = signers[3];
    timelockedAccount3 = signers[4];
    regularUser = signers[5];
    lostWallet1 = signers[6];
    lostWallet2 = signers[7];

    accessServer = await MOCK_CONTRACTS.mockAccessServer();

    initOpsContract = async function (): Promise<MockERC20UtilityOperations> {
      let ops = (await proxyDeploy(
        "MockERC20UtilityOperations",
        ONE_ZILLION
      )) as MockERC20UtilityOperations;

      ops.setCurrentTimestamp(GRANT_TIMESTAMP);
      return ops;
    };

    initTokenContract = async function (
      ops: MockERC20UtilityOperations
    ): Promise<ViciERC20UtilityToken> {
      let newContract = (await proxyDeploy(
        "ViciERC20UtilityToken",
        accessServer.address,
        ops.address,
        "Vici Utility Token",
        "VCUT",
        18
      )) as ViciERC20UtilityToken;

      await ops.transferOwnership(newContract.address);

      await newContract.grantRole(AIRDROPPER, airdropper.address);
      await newContract.grantRole(LOST_WALLET, lostWallet1.address);
      await newContract.grantRole(LOST_WALLET, lostWallet2.address);
      await newContract.mint(
        contractOwner.address,
        ethers.utils.parseEther("1.0")
      );
      await newContract.mint(
        airdropper.address,
        ethers.utils.parseEther("1.0")
      );
      return newContract;
    };
  }); // main before all

  describe("Airdropped locked tokens feature", function () {
    let contractUnderTest: ViciERC20UtilityToken;
    let ops: MockERC20UtilityOperations;
    let receipt: ContractReceipt;

    const START_AMOUNT = BigNumber.from(100);

    async function airdropTestSetup() {
      ops = await initOpsContract();
      contractUnderTest = await initTokenContract(ops);

      await contractUnderTest.mint(timelockedAccount1.address, START_AMOUNT);
      await contractUnderTest.mint(timelockedAccount2.address, START_AMOUNT);
      await contractUnderTest.mint(timelockedAccount3.address, START_AMOUNT);
    }

    describe("Airdrop function behavior", function () {
      let airdropSender: SignerWithAddress;
      let airdropRecipient: SignerWithAddress;
      let airdropAmount: BigNumber;
      let releaseTimestamp: BigNumber;
      let originalLockedAmount: BigNumber;
      let originalUnlockedAmount: BigNumber;

      async function do_airdrop(
        sender: SignerWithAddress,
        recipient: SignerWithAddress,
        amount: BigNumber,
        duration: BigNumber
      ): Promise<ContractReceipt> {
        airdropSender = sender;
        airdropRecipient = recipient;
        airdropAmount = amount;
        releaseTimestamp = (await ops.currentTimestamp()).add(duration);
        let tx = await contractUnderTest
          .connect(sender)
          .airdropTimelockedTokens(recipient.address, amount, duration);
        return await tx.wait();
      }

      function airdropWasSuccessful(timelockStatus: string) {
        it("a 'Transfer' event is emitted", async function () {
          expectEvent(receipt, "Transfer", {
            from: airdropSender.address,
            to: airdropRecipient.address,
            value: airdropAmount,
          });
        });

        it("the airdropped amount is shown in the recipient's balance", async function () {
          expect(
            await contractUnderTest.balanceOf(airdropRecipient.address)
          ).to.equal(
            airdropAmount.add(originalUnlockedAmount.add(originalLockedAmount))
          );
        });

        it("the recipient's locked balance is the airdropped amount", async function () {
          expect(
            await contractUnderTest.lockedBalanceOf(airdropRecipient.address)
          ).to.equal(originalLockedAmount.add(airdropAmount));
        });

        it("the recipient's unlocked balance is unchanged", async function () {
          expect(
            await contractUnderTest.unlockedBalanceOf(airdropRecipient.address)
          ).to.equal(originalUnlockedAmount);
        });

        it(`the timelock is ${timelockStatus}`, async function () {
          expect(
            await contractUnderTest.lockReleaseDate(airdropRecipient.address)
          ).to.equal(releaseTimestamp);
        });
      } // airdropWasSuccessful()

      function _doAirdopByCaller(duration: BigNumber, timelockStatus: string) {
        context("as the contract owner", function () {
          this.beforeAll(async function () {
            originalUnlockedAmount = START_AMOUNT;
            receipt = await do_airdrop(
              contractOwner,
              timelockedAccount1,
              BigNumber.from(1000),
              duration
            );
          });

          this.afterAll(async function () {
            receipt = undefined as unknown as ContractReceipt;
          });

          airdropWasSuccessful(timelockStatus);
        });

        context("as a user with AIRDROPPER role", function () {
          this.beforeAll(async function () {
            originalUnlockedAmount = START_AMOUNT;
            receipt = await do_airdrop(
              airdropper,
              timelockedAccount2,
              BigNumber.from(1000),
              duration
            );
          });

          this.afterAll(async function () {
            receipt = undefined as unknown as ContractReceipt;
          });

          airdropWasSuccessful(timelockStatus);
        });

        context("as a regular user", function () {
          this.beforeAll(async function () {
            await contractUnderTest.mint(
              regularUser.address,
              ethers.utils.parseEther("1.0")
            );
          });

          it("the error is 'AccessControl: account is missing role'", async function () {
            await expect(
              contractUnderTest
                .connect(regularUser)
                .airdropTimelockedTokens(
                  contractOwner.address,
                  BigNumber.from(10000),
                  1000
                )
            ).to.be.revertedWith(
              `AccessControl: account ${regularUser.address.toLocaleLowerCase()} is missing role ${AIRDROPPER}`
            );
          });
        });
      } // _doAirdopByCaller

      context("When airdropping to an account with no timelock", function () {
        this.beforeAll(async function () {
          await airdropTestSetup();
          originalLockedAmount = BigNumber.from(0);
        });

        _doAirdopByCaller(BigNumber.from(100), "set");
      });

      context(
        "When airdropping to an account with an existing timelock",
        function () {
          this.beforeAll(async function () {
            await airdropTestSetup();
            await do_airdrop(
              contractOwner,
              timelockedAccount1,
              BigNumber.from(1000),
              BigNumber.from(100)
            );

            originalUnlockedAmount = START_AMOUNT;
            originalLockedAmount = await contractUnderTest.lockedBalanceOf(
              timelockedAccount1.address
            );
            let originalReleaseDate = await contractUnderTest.lockReleaseDate(
              timelockedAccount1.address
            );
            ops.incrementTimestamp(50);

            receipt = await do_airdrop(
              contractOwner,
              timelockedAccount1,
              BigNumber.from(1200),
              BigNumber.from(1000)
            );
            releaseTimestamp = originalReleaseDate;
          });

          this.afterAll(async function () {
            receipt = undefined as unknown as ContractReceipt;
          });

          airdropWasSuccessful("unchanged");
        }
      );

      context(
        "When airdropping to an account with an expired timelock",
        function () {
          this.beforeAll(async function () {
            await airdropTestSetup();
            await do_airdrop(
              contractOwner,
              timelockedAccount1,
              BigNumber.from(1000),
              BigNumber.from(100)
            );

            originalUnlockedAmount = START_AMOUNT.add(
              await contractUnderTest.lockedBalanceOf(
                timelockedAccount1.address
              )
            );
            originalLockedAmount = BigNumber.from(0);
            ops.incrementTimestamp(150);

            receipt = await do_airdrop(
              contractOwner,
              timelockedAccount1,
              BigNumber.from(1200),
              BigNumber.from(1000)
            );
          });

          this.afterAll(async function () {
            receipt = undefined as unknown as ContractReceipt;
          });

          airdropWasSuccessful("set");
        }
      );
    }); // Airdrop function behavior

    describe("Behavior with locked token balances", function () {
      const AIRDROP_AMOUNT = BigNumber.from(1000);
      const DURATION = BigNumber.from(100);

      this.beforeAll(async function () {
        await airdropTestSetup();
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount1.address,
          AIRDROP_AMOUNT,
          DURATION
        );
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount2.address,
          AIRDROP_AMOUNT,
          DURATION
        );
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount3.address,
          AIRDROP_AMOUNT,
          DURATION
        );
        ops.incrementTimestamp(50);
      });

      context("When calling query functions", function () {
        it("`balanceOf` returns the total balance", async function () {
          expect(
            await contractUnderTest.balanceOf(timelockedAccount3.address)
          ).to.equal(START_AMOUNT.add(AIRDROP_AMOUNT));
        });

        it("`lockedBalanceOf` returns the total airdropped amount", async function () {
          expect(
            await contractUnderTest.lockedBalanceOf(timelockedAccount3.address)
          ).to.equal(AIRDROP_AMOUNT);
        });

        it("`unlockedBalanceOf` returns the user's original unlocked balance", async function () {
          expect(
            await contractUnderTest.unlockedBalanceOf(
              timelockedAccount3.address
            )
          ).to.equal(START_AMOUNT);
        });

        it("`lockReleaseDate` returns the time of the original airdrop plus the duration", async function () {
          expect(
            await contractUnderTest.lockReleaseDate(timelockedAccount3.address)
          ).to.equal(GRANT_TIMESTAMP.add(DURATION));
        });
      }); // When calling query functions

      context(
        "When transferring an amount less than the unlocked balance",
        function () {
          const TRANSFER_AMOUNT = BigNumber.from(50);

          this.beforeAll(async function () {
            await contractUnderTest
              .connect(timelockedAccount1)
              .transfer(regularUser.address, 50);
          });

          it("the transfer amount is deducted from the total balance", async function () {
            expect(
              await contractUnderTest.balanceOf(timelockedAccount1.address)
            ).to.equal(START_AMOUNT.sub(TRANSFER_AMOUNT).add(AIRDROP_AMOUNT));
          });

          it("the transfer amount is deducted from the unlocked balance", async function () {
            expect(
              await contractUnderTest.unlockedBalanceOf(
                timelockedAccount1.address
              )
            ).to.equal(START_AMOUNT.sub(TRANSFER_AMOUNT));
          });

          it("the locked balance is unchanged", async function () {
            expect(
              await contractUnderTest.lockedBalanceOf(
                timelockedAccount1.address
              )
            ).to.equal(AIRDROP_AMOUNT);
          });
        }
      ); // When transferring an amount less than the unlocked balance

      context(
        "When transferring an amount equal to the unlocked balance",
        function () {
          this.beforeAll(async function () {
            await contractUnderTest
              .connect(timelockedAccount2)
              .transfer(regularUser.address, START_AMOUNT);
          });

          it("the transfer amount is deducted from the total balance", async function () {
            expect(
              await contractUnderTest.balanceOf(timelockedAccount2.address)
            ).to.equal(AIRDROP_AMOUNT);
          });

          it("the transfer amount is deducted from the unlocked balance", async function () {
            expect(
              await contractUnderTest.unlockedBalanceOf(
                timelockedAccount2.address
              )
            ).to.equal(0);
          });

          it("the locked balance is unchanged", async function () {
            expect(
              await contractUnderTest.lockedBalanceOf(
                timelockedAccount2.address
              )
            ).to.equal(AIRDROP_AMOUNT);
          });
        }
      ); // When transferring an amount equal to the unlocked balance
      context(
        "When transferring an amount greater than the unlocked balance",
        function () {
          it("the error is 'insufficient balance'", async function () {
            await expect(
              contractUnderTest
                .connect(timelockedAccount3)
                .transfer(
                  regularUser.address,
                  START_AMOUNT.add(BigNumber.from(1))
                )
            ).to.revertedWith("insufficient balance");
          });
        }
      ); // When transferring an amount greater than the unlocked balance
    }); // Behavior with locked token balances

    describe("Behavior with expired lock period", function () {
      const AIRDROP_AMOUNT = BigNumber.from(1000);
      const DURATION = BigNumber.from(100);

      this.beforeAll(async function () {
        await airdropTestSetup();
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount1.address,
          AIRDROP_AMOUNT,
          DURATION
        );
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount2.address,
          AIRDROP_AMOUNT,
          DURATION
        );
        ops.incrementTimestamp(DURATION.add(BigNumber.from(50)));
      });

      context("When calling query functions", function () {
        it("`balanceOf` returns the total balance", async function () {
          expect(
            await contractUnderTest.balanceOf(timelockedAccount1.address)
          ).to.equal(START_AMOUNT.add(AIRDROP_AMOUNT));
        });

        it("`lockedBalanceOf` returns 0", async function () {
          expect(
            await contractUnderTest.lockedBalanceOf(timelockedAccount1.address)
          ).to.equal(0);
        });

        it("`unlockedBalanceOf` returns the total balance", async function () {
          expect(
            await contractUnderTest.unlockedBalanceOf(
              timelockedAccount1.address
            )
          ).to.equal(START_AMOUNT.add(AIRDROP_AMOUNT));
        });

        it("`lockReleaseDate` returns 0", async function () {
          expect(
            await contractUnderTest.lockReleaseDate(timelockedAccount1.address)
          ).to.equal(0);
        });
      });

      context(
        "When transferring from a previously locked balance",
        function () {
          this.beforeAll(async function () {
            await contractUnderTest
              .connect(timelockedAccount2)
              .transfer(regularUser.address, START_AMOUNT.add(AIRDROP_AMOUNT));
          });

          it("the entire balance can be transferred", async function () {
            expect(
              await contractUnderTest.balanceOf(timelockedAccount2.address)
            ).to.equal(0);
          });
        }
      );
    }); // Behavior with expired lock period

    describe("Admin unlock feature behavior", function () {
      const AIRDROP_AMOUNT = BigNumber.from(1000);
      let unlockAmount: BigNumber;
      let unlockedUser: string;
      let releaseTimestamp: BigNumber;

      async function unlockTestSetup() {
        await airdropTestSetup();
        let duration = BigNumber.from(100);
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount1.address,
          AIRDROP_AMOUNT,
          duration
        );
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount2.address,
          AIRDROP_AMOUNT,
          duration
        );
        releaseTimestamp = (await ops.currentTimestamp()).add(duration);
      }

      function unlockWasSuccessful() {
        it("the total balance is unchanged", async function () {
          expect(await contractUnderTest.balanceOf(unlockedUser)).to.equal(
            START_AMOUNT.add(AIRDROP_AMOUNT)
          );
        });

        if (unlockAmount.lt(AIRDROP_AMOUNT)) {
          // partial unlock
          it("the locked balance is decreased by the specified amount", async function () {
            expect(
              await contractUnderTest.lockedBalanceOf(unlockedUser)
            ).to.equal(AIRDROP_AMOUNT.sub(unlockAmount));
          });

          it("the unlocked balance is increased by the specified amount", async function () {
            expect(
              await contractUnderTest.unlockedBalanceOf(unlockedUser)
            ).to.equal(START_AMOUNT.add(unlockAmount));
          });

          it("the lockReleaseDate is unchanged", async function () {
            expect(
              await contractUnderTest.lockReleaseDate(unlockedUser)
            ).to.equal(releaseTimestamp);
          });
        } else {
          // full unlock
          it("the locked balance is decreased to 0", async function () {
            expect(
              await contractUnderTest.lockedBalanceOf(unlockedUser)
            ).to.equal(0);
          });

          it("the unlocked balance is increased to the full balance", async function () {
            expect(
              await contractUnderTest.unlockedBalanceOf(unlockedUser)
            ).to.equal(START_AMOUNT.add(AIRDROP_AMOUNT));
          });

          it("the lockReleaseDate is set to 0", async function () {
            expect(
              await contractUnderTest.lockReleaseDate(unlockedUser)
            ).to.equal(0);
          });
        }
      } // unlockWasSuccessful()

      function _doUnlockByCaller(amount: BigNumber) {
        unlockAmount = amount;

        context("as the contract owner", function () {
          this.beforeAll(async function () {
            unlockedUser = timelockedAccount1.address;
            unlockAmount = amount;
            await contractUnderTest
              .connect(contractOwner)
              .unlockLockedTokens(unlockedUser, amount);
          });

          unlockWasSuccessful();
        });

        // context("as a user with AIRDROPPER role", function () {
        //   this.beforeAll(async function () {
        //     unlockedUser = timelockedAccount2.address;
        //     unlockAmount = amount;
        //     await contractUnderTest
        //       .connect(airdropper)
        //       .unlockLockedTokens(unlockedUser, amount);
        //   });

        //   unlockWasSuccessful();
        // });

        context("as a regular user", function () {
          it("the error is 'AccessControl: account is missing role'", async function () {
            expect(
              await contractUnderTest
                .connect(airdropper)
                .unlockLockedTokens(timelockedAccount3.address, amount)
            ).to.be.revertedWith(
              `AccessControl: account ${regularUser.address.toLocaleLowerCase()} is missing role ${AIRDROPPER}`
            );
          });
        });
      } // _doUnlockByCaller

      context("When unlocking part of a user's locked balance", function () {
        this.beforeAll(async function () {
            await unlockTestSetup();
        });

        _doUnlockByCaller(BigNumber.from(300));
      });

      context(
        "When the passed in amount equals or exceeds the locked balance",
        function () {
          this.beforeAll(async function () {
            await unlockTestSetup();
          });

          _doUnlockByCaller(ONE_ZILLION);
        }
      );
    }); // Admin unlock feature behavior
  }); // Airdropped locked tokens feature

  describe("Recover misplaced tokens feature", function () {
    describe("Postive tests", function () {
      context("When calling `recoverMisplacedTokens()` as owner", function () {
        let contractUnderTest: ViciERC20UtilityToken;
        let fromAccount: string;
        let toAccount: string;
        let recoverAmount: BigNumber;
        let tx: ContractTransaction;
        let receipt: ContractReceipt;
        let originalHoldingBalance: BigNumber;

        const LOST_TOKEN_AMOUNT = BigNumber.from(100);

        function recoverWasSuccessful() {
          it("a LostTokensRecovered event is emitted", async function () {
            expectEvent(receipt, "LostTokensRecovered", {
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

          it("the sanctioned assets are transferred to the holding wallet", async function () {
            let expectedAmount = originalHoldingBalance.add(recoverAmount);
            expect(await contractUnderTest.balanceOf(toAccount)).to.equal(
              expectedAmount
            );

            originalHoldingBalance = expectedAmount;
          });
        }

        function doPositiveRecoverTests() {
          context("if the fromAccount is a lost wallet", function () {
            this.beforeAll(async function () {
              fromAccount = lostWallet1.address;
              recoverAmount = LOST_TOKEN_AMOUNT;
              await contractUnderTest.mint(fromAccount, LOST_TOKEN_AMOUNT);

              tx = await contractUnderTest.recoverMisplacedTokens(
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
            contractUnderTest = await initTokenContract(
              await initOpsContract()
            );
            toAccount = contractOwner.address;
            originalHoldingBalance = await contractUnderTest.balanceOf(
              contractOwner.address
            );
          });

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

      let contractUnderTest: ViciERC20UtilityToken;
      let operatorAccounts: Map<String, SignerWithAddress> = new Map();
      let testAccounts: Map<string, string> = new Map();
      let testCase: NegativeTestCase = {
        operator: regularUser,
        fromAddress: "",
        balance: BigNumber.from("0"),
      };
      let operators = ["the airdropper role", "no assigned roles"];
      let users = ["a lost wallet", "a wallet not marked as lost"];

      this.beforeAll(async function () {
        contractUnderTest = await initTokenContract(await initOpsContract());
        await contractUnderTest.mint(
          lostWallet1.address,
          ethers.utils.parseEther("1.0")
        );
        await contractUnderTest.mint(
          regularUser.address,
          ethers.utils.parseEther("1.0")
        );

        operatorAccounts.set("the airdropper role", airdropper);
        operatorAccounts.set("no assigned roles", regularUser);

        testAccounts.set("a lost wallet", lostWallet1.address);
        testAccounts.set("a wallet not marked as lost", regularUser.address);
      });

      function runNegativeTests(expectedError: string) {
        it(`the error is "${expectedError}"`, async function () {
          await expect(
            contractUnderTest
              .connect(testCase.operator)
              .recoverMisplacedTokens(
                testCase.fromAddress,
                contractOwner.address
              )
          ).to.be.revertedWith(expectedError);
        });

        it("the user's funds are safu", async function () {
          expect(
            await contractUnderTest.balanceOf(testCase.fromAddress)
          ).to.equal(testCase.balance);
        });
      }

      context(
        "When the contract owner tries to recover misplaced tokens",
        function () {
          context("from a wallet not marked as lost", function () {
            this.beforeAll(async function () {
              testCase = {
                operator: contractOwner,
                fromAddress: regularUser.address,
                balance: await contractUnderTest.balanceOf(regularUser.address),
              };
            });

            runNegativeTests("not a lost wallet");
          });
        }
      );

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
  }); // Recover misplaced tokens feature
}); // Test ERC20 Utility Extensions
