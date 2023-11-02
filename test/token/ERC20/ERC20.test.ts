import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, ContractReceipt, ContractTransaction } from "ethers";
import { expect } from "chai";
import hardhat from "hardhat";
const { constants } = require("@openzeppelin/test-helpers");

import {
  MOCK_CONTRACTS,
  proxyDeploy,
  proxyDeployWithInitSignature,
} from "../../test-utils/CommonContracts";

import { expectEvent } from "../../helper";
import {
  AccessServer,
  ERC20Operations,
  MockSanctions,
  ViciMintableERC20,
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
const max_supply = 1000;

const firstTokenAmount = BigNumber.from(100);
const secondTokenAmount = BigNumber.from(200);
const tokenAmountHeldByBannedUser = BigNumber.from(66666);
const tokenAmountHeldByOligarch = BigNumber.from(88888);

// This test can take a while to run.
// If you just want to test certain parts, set testEverything to false,
// then set the parts you want to true.
let testEverything = true;

let testTransfer = testEverything;

let testDefaultMint = testEverything;
let testMintToUsers = testEverything;

let testBurnByContractOwner = testEverything;
let testBurnByCreator = testEverything;
let testBurnWithApproval = testEverything;
let testBurnWithDefault = testEverything;

describe("Test ERC20 ", () => {
  // define common variables here
  let signers: SignerWithAddress[];

  let contractOwner: SignerWithAddress;
  let admin: SignerWithAddress;
  let customerService: SignerWithAddress;
  let minter: SignerWithAddress;

  let holder1: SignerWithAddress;
  let holder2: SignerWithAddress;
  let holder3: SignerWithAddress;
  let agent: SignerWithAddress;
  let operator: SignerWithAddress;
  let noCoiner: SignerWithAddress;
  let bannedUser: SignerWithAddress;
  let l33tHaxx0r: SignerWithAddress;
  let oligarch: SignerWithAddress;

  let accessServer: AccessServer;
  let tokenContract: ViciMintableERC20;
  let sanctionsOracle: MockSanctions;

  let initTokenContract: () => Promise<ViciMintableERC20>;

  before(async function () {
    // test setup
    signers = await hardhat.ethers.getSigners();
    contractOwner = signers[0];
    admin = signers[1];
    customerService = signers[2];
    minter = signers[3];
    holder1 = signers[4];
    holder2 = signers[5];
    agent = signers[6];
    noCoiner = signers[7];
    bannedUser = signers[8];
    l33tHaxx0r = signers[9];
    operator = signers[10];
    holder3 = signers[11];
    oligarch = signers[12];

    accessServer = await MOCK_CONTRACTS.mockAccessServer();

    sanctionsOracle = await MOCK_CONTRACTS.mockSanctionsList();
    await sanctionsOracle.addToSanctionsList([oligarch.address]);
    await accessServer.setSanctionsList(sanctionsOracle.address);

    initTokenContract = async function (): Promise<ViciMintableERC20> {
      let erc20Ops = (await proxyDeploy(
        "ERC20Operations",
        max_supply
      )) as ERC20Operations;

      let newContract = (await proxyDeployWithInitSignature(
        "ViciMintableERC20",
        "initialize(address,address,string,string,uint8,bool)",
        accessServer.address,
        erc20Ops.address,
        name,
        symbol,
        decimals,
        false
      )) as ViciMintableERC20;
      erc20Ops.transferOwnership(newContract.address);

      await sanctionsOracle.removeFromSanctionsList([oligarch.address]);

      await newContract.mint(bannedUser.address, 5);
      await newContract.mint(oligarch.address, 5);
      await newContract.grantRole(ADMIN, admin.address);
      await newContract.grantRole(MINTER, minter.address);
      await newContract.grantRole(CUSTOMER_SERVICE, customerService.address);
      await newContract.grantRole(MINTER, minter.address);
      await newContract.grantRole(BANNED, bannedUser.address);

      await sanctionsOracle.addToSanctionsList([oligarch.address]);

      return newContract;
    };

    tokenContract = await initTokenContract();
  });

  after(async function () {
    await sanctionsOracle.removeFromSanctionsList([oligarch.address]);
  });

  describe("Test behavior with minted tokens", function () {
    beforeEach(async function () {
      await tokenContract.mint(holder1.address, 1);
      await tokenContract.mint(holder2.address, 7);
    });

    context("Checking balance", function () {
      it("Should return correct balance for holder", async function () {
        expect(await tokenContract.balanceOf(holder2.address)).to.equal(7);
      });

      it("Should return 0 for non holder", async function () {
        expect(await tokenContract.balanceOf(noCoiner.address)).to.equal(0);
      });

      it("Should revert for null address", async function () {
        await expect(
          tokenContract.balanceOf(constants.ZERO_ADDRESS)
        ).to.be.revertedWith("invalid user");
      });
    });

    context("Enumerating", function () {
      context("by owner", function () {
        context("when the given index is in the list", function () {
          it("returns the address placed at the given index", async function () {
            expect(await tokenContract.getOwnerAtIndex(2)).to.equal(
              holder1.address
            );
          });
        });

        context(
          "when the index is greater than or equal to the total items in the list",
          function () {
            it("reverts", async function () {
              await expect(tokenContract.getOwnerAtIndex(5)).to.be.revertedWith(
                "owner index out of bounds"
              );
            });
          }
        );

        context("when owner count matches", function () {
          it("returns the owner count", async function () {
            expect(await tokenContract.getOwnerCount()).to.equal(4);
          });
        });
      });
    });

    context("Transferring", function () {
      let contractUnderTest: ViciMintableERC20;
      let tx: ContractTransaction;
      let receipt: ContractReceipt;

      let tokenOwner: SignerWithAddress;
      let tokenAmount: BigNumber;

      beforeEach(async function () {
        contractUnderTest = await initTokenContract();
        tokenAmount = firstTokenAmount;
        await contractUnderTest.mint(holder1.address, firstTokenAmount);
        await contractUnderTest.mint(holder2.address, secondTokenAmount);
        await contractUnderTest
          .connect(holder1)
          .approve(agent.address, tokenAmount);
        await contractUnderTest
          .connect(holder1)
          .approve(operator.address, tokenAmount);
      });

      function transferWasSuccessful() {
        let owner: string;
        beforeEach(async function () {
          owner = tokenOwner.address;
        });

        it("transfers the ownership of the given token Amount to the given address", async function () {
          let supply: number = (
            await contractUnderTest.totalSupply()
          ).toNumber();
          expect(await contractUnderTest.balanceOf(this.toWhom)).to.be.equal(
            tokenAmount
          );
        });

        it("emits a Transfer event", async function () {
          expectEvent(receipt, "Transfer", {
            from: owner,
            to: this.toWhom,
            value: tokenAmount,
          });
        });

        it("adjusts owners balances", async function () {
          expect(await contractUnderTest.balanceOf(holder1.address)).to.equal(
            0
          );
          expect(await contractUnderTest.balanceOf(this.toWhom)).to.equal(100);
        });
      }

      type TransferFunction = (
        contractUnderTest: ViciMintableERC20,
        owner: string,
        toWhom: string,
        amount: BigNumber,
        op: SignerWithAddress
      ) => Promise<ContractTransaction>;

      function shouldTransferTokensByUsers(transferFunction: TransferFunction) {
        context("When called by the owner", function () {
          this.beforeEach(async function () {
            tokenOwner = holder1;
            tx = await transferFunction.call(
              this,
              contractUnderTest,
              holder1.address,
              this.toWhom,
              firstTokenAmount,
              holder1
            );
            receipt = await tx.wait();
          });

          transferWasSuccessful();
        });

        context("When called by the approved individual", function () {
          this.beforeEach(async function () {
            tokenOwner = holder1;

            tx = await transferFunction.call(
              this,
              contractUnderTest,
              holder1.address,
              this.toWhom,
              firstTokenAmount,
              agent
            );
            receipt = await tx.wait();
          });

          transferWasSuccessful();
        });

        context("When called by the operator", function () {
          this.beforeEach(async function () {
            tokenOwner = holder1;

            tx = await transferFunction.call(
              this,
              contractUnderTest,
              holder1.address,
              this.toWhom,
              firstTokenAmount,
              operator
            );
            receipt = await tx.wait();
          });

          transferWasSuccessful();
        });

        context(
          "When called by the operator without an approved user",
          function () {
            this.beforeEach(async function () {
              tokenOwner = holder1;
              await contractUnderTest
                .connect(holder1)
                .approve(holder3.address, firstTokenAmount);

              tx = await transferFunction.call(
                this,
                contractUnderTest,
                holder1.address,
                this.toWhom,
                firstTokenAmount,
                operator
              );
              receipt = await tx.wait();
            });

            transferWasSuccessful();
          }
        );

        context("when sent to the owner", function () {
          this.beforeEach(async function () {
            tx = await transferFunction.call(
              this,
              contractUnderTest,
              holder1.address,
              holder1.address,
              firstTokenAmount,
              holder1
            );
            receipt = await tx.wait();
          });

          it("keeps ownership of the token", async function () {
            expect(await contractUnderTest.balanceOf(holder1.address)).to.equal(
              firstTokenAmount
            );
          });

          /*it("clears the approval for the token ID", async function () {
            expect(await contractUnderTest.getApproved(firstTokenAmount)).to.equal(
              constants.ZERO_ADDRESS
            );
          });*/

          it("emits only a transfer event", async function () {
            expectEvent(receipt, "Transfer", {
              from: holder1.address,
              to: holder1.address,
              value: firstTokenAmount,
            });
          });

          it("keeps the owner balance", async function () {
            expect(await contractUnderTest.balanceOf(holder1.address)).to.equal(
              100
            );
          });
        });

        context(
          "when the address of the previous owner is incorrect",
          function () {
            it("reverts", async function () {
              await expect(
                transferFunction.call(
                  this,
                  contractUnderTest,
                  noCoiner.address,
                  this.toWhom,
                  firstTokenAmount,
                  holder1
                )
              ).to.be.revertedWith("not authorized");
            });
          }
        );

        context(
          "when the sender is not authorized for the token amount",
          function () {
            it("reverts", async function () {
              await expect(
                transferFunction.call(
                  this,
                  contractUnderTest,
                  holder1.address,
                  l33tHaxx0r.address,
                  firstTokenAmount,
                  l33tHaxx0r
                )
              ).to.be.revertedWith("not authorized");
            });
          }
        );

        context(
          "when the address to transfer the token to is the zero address",
          function () {
            it("reverts", async function () {
              await expect(
                transferFunction.call(
                  this,
                  contractUnderTest,
                  holder1.address,
                  constants.ZERO_ADDRESS,
                  firstTokenAmount,
                  holder1
                )
              ).to.be.revertedWith("ERC20: transfer to the zero address");
            });
          }
        );

        context(
          "when the address to transfer the token from is the zero address",
          function () {
            it("reverts", async function () {
              await expect(
                transferFunction.call(
                  this,
                  contractUnderTest,
                  constants.ZERO_ADDRESS,
                  holder1.address,
                  firstTokenAmount,
                  holder1
                )
              ).to.be.revertedWith("ERC20: transfer from the zero address");
            });
          }
        );

        // context("when the contract is paused", function () {
        //   it("reverts", async function () {
        //     await contractUnderTest.pause();

        //     await expect(
        //       transferFunction.call(
        //         this,
        //         contractUnderTest,
        //         holder1.address,
        //         this.toWhom,
        //         firstTokenAmount,
        //         holder1
        //       )
        //     ).to.be.revertedWith("Pausable: paused");
        //   });
        // });

        context("when the sender is banned", function () {
          it("reverts", async function () {
            await expect(
              transferFunction.call(
                this,
                contractUnderTest,
                bannedUser.address,
                this.toWhom,
                tokenAmountHeldByBannedUser,
                bannedUser
              )
            ).to.be.revertedWith("AccessControl: banned");
          });
        });

        context("when the sender is sanctioned", function () {
          it("reverts", async function () {
            await expect(
              transferFunction.call(
                this,
                contractUnderTest,
                oligarch.address,
                this.toWhom,
                tokenAmountHeldByOligarch,
                oligarch
              )
            ).to.be.revertedWith("OFAC sanctioned address");
          });
        });

        context("when the receiver is banned", function () {
          it("reverts", async function () {
            await expect(
              transferFunction.call(
                this,
                contractUnderTest,
                holder1.address,
                bannedUser.address,
                firstTokenAmount,
                holder1
              )
            ).to.be.revertedWith("AccessControl: banned");
          });
        });

        context("when the receiver is sanctioned", function () {
          it("reverts", async function () {
            await expect(
              transferFunction.call(
                this,
                contractUnderTest,
                holder1.address,
                oligarch.address,
                firstTokenAmount,
                holder1
              )
            ).to.be.revertedWith("OFAC sanctioned address");
          });
        });
      }

      context("via transferFrom", function () {
        this.beforeEach(async function () {
          this.toWhom = holder3.address;
        });

        let transferFunction: TransferFunction = (
          contractUnderTest,
          owner,
          toWhom,
          amount,
          op
        ) => {
          return contractUnderTest
            .connect(op)
            .transferFrom(owner, toWhom, amount);
        };

        if (testTransfer) shouldTransferTokensByUsers(transferFunction);
      });
    });

    context("Approving", function () {
      let contractUnderTest: ViciMintableERC20;
      let tx: ContractTransaction;
      let receipt: ContractReceipt;
      let expectedApproved: string;
      let expectedApprovalAmount: BigNumber;

      this.beforeEach(async function () {
        contractUnderTest = await initTokenContract();
        await contractUnderTest.mint(holder1.address, firstTokenAmount);
      });

      function approvalWasSuccessful() {
        it("Emits an approval event", async function () {
          expectEvent(receipt, "Approval", {
            owner: holder1.address,
            spender: expectedApproved,
            value: expectedApprovalAmount,
          });
        });

        it("Approves the spender", async function () {
          expect(
            await contractUnderTest.allowance(holder1.address, expectedApproved)
          ).to.equal(expectedApprovalAmount);
        });

        it("Spender can spend on behalf of owner", async function () {
          let spendAmount = expectedApprovalAmount;
          let balance = await contractUnderTest.balanceOf(holder1.address);
          if (balance < spendAmount) {
            spendAmount = balance;
          }

          await contractUnderTest
            .connect(agent)
            .transferFrom(holder1.address, expectedApproved, spendAmount);
        });
      }

      context("when approving a zero address", function () {
        context("when there was no prior approval", function () {
          it("reverts", async function () {
            await expect(
              contractUnderTest
                .connect(holder1)
                .approve(constants.ZERO_ADDRESS, firstTokenAmount)
            ).to.be.revertedWith("invalid user");
          });
        });

        context("when there was a prior approval", function () {
          beforeEach(async function () {
            expectedApproved = constants.ZERO_ADDRESS;

            await contractUnderTest
              .connect(holder1)
              .approve(agent.address, firstTokenAmount);

            it("reverts", async function () {
              await expect(
                contractUnderTest
                  .connect(holder1)
                  .approve(constants.ZERO_ADDRESS, firstTokenAmount)
              ).to.be.revertedWith("invalid user");
            });
          });
        });
      });

      context("when approving a non-zero address", function () {
        context("when there was no prior approval", function () {
          beforeEach(async function () {
            expectedApproved = agent.address;

            tx = await contractUnderTest
              .connect(holder1)
              .approve(agent.address, firstTokenAmount);
            receipt = await tx.wait();
            expectedApprovalAmount = firstTokenAmount;
          });

          approvalWasSuccessful();
        });

        context(
          "when there was a prior approval to the same address",
          function () {
            beforeEach(async function () {
              expectedApproved = agent.address;

              await contractUnderTest
                .connect(holder1)
                .approve(agent.address, firstTokenAmount);

              tx = await contractUnderTest
                .connect(holder1)
                .approve(agent.address, firstTokenAmount);
              receipt = await tx.wait();
              expectedApprovalAmount = firstTokenAmount;
            });

            approvalWasSuccessful();
          }
        );

        context(
          "when there was a prior approval to a different address",
          function () {
            beforeEach(async function () {
              expectedApproved = operator.address;

              await contractUnderTest
                .connect(holder1)
                .approve(agent.address, firstTokenAmount);

              tx = await contractUnderTest
                .connect(holder1)
                .approve(operator.address, firstTokenAmount);
              receipt = await tx.wait();
              expectedApprovalAmount = firstTokenAmount;
            });

            approvalWasSuccessful();
          }
        );
      });

      context(
        "when the address that receives the approval is the owner",
        function () {
          it("reverts", async function () {
            await expect(
              contractUnderTest
                .connect(holder1)
                .approve(holder1.address, firstTokenAmount)
            ).to.be.revertedWith("approval to self");
          });
        }
      );

      context(
        "when the sender is approved for more than balance amount",
        function () {
          beforeEach(async function () {
            expectedApproved = agent.address;

            tx = await contractUnderTest
              .connect(holder1)
              .approve(agent.address, secondTokenAmount);
            receipt = await tx.wait();
            expectedApprovalAmount = secondTokenAmount;
          });

          approvalWasSuccessful();
        }
      );

      context(
        "when the address that receives the approval is banned",
        function () {
          it("reverts", async function () {
            await expect(
              contractUnderTest
                .connect(holder1)
                .approve(bannedUser.address, firstTokenAmount)
            ).to.be.revertedWith("AccessControl: banned");
          });
        }
      );

      context(
        "when the address that receives the approval is sanctioned",
        function () {
          it("reverts", async function () {
            await expect(
              contractUnderTest
                .connect(holder1)
                .approve(oligarch.address, firstTokenAmount)
            ).to.be.revertedWith("OFAC sanctioned address");
          });
        }
      );

      context("when the sender is banned", function () {
        it("reverts", async function () {
          await expect(
            contractUnderTest
              .connect(bannedUser)
              .approve(agent.address, tokenAmountHeldByBannedUser)
          ).to.be.revertedWith("AccessControl: banned");
        });
      });

      context("when the sender is sanctioned", function () {
        it("reverts", async function () {
          await expect(
            contractUnderTest
              .connect(oligarch)
              .approve(agent.address, tokenAmountHeldByOligarch)
          ).to.be.revertedWith("OFAC sanctioned address");
        });
      });
    });
  }); //describe

  describe("Test Minting", () => {
    let contractUnderTest: ViciMintableERC20;
    let tx: ContractTransaction;
    let receipt: ContractReceipt;
    let toWhom: string;
    let amount = BigNumber.from(10);
    let expectedAvailable: number;
    let expectedSupply: number;

    beforeEach(async function () {
      contractUnderTest = await initTokenContract();
    });

    function mintWasSuccessful() {
      it("emits a Transfer event", async function () {
        expectEvent(receipt, "Transfer", {
          from: constants.ZERO_ADDRESS,
          to: toWhom,
          value: amount,
        });
      });

      it("creates the token", async function () {
        expect(await contractUnderTest.balanceOf(toWhom)).to.equal(amount);
        //expect(await contractUnderTest.ownerOf(tokenId)).to.equal(toWhom);
      });

      it("increments the total supply", async function () {
        expect(await contractUnderTest.totalSupply()).to.equal(expectedSupply);
      });

      it("decrements the total available", async function () {
        expect(await contractUnderTest.availableSupply()).to.equal(
          expectedAvailable
        );
      });

      it("does not allow minting more than the max supply", async function () {
        await expect(
          contractUnderTest.mint(holder2.address, expectedAvailable + 10)
        ).to.be.revertedWith("sold out");
      });
    }

    type MintFunction = (
      contractUnderTest: ViciMintableERC20,
      operator: SignerWithAddress,
      toWhom: string,
      amount: BigNumber
    ) => Promise<ContractTransaction>;

    function shouldMintToUsers(mintFunction: MintFunction) {
      context("when minting to a user", function () {
        this.beforeEach(async function () {
          tx = await mintFunction(
            contractUnderTest,
            contractOwner,
            toWhom,
            amount
          );
          receipt = await tx.wait();
        });

        mintWasSuccessful();
      });

      context("when minting by minter role", function () {
        this.beforeEach(async function () {
          toWhom = holder1.address;
          tx = await mintFunction(contractUnderTest, minter, toWhom, amount);
          receipt = await tx.wait();
        });

        mintWasSuccessful();
      });
    }

    function testMintFunction(mintFunction: MintFunction, data: string | null) {
      if (testMintToUsers) {
        context("to a user account", function () {
          this.beforeEach(async function () {
            toWhom = holder3.address;
          });

          shouldMintToUsers(mintFunction);
        });
      }
    }

    function testMintFunctions() {
      context("via mint(address,uint256)", function () {
        let mintFunction: MintFunction = (
          contractUnderTest,
          operator,
          toWhom,
          amount
        ) => {
          return contractUnderTest.connect(operator).mint(toWhom, amount);
        };

        if (testDefaultMint) {
          testMintFunction(mintFunction, null);
        }
      });
    }

    context("Minting", function () {
      this.beforeEach(async function () {
        // 10 is
        // - 5 minted to the banned user before being banned
        // - 5 minted to the oligarch before being sanctioned
        // - the 10 we are about to mint
        expectedSupply = 20;
        expectedAvailable = max_supply - 20;
      });

      if (testDefaultMint) testMintFunctions();
    });
  }); //describe

  describe("Test Burning", () => {
    let contractUnderTest: ViciMintableERC20;
    let tx: ContractTransaction;
    let receipt: ContractReceipt;
    let tokenOwner: string;
    let tokenToBurn: number;
    let tokenBurner: SignerWithAddress;
    let expectedAvailable: number;
    let expectedSupply: number;

    beforeEach(async function () {
      contractUnderTest = await initTokenContract();
    });

    function testBurnFunction() {
      context("with burnt token", function () {
        this.beforeEach(async function () {
          tx = await contractUnderTest
            .connect(tokenBurner)
            .burn(tokenOwner, tokenToBurn);
          receipt = await tx.wait();
          expectedSupply = expectedSupply - tokenToBurn;
          expectedAvailable = expectedAvailable + tokenToBurn;
        });

        it("emits a Transfer event", async function () {
          expectEvent(receipt, "Transfer", {
            from: tokenOwner,
            to: constants.ZERO_ADDRESS,
            value: BigNumber.from(tokenToBurn),
          });
        });

        it("deletes the token", async function () {
          expect(await contractUnderTest.balanceOf(tokenOwner)).to.equal(0);
        });

        it("decrements the total supply", async function () {
          expect(await contractUnderTest.totalSupply()).to.equal(
            expectedSupply
          );
        });

        it("increments the total available", async function () {
          expect(await contractUnderTest.availableSupply()).to.equal(
            expectedAvailable
          );
        });

        it("reverts when burning a token  that has been deleted", async function () {
          await expect(
            contractUnderTest.connect(tokenBurner).burn(tokenOwner, tokenToBurn)
          ).to.be.revertedWith("insufficient balance");
        });
      });
    }

    function shouldBurnSuccessfully() {
      context("with minted tokens", function () {
        this.beforeEach(async function () {
          await contractUnderTest.mint(contractOwner.address, 100);
          await contractUnderTest.mint(minter.address, 200);
          await contractUnderTest.mint(holder1.address, 400);
        });

        context("as contract owner burning own token", function () {
          this.beforeEach(async function () {
            tokenToBurn = 100;
            tokenBurner = contractOwner;
            tokenOwner = contractOwner.address;
          });

          if (testBurnByContractOwner) testBurnFunction();
        });

        context("as minter burning own token", function () {
          this.beforeEach(async function () {
            tokenToBurn = 200;
            tokenBurner = minter;
            tokenOwner = minter.address;
          });

          if (testBurnByCreator) testBurnFunction();
        });

        context("as contract owner approved by user", function () {
          this.beforeEach(async function () {
            tokenToBurn = 400;
            tokenBurner = contractOwner;
            tokenOwner = holder1.address;

            contractUnderTest
              .connect(holder1)
              .approve(contractOwner.address, 800);
          });

          if (testBurnWithApproval) testBurnFunction();
        });

        context("as minter approved by user", function () {
          this.beforeEach(async function () {
            tokenToBurn = 400;
            tokenBurner = minter;
            tokenOwner = holder1.address;

            contractUnderTest.connect(holder1).approve(minter.address, 800);
          });

          if (testBurnByCreator && testBurnWithApproval) testBurnFunction();
        });
      });
    }

    context("When burning tokens minted ", function () {
      this.beforeEach(async function () {
        // 10 is
        // - 5 minted to the banned user before being banned
        // - 5 minted to the oligarch before being sanctioned
        // - the 700 we are about to mint
        // - minus the one we are about to burn
        expectedSupply = 710;
        expectedAvailable = max_supply - 710;
      });

      if (testBurnWithDefault) shouldBurnSuccessfully();
    });
  }); //describe
});
