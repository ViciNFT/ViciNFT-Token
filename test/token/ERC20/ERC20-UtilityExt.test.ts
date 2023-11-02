import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  BigNumber,
  BigNumberish,
  ContractReceipt,
  ContractTransaction,
  Event,
} from "ethers";
import { expect } from "chai";
import hardhat, { ethers } from "hardhat";

import {
  MOCK_CONTRACTS,
  proxyDeploy,
  proxyDeployWithInitSignature,
} from "../../test-utils/CommonContracts";

import { EventABI, checkEvent, expectEvent, getEventsFromReceipt } from "../../helper";
import {
  AccessServer,
  MockERC20UtilityOperations,
  ViciERC20MintableUtilityToken,
} from "../../../typechain-types";
import { EventFragment, Result } from "ethers/lib/utils";

const ADMIN =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const AIRDROPPER =
  "0x61697264726f7000000000000000000000000000000000000000000000000000";
const UNLOCK_LOCKED_TOKENS =
  "0x37249df393341b44efdd3346cab09b4c28cea741d58a8808e0d108ab3884652d";
const LOST_WALLET =
  "0xe33f057fb711996a9186bf42fdf8caf29cf94c723598d4f2a6e4c156c86bc15a";

const ONE_ZILLION = BigNumber.from(
  "115792089237316195423570985008687907853269984665640564039457584007913129639935"
);

const GRANT_TIMESTAMP = BigNumber.from(1000);
const AIRDROP_THRESHOLD = BigNumber.from(10000);

const LOCK_UPDATED_EVENT = new EventABI(
  "LockUpdated(address,uint256,uint256)",
  EventFragment.fromObject({
    name: "LockUpdated",
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "account",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "previousRelease",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "newRelease",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
  })
);

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
  let mockMultiSig: SignerWithAddress;

  let accessServer: AccessServer;

  let initOpsContract: () => Promise<MockERC20UtilityOperations>;
  let initTokenContract: (
    ops: MockERC20UtilityOperations
  ) => Promise<ViciERC20MintableUtilityToken>;

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
    mockMultiSig = signers[8];

    accessServer = await MOCK_CONTRACTS.mockAccessServer();

    initOpsContract = async function (): Promise<MockERC20UtilityOperations> {
      let ops = (await proxyDeployWithInitSignature(
        "MockERC20UtilityOperations",
        "initialize(uint256,uint256)",
        ONE_ZILLION,
        AIRDROP_THRESHOLD
      )) as MockERC20UtilityOperations;

      ops.setCurrentTimestamp(GRANT_TIMESTAMP);
      return ops;
    };

    initTokenContract = async function (
      ops: MockERC20UtilityOperations
    ): Promise<ViciERC20MintableUtilityToken> {
      let newContract = (await proxyDeployWithInitSignature(
        "ViciERC20MintableUtilityToken",
        "initialize(address,address,string,string,uint8,bool)",
        accessServer.address,
        ops.address,
        "Vici Utility Token",
        "VCUT",
        18,
        true
      )) as ViciERC20MintableUtilityToken;

      await ops.transferOwnership(newContract.address);

      await newContract.grantRole(AIRDROPPER, airdropper.address);
      await newContract.grantRole(LOST_WALLET, lostWallet1.address);
      await newContract.grantRole(LOST_WALLET, lostWallet2.address);
      await newContract.grantRole(UNLOCK_LOCKED_TOKENS, mockMultiSig.address);
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
    let contractUnderTest: ViciERC20MintableUtilityToken;
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
        release: BigNumber
      ): Promise<ContractReceipt> {
        airdropSender = sender;
        airdropRecipient = recipient;
        airdropAmount = amount;
        releaseTimestamp = release;
        let tx = await contractUnderTest
          .connect(sender)
          .airdropTimelockedTokens(recipient.address, amount, releaseTimestamp);
        return await tx.wait();
      }

      async function do_airdrop_by_duration(
        sender: SignerWithAddress,
        recipient: SignerWithAddress,
        amount: BigNumber,
        duration: BigNumber
      ): Promise<ContractReceipt> {
        return do_airdrop(
          sender,
          recipient,
          amount,
          (await ops.currentTimestamp()).add(duration)
        );
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
            receipt = await do_airdrop_by_duration(
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
            receipt = await do_airdrop_by_duration(
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
          let originalReleaseDate: BigNumber = GRANT_TIMESTAMP.add(2000);

          async function existingTimelockSetup(
            newAmount: BigNumber,
            newRelease: BigNumber
          ) {
            await airdropTestSetup();
            await do_airdrop(
              contractOwner,
              timelockedAccount1,
              BigNumber.from(1000),
              originalReleaseDate
            );

            originalUnlockedAmount = START_AMOUNT;
            originalLockedAmount = await contractUnderTest.lockedBalanceOf(
              timelockedAccount1.address
            );
            ops.incrementTimestamp(50);

            // console.log({
            //   airdropThreshold: await ops.airdropThreshold(),
            //   originalLockedAmount: originalLockedAmount,
            //   newAmount: newAmount,
            //   originalReleaseDate: await contractUnderTest.lockReleaseDate(
            //     timelockedAccount1.address
            //   ),
            //   newRelease: newRelease,
            // });

            receipt = await do_airdrop(
              contractOwner,
              timelockedAccount1,
              newAmount,
              newRelease
            );

            // console.log("after 2nd airdrop: ", {
            //   newLockedAmount: await contractUnderTest.lockedBalanceOf(
            //     timelockedAccount1.address
            //   ),
            //   newReleaseDate: await contractUnderTest.lockReleaseDate(
            //     timelockedAccount1.address
            //   ),
            // });
          }

          async function existingTimelockTeardown() {
            receipt = undefined as unknown as ContractReceipt;
          }

          context(
            "If the amount is less than the airdrop threshold",
            function () {
              context(
                "and the release parameter is before the existing lock release",
                function () {
                  this.beforeAll(async function () {
                    await existingTimelockSetup(
                      AIRDROP_THRESHOLD.sub(1),
                      originalReleaseDate.sub(1)
                    );
                    releaseTimestamp = originalReleaseDate;
                  });
                  this.afterAll(existingTimelockTeardown);

                  airdropWasSuccessful("unchanged");
                }
              ); // release parameter is before the existing lock release
              context(
                "and the release parameter is after the existing lock release",
                function () {
                  this.beforeAll(async function () {
                    await existingTimelockSetup(
                      AIRDROP_THRESHOLD.sub(1),
                      originalReleaseDate.add(1)
                    );
                    releaseTimestamp = originalReleaseDate;
                  });
                  this.afterAll(existingTimelockTeardown);

                  airdropWasSuccessful("unchanged");
                } // release parameter is after the existing lock release
              );
            }
          ); // If the amount is less than the airdrop threshold

          context(
            "If the amount meets or exceeds the airdrop threshold",
            function () {
              context(
                "and the release parameter is before the existing lock release",
                function () {
                  this.beforeAll(async function () {
                    await existingTimelockSetup(
                      AIRDROP_THRESHOLD.add(1),
                      originalReleaseDate.sub(1)
                    );
                    releaseTimestamp = originalReleaseDate;
                  });
                  this.afterAll(existingTimelockTeardown);

                  airdropWasSuccessful("unchanged");
                } // release parameter is before the existing lock release
              );
              context(
                "and the release parameter is after the existing lock release",
                function () {
                  this.beforeAll(async function () {
                    releaseTimestamp = originalReleaseDate.add(1);

                    await existingTimelockSetup(
                      AIRDROP_THRESHOLD.add(1),
                      releaseTimestamp
                    );
                  });
                  this.afterAll(existingTimelockTeardown);

                  airdropWasSuccessful("updated");

                  it("LockUpdated is emitted", async function () {
                    expectEvent(receipt, LOCK_UPDATED_EVENT, {
                      account: timelockedAccount1.address,
                      previousRelease: originalReleaseDate,
                      newRelease: releaseTimestamp,
                    });
                  });
                } // release parameter is after the existing lock release
              );
            }
          ); // If the amount is less than the airdrop threshold

          this.beforeAll(async function () {
            await airdropTestSetup();
            await do_airdrop_by_duration(
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

            receipt = await do_airdrop_by_duration(
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
            await do_airdrop_by_duration(
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

            receipt = await do_airdrop_by_duration(
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
      let expectedLockRelease: BigNumber;

      this.beforeAll(async function () {
        await airdropTestSetup();
        expectedLockRelease = (await ops.currentTimestamp()).add(100);
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount1.address,
          AIRDROP_AMOUNT,
          expectedLockRelease
        );
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount2.address,
          AIRDROP_AMOUNT,
          expectedLockRelease
        );
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount3.address,
          AIRDROP_AMOUNT,
          expectedLockRelease
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
          ).to.equal(expectedLockRelease);
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
        let lockReleaseDate = (await ops.currentTimestamp()).add(DURATION);
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount1.address,
          AIRDROP_AMOUNT,
          lockReleaseDate
        );
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount2.address,
          AIRDROP_AMOUNT,
          lockReleaseDate
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
        releaseTimestamp = (await ops.currentTimestamp()).add(duration);
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount1.address,
          AIRDROP_AMOUNT,
          releaseTimestamp
        );
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount2.address,
          AIRDROP_AMOUNT,
          releaseTimestamp
        );
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

        context("as the multisig wallet", function () {
          this.beforeAll(async function () {
            unlockedUser = timelockedAccount1.address;
            unlockAmount = amount;
            await contractUnderTest
              .connect(mockMultiSig)
              .unlockLockedTokens(unlockedUser, amount);
          });

          unlockWasSuccessful();
        });

        context("as a user with AIRDROPPER role", function () {
          it("the error is 'AccessControl: account is missing role'", async function () {
            await expect(
              contractUnderTest
                .connect(airdropper)
                .unlockLockedTokens(timelockedAccount3.address, amount)
            ).to.be.revertedWith(
              `AccessControl: account ${airdropper.address.toLocaleLowerCase()} is missing role ${UNLOCK_LOCKED_TOKENS}`
            );
          });
        });

        context("as a regular user", function () {
          it("the error is 'AccessControl: account is missing role'", async function () {
            await expect(
              contractUnderTest
                .connect(regularUser)
                .unlockLockedTokens(timelockedAccount3.address, amount)
            ).to.be.revertedWith(
              `AccessControl: account ${regularUser.address.toLocaleLowerCase()} is missing role ${UNLOCK_LOCKED_TOKENS}`
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

    describe("Batch lock update feature", function () {
      let addresses: string[];
      let lockAmount = BigNumber.from(1000);
      let originalReleaseDate = GRANT_TIMESTAMP.add(1000);
      let newReleaseDate: BigNumber;
      let lockUpdateEvents: Map<string, Event>;

      this.beforeAll(async function () {
        addresses = [
          timelockedAccount1.address,
          timelockedAccount2.address,
          timelockedAccount3.address,
          regularUser.address,
        ];
      });

      async function batchLockSetup() {
        await airdropTestSetup();
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount1.address,
          lockAmount,
          originalReleaseDate
        );
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount2.address,
          lockAmount,
          originalReleaseDate
        );
        await contractUnderTest.airdropTimelockedTokens(
          timelockedAccount3.address,
          lockAmount,
          originalReleaseDate
        );
      }

      async function extractEvents() {
        let events = getEventsFromReceipt(receipt, LOCK_UPDATED_EVENT);
        lockUpdateEvents = new Map();
        for (let event of events) {
          let result = event.args as Result;
          lockUpdateEvents.set(result.account, event);
        }
      }

      async function batchLockTeardown() {
        receipt = undefined as unknown as ContractReceipt;
      }

      function lockWasUpdated(index: number) {
        context(`Checking user ${index} (with locked balance)`, function () {
          let user: string;
          let event: Event | null;

          this.beforeAll(async function () {
            user = addresses[index];
            event = lockUpdateEvents.get(user) ?? null;
          });

          it("the user's locked balance is unchanged", async function () {
            expect(await contractUnderTest.lockedBalanceOf(user)).to.equal(
              lockAmount
            );
          });

          it("The user's timelock is updated", async function () {
            expect(await contractUnderTest.lockReleaseDate(user)).to.equal(
              newReleaseDate
            );
          });

          it("LockUpdated is emitted", async function () {
            checkEvent(event, {
              account: user,
              previousRelease: originalReleaseDate,
              newRelease: newReleaseDate,
            });
          });
        });
      } // lockWasUpdated

      function userWasUnlocked(index: number) {
        context(`Checking user ${index} (with locked balance)`, function () {
          let user: string;

          this.beforeAll(async function () {
            user = addresses[index];
          });

          it("the locked balance is decreased to 0", async function () {
            expect(await contractUnderTest.lockedBalanceOf(user)).to.equal(0);
          });

          it("the unlocked balance is increased to the full balance", async function () {
            expect(await contractUnderTest.unlockedBalanceOf(user)).to.equal(
              START_AMOUNT.add(lockAmount)
            );
          });

          it("the lockReleaseDate is set to 0", async function () {
            expect(await contractUnderTest.lockReleaseDate(user)).to.equal(0);
          });
        });
      } // userWasUnlocked

      function userWasUnaffected(index: number) {
        context(`Checking user ${index} (with no locked balance)`, function () {
          let user: string;

          this.beforeAll(async function () {
            user = addresses[index];
          });

          it("the locked balance is still to 0", async function () {
            expect(await contractUnderTest.lockedBalanceOf(user)).to.equal(0);
          });

          it("the unlocked balance is equal to the full balance", async function () {
            expect(await contractUnderTest.unlockedBalanceOf(user)).to.equal(
              await contractUnderTest.balanceOf(user)
            );
          });

          it("the lockReleaseDate is still 0", async function () {
            expect(await contractUnderTest.lockReleaseDate(user)).to.equal(0);
          });
        });
      } // userWasUnaffected

      context("When called by the multisig", function () {
        context("If the new lock release is later", function () {
          this.beforeAll(async function () {
            await batchLockSetup();
            newReleaseDate = originalReleaseDate.add(500);
            let tx = await contractUnderTest.updateTimelocks(
              newReleaseDate,
              addresses
            );
            receipt = await tx.wait();
            await extractEvents();
          });

          this.afterAll(batchLockTeardown);

          lockWasUpdated(0);
          lockWasUpdated(1);
          lockWasUpdated(2);
          userWasUnaffected(3);
        }); // new lock release is later
        context("If the new lock release is earlier", function () {
          this.beforeAll(async function () {
            await batchLockSetup();
            newReleaseDate = originalReleaseDate.sub(500);
            let tx = await contractUnderTest.updateTimelocks(
              newReleaseDate,
              addresses
            );
            receipt = await tx.wait();
            await extractEvents();
          });

          this.afterAll(batchLockTeardown);

          lockWasUpdated(0);
          lockWasUpdated(1);
          lockWasUpdated(2);
          userWasUnaffected(3);
        }); // new lock release is earlier
        context("If the new lock release is in the past", function () {
          this.beforeAll(async function () {
            await batchLockSetup();
            newReleaseDate = (await ops.currentTimestamp()).sub(500);
            let tx = await contractUnderTest.updateTimelocks(
              newReleaseDate,
              addresses
            );
            receipt = await tx.wait();
          });

          this.afterAll(batchLockTeardown);

          userWasUnlocked(0);
          userWasUnlocked(1);
          userWasUnlocked(2);
          userWasUnaffected(3);
        }); // new lock release is in the past
      }); // When called by the multisig

      context("When called by a user with AIRDROPPER role", function () {
        this.beforeAll(batchLockSetup);

        it("the error is 'AccessControl: account is missing role'", async function () {
          newReleaseDate = (await ops.currentTimestamp()).sub(500);
          await expect(
            contractUnderTest
              .connect(airdropper)
              .updateTimelocks(newReleaseDate, addresses)
          ).to.be.revertedWith(
            `AccessControl: account ${airdropper.address.toLocaleLowerCase()} is missing role ${UNLOCK_LOCKED_TOKENS}`
          );
        });
      });

      context("When called by a regular user", function () {
        this.beforeAll(batchLockSetup);

        it("the error is 'AccessControl: account is missing role'", async function () {
          newReleaseDate = (await ops.currentTimestamp()).sub(500);
          await expect(
            contractUnderTest
              .connect(regularUser)
              .updateTimelocks(newReleaseDate, addresses)
          ).to.be.revertedWith(
            `AccessControl: account ${regularUser.address.toLocaleLowerCase()} is missing role ${UNLOCK_LOCKED_TOKENS}`
          );
        });
      });
    }); // Batch lock update feature
  }); // Airdropped locked tokens feature

  describe("Recover misplaced tokens feature", function () {
    describe("Postive tests", function () {
      context("When calling `recoverMisplacedTokens()` as owner", function () {
        let contractUnderTest: ViciERC20MintableUtilityToken;
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

      let contractUnderTest: ViciERC20MintableUtilityToken;
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
