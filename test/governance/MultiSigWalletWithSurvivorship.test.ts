import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  BigNumber,
  BigNumberish,
  Contract,
  ContractReceipt,
  ContractTransaction,
  Event,
} from "ethers";
import { expect } from "chai";
import { ethers } from "hardhat";
import util from "util";

import {
  ContractABI,
  EventABI,
  encodeString,
  expectEvent,
  getEventFromReceipt,
} from "../helper";
import {
  MOCK_CONTRACTS,
  PROXY_UPGRADE_EVENT,
  deployERC20,
  getProxyAdmin,
  proxyDeploy,
} from "../test-utils/CommonContracts";
import {
  MockERC1155,
  MockERC1155__factory,
  MockERC20,
  MockERC20__factory,
  MockERC721,
  MockERC721__factory,
  MockMultiSigWallet,
  MockMultiSigWallet__factory,
  MockViciERC20,
  MockViciERC20__factory,
  MultiSigWalletWithSurvivorship,
  ProxyAdmin,
  ProxyAdmin__factory,
  ViciERC20UtilityToken,
} from "../../typechain-types";

type MultisigWallet = MultiSigWalletWithSurvivorship | MockMultiSigWallet;

interface MultisigArgs {
  signers?: string[];
  required?: number;
  lockPeriod?: number;
  liveAcctCheckin?: number;
  mock?: boolean;
}

type MultisigTransaction = [string, string, BigNumber, number, string] & {
  description: string;
  destination: string;
  value: BigNumber;
  status: number;
  data: string;
};
const TransactionStatus = {
  EVERY_STATUS: 0,
  UNCONFIRMED: 1,
  CONFIRMED: 2,
  EXECUTED: 3,
  VETOED: 4,
};

const MODERATOR =
  "0x6d6f64657261746f720000000000000000000000000000000000000000000000";
const BANNED =
  "0x62616e6e65640000000000000000000000000000000000000000000000000000";

const FIFTY_ONE_RANDOS = [
  "0x575215d1Efc1C7ed9D0bD91012c250561517922C",
  "0x5BBE40A5D274C0bD7457dea80D78BF0B819cD532",
  "0x7C67Aad1713E4377774BCe79692a8CAD98b61986",
  "0x361d4cf2538F0CEf8f4Ac7886B79BFA967a0fBeD",
  "0xF0E6b1F05eA1d6a93aF82C4D8ADBFF660Bef3c10",
  "0xf27DBa47308bfd1c247416C116bfd0b74AaB2466",
  "0x352b88412DcEbb939663f39768127261e4e78036",
  "0x6308f9855D13E7f1C0eC666E157e8fA6872dbB3d",
  "0x99232859c2C961Cf20DB2a6C69D1A877eD1B4D66",
  "0xD6384004CcEb76aCeC67a93514c3e4040adE2c4B",
  "0xc7245B5f68A0096dE44CA5f59c9e952b4A9AD426",
  "0x0da44afF85BCE0c0FEb43e59Ec825c1E7C466D6f",
  "0xAbE35E8355F6e985E1181F17763918161149D97e",
  "0xD9B0b4946DB44E611C08a5cf0FeD7710D56260a0",
  "0xEA89eb5b8E3BD3ec603eecbA9bF9EC38b2F0397B",
  "0xE492C9b6eaEcF0109b3c9264dc0d5Bb1D9847fA2",
  "0x9Ce42bC49a72899ebc8BCaB2da2a95E0c18F9daa",
  "0xE91d6D63Bfd3D149f4d52664742C5bB2C1543dFB",
  "0x727D8c0F675d13bff129061E94D22A552D98d07d",
  "0x2bF074B752eDd19959A40fA2ecA018E555C66b5a",
  "0xC36521a8c3982f5DBEB7B12e545dd221B476DeDA",
  "0x5d4567ad2b7DAEF63b381c3Fc18227699569321C",
  "0x05810ECe008b2D2c2bE71110cde1F894812321aC",
  "0x54e00C43dF11521360d8154bd7b174F7DfF973d7",
  "0xF0bF9980f4774392bd224143328c917EDBCa104a",
  "0x5d5960c9c2cB8458300D6BdC92FF344560330524",
  "0x573Ef472Ca175AfE7300bcd1eE2d470294B6465c",
  "0xe3d83c6ae4861cA7924De1C49559be304d645a98",
  "0x78CB79e6a6a0480FEC8AE1b5017Fed1F9B97D198",
  "0x6bc4dF576Adc0788734AbE83D8F2185cE498D1E9",
  "0x3197A97B8fBC3cbB491d39527c03675390c9F0D7",
  "0x66bfda8548A8Da042C19E295087Bb9a43a048Ee5",
  "0xf493643F6D942A4Ae1Cacf56a43F91dabcD116D2",
  "0xfD4F322a45CC6Ab6Fd76D4048006f03Cc79C2cc9",
  "0x43f78C195Ad29Cf5A5cf5D98e081d93De56F0FAa",
  "0x9D427dcECc569b3c264DB860792f6BfCfCbE8F5e",
  "0xc1d475c6fCFa7801BB776e210252a36b5f7b346F",
  "0xf5BA6f93ea4d1448b1DB3b49a4e889b38Cfc2079",
  "0x3C96b41d3A96c568c2d6FAB80dce7445FD3c7d19",
  "0x9C72A8B0466B3A307CdBbbeeB99F2E05055Cb9B8",
  "0xFcE6F6E724eE9b396b4DA8704B6cF0D991a991e1",
  "0x8324aAfB6EB45B0704CBdA5526a981f8BC5Fa58D",
  "0x0Ee8Dae741691096FCB1244e00a64d6Fb0E59E1A",
  "0x07Fc6d5bA30AF8523c130B6d6cA12E35F3c45037",
  "0xA259fAAd554faa579Cfd69dDF2A9032b193355eb",
  "0xa37D153B73ccc26185b6107EA49386071762DfE5",
  "0x78ac10202BE340ea6500918d67C4c1C3cf494842",
  "0x9cF8c9F7daD9A5Cb3C3A442De7686584b1F19832",
  "0x5136727e3c29c67fC1F8B434EeA91003fC159daa",
  "0x5226905872E05D332dc755E29b0156eD95374778",
  "0xbe001fB7726A9513ED138ea1957C84387609ff90",
];

let testEverything = true;
let testFilter = {
  testConstructor: testEverything,
  testSubmit: testEverything,
  testConfirmRevokeVeto: true,
  testOwnerMgmt: testEverything,
  testWalletFeatures: testEverything,
  testEnumerateTx: testEverything,
  testTimelock: testEverything,
  testSurvivorship: testEverything,
};

describe("Multisig Wallet", () => {
  let accessServer: Contract;
  let contractOwner: SignerWithAddress;
  let signatory1: SignerWithAddress;
  let signatory2: SignerWithAddress;
  let signatory3: SignerWithAddress;
  let signatory4: SignerWithAddress;
  let signatory5: SignerWithAddress;
  let defaultSignatories: string[];
  let rando: SignerWithAddress;
  let dummyEncodedTransaction: string;
  let dummyDescription = encodeString(`Dummy TX`);
  let walletABI: ContractABI;
  let initMultisig: (args: MultisigArgs) => Promise<MultisigWallet>;

  let signerMap: Map<string, SignerWithAddress> = new Map();

  function signerForAddress(address: string): SignerWithAddress {
    let signatory = signerMap.get(address);
    if (!signatory) {
      expect.fail(address);
    }
    return signatory;
  }

  /**
   * Submit the transaction and apply the required number of confirmations.
   * If there is a timelock, the transaction will not execute until the time
   * elapses and execute is called.
   *
   * Use this function if you just want the transaction to go through and don't
   * need to test the intermediate steps.
   *
   * @param destination contract to call the function on
   * @param callData encoded function call
   * @return the transaction receipt from the final confirm call.
   */
  async function submitAndConfirm(
    description: string,
    destination: string,
    callData: string,
    walletContract: MultisigWallet
  ): Promise<ContractReceipt> {
    let currentRequirement: number = (
      await walletContract.required()
    ).toNumber();

    let owners = await walletContract.getOwners();
    if (!description.startsWith("0x")) {
      description = encodeString(description);
    }

    let tx: ContractTransaction = await walletContract
      .connect(signerForAddress(owners[0]))
      .submitTransaction(description, destination, 0, callData);
    let receipt: ContractReceipt = await tx.wait();
    let submissionEvent = getEventFromReceipt(receipt, "Submission");
    expect(submissionEvent).to.be.not.null;
    let transactionId = submissionEvent?.args?.transactionId;

    for (let i = 1; i < currentRequirement; i++) {
      tx = await walletContract
        .connect(signerForAddress(owners[i]))
        .confirmTransaction(transactionId);
    }

    return tx.wait();
  }

  /**
   * Submit the transaction and apply the required number of confirmations.
   * If there is a lock time, set the confirmation time into the past, then execute.
   *
   * Use this function if you just want the transaction to go through and don't
   * need to test the intermediate steps.
   *
   * @param destination contract to call the function on
   * @param callData encoded function call
   * @return the transaction receipt from the final confirm call.
   */
  async function submitConfirmAndWait(
    description: string,
    destination: string,
    callData: string,
    walletContract: MockMultiSigWallet
  ): Promise<ContractReceipt> {
    let lockPeriod = (await walletContract.lockPeriod()).toNumber();
    let receiptPromise = submitAndConfirm(
      description,
      destination,
      callData,
      walletContract
    );
    if (lockPeriod == 0) return receiptPromise;

    let transactionId = await walletContract.transactionCount();

    // pretend the confirmation time has passed
    await walletContract.setConfimationTime(transactionId, 0);

    let tx = await walletContract
      .connect(signatory1)
      .executeTransaction(transactionId);
    return tx.wait();
  }

  // positive tests should look for Execution and OwnerAddition events.
  // negative tests should look for ExecutionFailure event.
  async function doAddOwner(
    walletContract: MultisigWallet,
    newOwner: string
  ): Promise<ContractReceipt> {
    let callData = walletABI.encodeFunctionCall("addOwner(address)", [
      newOwner,
    ]);

    let description = encodeString(`Add Joe`);
    return submitAndConfirm(
      description,
      walletContract.address,
      callData,
      walletContract
    );
  }

  // positive tests should look for Execution and OwnerRemoval events.
  // negative tests should look for ExecutionFailure event.
  async function doRemoveOwner(
    walletContract: MultisigWallet,
    oldOwner: string
  ): Promise<ContractReceipt> {
    let callData = walletABI.encodeFunctionCall("removeOwner(address)", [
      oldOwner,
    ]);

    let description = encodeString(`Remove Mark`);
    return submitAndConfirm(
      description,
      walletContract.address,
      callData,
      walletContract
    );
  }

  // positive tests should look for Execution, OwnerAddition, and OwnerRemoval events.
  // negative tests should look for ExecutionFailure event.
  async function doReplaceOwner(
    walletContract: MultisigWallet,
    oldOwner: string,
    newOwner: string
  ): Promise<ContractReceipt> {
    let callData = walletABI.encodeFunctionCall(
      "replaceOwner(address,address)",
      [oldOwner, newOwner]
    );

    let description = encodeString(`Replace Dave with Sally`);
    return submitAndConfirm(
      description,
      walletContract.address,
      callData,
      walletContract
    );
  }

  // positive tests should look for Execution and RequirementChange events.
  // negative tests should look for ExecutionFailure event.
  async function doChangeRequirement(
    walletContract: MultisigWallet,
    newRequirement: number
  ): Promise<ContractReceipt> {
    let callData = walletABI.encodeFunctionCall("changeRequirement(uint256)", [
      newRequirement.toString(),
    ]);

    let description = encodeString(`Set required ${newRequirement}`);
    return submitAndConfirm(
      description,
      walletContract.address,
      callData,
      walletContract
    );
  }

  // positive tests should look for Execution and TimelockChange events.
  // negative tests should look for ExecutionFailure event.
  async function doChangeLockPeriod(
    walletContract: MultisigWallet,
    newLockPeriod: number
  ): Promise<ContractReceipt> {
    let callData = walletABI.encodeFunctionCall("changeLockPeriod(uint256)", [
      newLockPeriod.toString(),
    ]);

    let description = encodeString(`Lock period ${newLockPeriod}`);
    return submitAndConfirm(
      description,
      walletContract.address,
      callData,
      walletContract
    );
  }

  // positive tests should look for Execution and LiveAccountCheckinChange events.
  // negative tests should look for ExecutionFailure event.
  async function doChangeLiveAccountCheckinPeriod(
    walletContract: MultisigWallet,
    newLiveAccountCheckin: number
  ): Promise<ContractReceipt> {
    let callData = walletABI.encodeFunctionCall(
      "changeLiveAccountCheckinPeriod(uint256)",
      [newLiveAccountCheckin.toString()]
    );

    let description = encodeString(`Checkin Period ${newLiveAccountCheckin}`);
    return submitAndConfirm(
      description,
      walletContract.address,
      callData,
      walletContract
    );
  }

  // positive tests should look for Execution and Withdraw events.
  // negative tests should look for ExecutionFailure event.
  async function doNativeWithdrawal(
    walletContract: MultisigWallet,
    toAddress: string,
    amount: BigNumberish
  ): Promise<ContractReceipt> {
    let callData = walletABI.encodeFunctionCall("withdraw(address,uint256)", [
      toAddress,
      amount.toString(),
    ]);

    let description = encodeString(`withdraw native`);
    return submitAndConfirm(
      description,
      walletContract.address,
      callData,
      walletContract
    );
  }

  // positive tests should look for Execution and WithdrawERC20 events.
  // negative tests should look for ExecutionFailure event.
  async function doERC20Withdrawal(
    walletContract: MultisigWallet,
    toAddress: string,
    amount: BigNumberish,
    tokenContract: string
  ): Promise<ContractReceipt> {
    let callData = walletABI.encodeFunctionCall(
      "withdrawERC20(address,uint256,address)",
      [toAddress, amount.toString(), tokenContract]
    );

    let description = encodeString(`withdraw ERC20`);
    return submitAndConfirm(
      description,
      walletContract.address,
      callData,
      walletContract
    );
  }

  // positive tests should look for Execution and WithdrawERC721 events.
  // negative tests should look for ExecutionFailure event.
  async function doERC721Withdrawal(
    walletContract: MultisigWallet,
    toAddress: string,
    tokenId: BigNumberish,
    tokenContract: string
  ): Promise<ContractReceipt> {
    let callData = walletABI.encodeFunctionCall(
      "withdrawERC721(address,uint256,address)",
      [toAddress, tokenId.toString(), tokenContract]
    );

    let description = encodeString(`withdraw ERC721`);
    return submitAndConfirm(
      description,
      walletContract.address,
      callData,
      walletContract
    );
  }

  // positive tests should look for Execution and WithdrawERC1155 events.
  // negative tests should look for ExecutionFailure event.
  async function doERC1155Withdrawal(
    walletContract: MultisigWallet,
    toAddress: string,
    tokenId: BigNumberish,
    amount: BigNumberish,
    tokenContract: string
  ): Promise<ContractReceipt> {
    let callData = walletABI.encodeFunctionCall(
      "withdrawERC1155(address,uint256,uint256,address)",
      [toAddress, amount.toString(), tokenId.toString(), tokenContract]
    );

    let description = encodeString(`withdraw ERC1155`);
    return submitAndConfirm(
      description,
      walletContract.address,
      callData,
      walletContract
    );
  }

  before(async function () {
    let signers = await ethers.getSigners();
    contractOwner = signers[0];
    signatory1 = signers[1];
    signerMap.set(signatory1.address, signatory1);
    signatory2 = signers[2];
    signerMap.set(signatory2.address, signatory2);
    signatory3 = signers[3];
    signerMap.set(signatory3.address, signatory3);
    signatory4 = signers[4];
    signerMap.set(signatory4.address, signatory4);
    signatory5 = signers[5];
    signerMap.set(signatory5.address, signatory5);
    rando = signers[6];

    defaultSignatories = [
      signatory1.address,
      signatory2.address,
      signatory3.address,
      signatory4.address,
    ];

    accessServer = await MOCK_CONTRACTS.mockAccessServer();

    initMultisig = function ({
      signers = defaultSignatories,
      required = 3,
      lockPeriod = 0,
      liveAcctCheckin = 0,
      mock = false,
    }) {
      let contractName = mock
        ? "MockMultiSigWallet"
        : "MultiSigWalletWithSurvivorship";
      return proxyDeploy(
        contractName,
        signers,
        required,
        lockPeriod,
        liveAcctCheckin
      ) as Promise<MultisigWallet>;
    };

    walletABI = new ContractABI((await initMultisig({})).interface);

    dummyEncodedTransaction = walletABI.encodeFunctionCall(
      "withdraw(address,uint256)",
      [contractOwner.address, ethers.utils.parseEther("1.0").toString()]
    );
  }); // main before()

  if (testFilter.testConstructor) {
    describe("Deploying a MultiSig Contract", function () {
      context("If an owner is repeated", function () {
        it("the error is 'Already owner'", async function () {
          await expect(
            initMultisig({
              signers: [
                signatory1.address,
                signatory2.address,
                signatory1.address,
              ],
            })
          ).to.be.revertedWith(
            `Already owner: ${signatory1.address.toLowerCase()}`
          );
        });
      }); // repeated owner

      context("If an owner is the null address", function () {
        it("the error is 'Null owner address'", async function () {
          await expect(
            initMultisig({
              signers: [
                signatory1.address,
                "0x0000000000000000000000000000000000000000",
                signatory3.address,
              ],
            })
          ).to.be.revertedWith("Null owner address");
        });
      }); // null owner

      context("If the required signatures is 0", function () {
        it("the error is 'Required can't be zero'", async function () {
          await expect(
            initMultisig({
              signers: [
                signatory1.address,
                signatory2.address,
                signatory3.address,
              ],
              required: 0,
            })
          ).to.be.revertedWith("Required can't be zero");
        });
      }); // required == 0

      context(
        "If the required signatures less than the number of owners",
        function () {
          it("the error is 'Not enough owners'", async function () {
            await expect(
              initMultisig({
                signers: [
                  signatory1.address,
                  signatory2.address,
                  signatory3.address,
                ],
                required: 4,
              })
            ).to.be.revertedWith("Not enough owners");
          });
        }
      ); // required > owners

      context("If there are more than 50 owners", function () {
        it("the error is 'Too many owners'", async function () {
          await expect(
            initMultisig({
              signers: FIFTY_ONE_RANDOS,
            })
          ).to.be.revertedWith("Too many owners");
        });
      }); // required > owners
    });
  } // testFilter.testConstructor

  if (testFilter.testSubmit) {
    describe("Submitting Transactions", function () {
      let contractUnderTest: MultisigWallet;
      let tx: ContractTransaction;
      let receipt: ContractReceipt;
      let transactionId: BigNumberish;
      let transaction: MultisigTransaction;
      let signatory: string;
      let signatoryOriginalLastActive: BigNumberish;

      this.beforeAll(async function () {
        contractUnderTest = await initMultisig({});
      });

      function submitWasSuccessful() {
        it("A 'Submission' event is emitted", async function () {
          expectEvent(receipt, "Submission", { transactionId: transactionId });
        });

        it("The transaction was created", async function () {
          expect(transaction).to.be.not.null;
          expect(transaction.destination).to.equal(contractUnderTest.address);
          expect(transaction.value).to.equal(0);
          expect(transaction.data).to.equal(dummyEncodedTransaction);
        });

        it("The transaction is in 'UNCONFIRMED' state", async function () {
          expect(transaction.status).to.equal(TransactionStatus.UNCONFIRMED);
        });

        it("A 'Confirmation' event is emitted", async function () {
          expectEvent(receipt, "Confirmation", {
            sender: signatory,
            transactionId: transactionId,
          });
        });

        it("The submitter is counted as a confirmation", async function () {
          expect(
            (await contractUnderTest.getConfirmationCount(transactionId))[0]
          ).to.equal(1);
          expect(
            await contractUnderTest.confirmations(transactionId, signatory)
          ).to.be.true;
        });

        it("The submitter's last active time is updated", async function () {
          expect(
            await contractUnderTest.lastCheckin(signatory)
          ).to.be.greaterThan(signatoryOriginalLastActive);
        });
      } // submitWasSuccessful

      context("When submitted by an owner", function () {
        this.beforeAll(async function () {
          signatory = signatory1.address;
          signatoryOriginalLastActive = await contractUnderTest.lastCheckin(
            signatory
          );
          tx = await contractUnderTest
            .connect(signatory1)
            .submitTransaction(
              dummyDescription,
              contractUnderTest.address,
              0,
              dummyEncodedTransaction
            );
          receipt = await tx.wait();
          transactionId = await contractUnderTest.transactionCount();
          transaction = await contractUnderTest.transactions(transactionId);
        });

        submitWasSuccessful();
      });

      context("When submitted by non-owner", function () {
        it("The error is 'Not owner'", async function () {
          await expect(
            contractUnderTest
              .connect(rando)
              .submitTransaction(
                dummyDescription,
                contractUnderTest.address,
                0,
                dummyEncodedTransaction
              )
          ).to.be.revertedWith(`Not owner: ${rando.address.toLowerCase()}`);
        });
      });
    });
  } // testFilter.testSumbit

  if (testFilter.testConfirmRevokeVeto) {
    describe("Confirming transactions/Revoking confirmations", function () {
      let contractUnderTest: MultisigWallet;
      let tx: ContractTransaction;
      let receipt: ContractReceipt;
      let transactionId: BigNumberish;
      let signatory: string;
      let signatoryOriginalLastActive: BigNumberish;

      this.beforeAll(async function () {
        contractUnderTest = await initMultisig({});
      });

      async function sumbitTransaction(): Promise<ContractTransaction> {
        return contractUnderTest
          .connect(signatory1)
          .submitTransaction(
            dummyDescription,
            contractUnderTest.address,
            0,
            dummyEncodedTransaction
          );
      }

      context("When confirming a transaction", function () {
        this.beforeAll(async function () {
          await sumbitTransaction();
          transactionId = await contractUnderTest.transactionCount();
        });

        function confirmWasSuccessful() {
          it("A 'Confirmation' event is emitted", async function () {
            expectEvent(receipt, "Confirmation", {
              sender: signatory,
              transactionId: transactionId,
            });
          });

          it("The confirmer is counted as a confirmation", async function () {
            expect(
              (await contractUnderTest.getConfirmationCount(transactionId))[0]
            ).to.equal(2);
            expect(
              await contractUnderTest.confirmations(transactionId, signatory)
            ).to.be.true;
          });

          it("The confirmer's last active time is updated", async function () {
            expect(
              await contractUnderTest.lastCheckin(signatory)
            ).to.be.greaterThan(signatoryOriginalLastActive);
          });
        } // confirmWasSuccessful()

        context("As an owner", function () {
          context("if the transaction id is valid", function () {
            this.beforeAll(async function () {
              signatory = signatory2.address;
              signatoryOriginalLastActive = await contractUnderTest.lastCheckin(
                signatory
              );
              tx = await contractUnderTest
                .connect(signatory2)
                .confirmTransaction(transactionId);
              receipt = await tx.wait();
            });

            confirmWasSuccessful();
          });

          context("who has already confirmed the transaction", function () {
            it("The error is 'TX already confirmed'", async function () {
              await expect(
                contractUnderTest
                  .connect(signatory2)
                  .confirmTransaction(transactionId)
              ).to.be.revertedWith(
                `TX ${transactionId} already confirmed by ${signatory.toLowerCase()}`
              );
            });
          });

          context("if the transaction does not exist", function () {
            it("The error is 'Invalid TX'", async function () {
              await expect(
                contractUnderTest
                  .connect(signatory3)
                  .confirmTransaction(77441122)
              ).to.be.revertedWith("Invalid TX: 77441122");
            });
          });

          context("if the transaction has already been executed", function () {
            let ex_transcationId: BigNumberish;

            this.beforeAll(async function () {
              await doAddOwner(contractUnderTest, FIFTY_ONE_RANDOS[0]);
              ex_transcationId = await contractUnderTest.transactionCount();
            });

            it("The error is 'Already executed TX'", async function () {
              await expect(
                contractUnderTest
                  .connect(signatory4)
                  .confirmTransaction(ex_transcationId)
              ).to.be.revertedWith(`Already executed TX: ${ex_transcationId}`);
            });
          });
        });

        context("As a non-owner", function () {
          it("The error is 'Not owner'", async function () {
            await expect(
              contractUnderTest.connect(rando).confirmTransaction(transactionId)
            ).to.be.revertedWith(`Not owner: ${rando.address.toLowerCase()}`);
          });
        });
      }); // When confirming a confirmation

      context("When revoking a confirmation", function () {
        let expectedConfirmations: number;

        function revokeWasSuccessful() {
          it("A 'Revocation' event is emitted", async function () {
            expectEvent(receipt, "Revocation", {
              sender: signatory,
              transactionId: transactionId,
            });
          });

          it("The revoker is not counted as a confirmation", async function () {
            expect(
              (await contractUnderTest.getConfirmationCount(transactionId))[0]
            ).to.equal(expectedConfirmations);
            expect(
              await contractUnderTest.confirmations(transactionId, signatory)
            ).to.be.false;
          });

          it("The revoker's last active time is updated", async function () {
            expect(
              await contractUnderTest.lastCheckin(signatory)
            ).to.be.greaterThan(signatoryOriginalLastActive);
          });
        } // revokeWasSuccessful

        context("As the transaction submitter", function () {
          this.beforeAll(async function () {
            await sumbitTransaction();
            transactionId = await contractUnderTest.transactionCount();
            signatory = signatory1.address;
            signatoryOriginalLastActive = await contractUnderTest.lastCheckin(
              signatory
            );
            tx = await contractUnderTest
              .connect(signatory1)
              .revokeConfirmation(transactionId);
            receipt = await tx.wait();
            expectedConfirmations = 0;
          });

          revokeWasSuccessful();
        });

        context("As an owner", function () {
          this.beforeAll(async function () {
            await sumbitTransaction();
            transactionId = await contractUnderTest.transactionCount();
            await contractUnderTest
              .connect(signatory2)
              .confirmTransaction(transactionId);
            signatory = signatory2.address;
            signatoryOriginalLastActive = await contractUnderTest.lastCheckin(
              signatory
            );
          });

          context("If the transaction was previously confirmed", function () {
            this.beforeAll(async function () {
              tx = await contractUnderTest
                .connect(signatory2)
                .revokeConfirmation(transactionId);
              receipt = await tx.wait();
              expectedConfirmations = 1;
            });

            revokeWasSuccessful();
          });

          context(
            "If the transaction was not previously confirmed",
            function () {
              it("The error is 'TX not confirmed'", async function () {
                await expect(
                  contractUnderTest
                    .connect(signatory3)
                    .revokeConfirmation(transactionId)
                ).to.be.revertedWith(
                  `TX ${transactionId} not confirmed by ${signatory3.address.toLowerCase()}`
                );
              });
            }
          );

          context("if the transaction has already been executed", function () {
            let ex_transcationId: BigNumberish;

            this.beforeAll(async function () {
              await doAddOwner(contractUnderTest, FIFTY_ONE_RANDOS[1]);
              ex_transcationId = await contractUnderTest.transactionCount();
            });

            it("The error is 'Already executed TX'", async function () {
              await expect(
                contractUnderTest
                  .connect(signatory2)
                  .revokeConfirmation(ex_transcationId)
              ).to.be.revertedWith(`Already executed TX: ${ex_transcationId}`);
            });
          });
        }); // When revoking a confirmation -> As an owner

        context("As a non-owner", function () {
          it("The error is 'Not owner'", async function () {
            await expect(
              contractUnderTest.connect(rando).revokeConfirmation(transactionId)
            ).to.be.revertedWith(`Not owner: ${rando.address.toLowerCase()}`);
          });
        });
      }); // When revoking a confirmation

      context("When vetoing a transaction", async function () {
        this.beforeAll(async function () {
          contractUnderTest = (await initMultisig({
            lockPeriod: 86400,
            required: 1,
            mock: true,
          })) as MockMultiSigWallet;

          await doNativeWithdrawal(
            contractUnderTest,
            rando.address,
            ethers.utils.parseEther("0.1")
          );
          transactionId = await contractUnderTest.transactionCount();
        });

        function vetoWasSuccessful() {
          it("A 'Vetoed' event is emitted", async function () {
            expectEvent(receipt, "Vetoed", {
              sender: signatory,
              transactionId: transactionId,
            });
          });

          it("The vetoers's last active time is updated", async function () {
            expect(
              await contractUnderTest.lastCheckin(signatory)
            ).to.be.greaterThan(signatoryOriginalLastActive);
          });

          it("The transaction is in 'VETOED' state", async function () {
            let transaction = await contractUnderTest.transactions(
              transactionId
            );
            expect(transaction.status).to.equal(TransactionStatus.VETOED);
          });

          it("The `isConfirmed` function returns `false`", async function () {
            expect(
              await contractUnderTest.isConfirmed(transactionId)
            ).to.be.false;
          });

          it("`confirmTransaction` reverts with Vetoed TX", async function () {
            await expect(
              contractUnderTest
                .connect(signatory4)
                .confirmTransaction(transactionId)
            ).to.be.revertedWith(`Vetoed TX: ${transactionId}`);
          });

          it("`executeTransaction` reverts with Vetoed TX", async function () {
            await expect(
              contractUnderTest
                .connect(signatory1)
                .executeTransaction(transactionId)
            ).to.be.revertedWith(`Vetoed TX: ${transactionId}`);
          });
        } // vetoWasSuccessful()

        context("As a non-owner", function () {
          it("The error is 'Not owner'", async function () {
            await expect(
              contractUnderTest.connect(rando).vetoTransaction(transactionId)
            ).to.be.revertedWith(`Not owner: ${rando.address.toLowerCase()}`);
          });
        });

        context("As an owner", function () {
          this.beforeAll(async function () {
            signatory = signatory4.address;
            signatoryOriginalLastActive = await contractUnderTest.lastCheckin(
              signatory
            );
            tx = await contractUnderTest
              .connect(signatory4)
              .vetoTransaction(transactionId);
            receipt = await tx.wait();
            await (contractUnderTest as MockMultiSigWallet).setConfimationTime(
              transactionId,
              1
            );
          });

          vetoWasSuccessful();
        });
      }); // When vetoing a transaction
    });
  } // testFilter.testConfirmRevoke

  if (testFilter.testOwnerMgmt) {
    describe("Managing Owners", function () {
      let contractUnderTest: MultisigWallet;
      let receipt: ContractReceipt;
      let transactionId: BigNumberish;
      let newOwner: string;
      let oldOwner: string;
      let expectedOwnerCount: number;
      let originalLastActiveTime: BigNumberish;
      let originalRequirement: BigNumber;
      let expectedRequirement: BigNumber;

      function newOwnerWasAdded() {
        it("An 'OwnerAddition' event is emitted", async function () {
          expectEvent(receipt, "OwnerAddition", {
            owner: newOwner,
          });
        });

        it("The new owner is added to the end of the list", async function () {
          expect(
            await contractUnderTest.getOwnerAtIndex(expectedOwnerCount - 1)
          ).to.equal(newOwner);
        });

        it("`isOwner` returns `true` for the new owner", async function () {
          expect(await contractUnderTest.isOwner(newOwner)).to.be.true;
        });

        it("The new owner's last active time is set", async function () {
          expect(
            await contractUnderTest.lastCheckin(newOwner)
          ).to.be.greaterThan(originalLastActiveTime);
        });
      }

      function oldOwnerRemoved() {
        it("An 'OwnerRemoval' event is emitted", async function () {
          expectEvent(receipt, "OwnerRemoval", {
            owner: oldOwner,
          });
        });

        it("`isOwner` returns `false` for the old owner", async function () {
          expect(await contractUnderTest.isOwner(oldOwner)).to.be.false;
        });
      }

      function addWasSuccessful() {
        it("An 'Execution' event is emitted", async function () {
          expectEvent(receipt, "Execution", {
            transactionId: transactionId,
          });
        });

        it("The owner count is incremented for the new owner", async function () {
          expect(await contractUnderTest.getOwnerCount()).to.equal(
            expectedOwnerCount
          );
        });

        newOwnerWasAdded();
      }

      function removeWasSuccessful() {
        it("An 'Execution' event is emitted", async function () {
          expectEvent(receipt, "Execution", {
            transactionId: transactionId,
          });
        });

        it("The owner count is decremented for the old owner", async function () {
          expect(await contractUnderTest.getOwnerCount()).to.equal(
            expectedOwnerCount
          );
        });

        oldOwnerRemoved();
      }

      function replaceWasSuccessful() {
        it("An 'Execution' event is emitted", async function () {
          expectEvent(receipt, "Execution", {
            transactionId: transactionId,
          });
        });

        it("The owner count is unchanged", async function () {
          expect(await contractUnderTest.getOwnerCount()).to.equal(
            expectedOwnerCount
          );
        });

        newOwnerWasAdded();
        oldOwnerRemoved();
      }

      function changeRequirementWasSuccessful() {
        it("An 'Execution' event is emitted", async function () {
          expectEvent(receipt, "Execution", {
            transactionId: transactionId,
          });
        });

        it("An 'RequirementChange' event is emitted", async function () {
          expectEvent(receipt, "RequirementChange", {
            previous: originalRequirement,
            required: expectedRequirement,
          });
        });

        it("The new requirement is set", async function () {
          expect(await contractUnderTest.required()).to.equal(
            expectedRequirement
          );
        });
      }

      context("When adding an owner", function () {
        this.beforeAll(async function () {
          contractUnderTest = await initMultisig({});
          let ownerCount = (await contractUnderTest.getOwnerCount()).toNumber();
          expectedOwnerCount = ownerCount + 1;
        });

        context("if `addOwner` is called directly", function () {
          it("the error is 'Must be wallet'", async function () {
            await expect(
              contractUnderTest
                .connect(signatory1)
                .addOwner(FIFTY_ONE_RANDOS[14])
            ).to.be.revertedWith("Must be wallet");
          });
        });

        context("if all prerequisites are met", function () {
          this.beforeAll(async function () {
            newOwner = FIFTY_ONE_RANDOS[3];
            originalLastActiveTime = await contractUnderTest.lastCheckin(
              newOwner
            );
            receipt = await doAddOwner(contractUnderTest, newOwner);
            transactionId = await contractUnderTest.transactionCount();
          });

          addWasSuccessful();
        });

        context("if the new owner is already an owner", function () {
          this.beforeAll(async function () {
            receipt = await doAddOwner(contractUnderTest, signatory1.address);
            transactionId = await contractUnderTest.transactionCount();
          });

          it("An `ExecutionFailure` event is emitted", async function () {
            expectEvent(receipt, "ExecutionFailure", {
              transactionId: transactionId,
            });
          });
        });

        context("if the new owner is the null address", function () {
          this.beforeAll(async function () {
            receipt = await doAddOwner(
              contractUnderTest,
              "0x0000000000000000000000000000000000000000"
            );
            transactionId = await contractUnderTest.transactionCount();
          });

          it("An `ExecutionFailure` event is emitted", async function () {
            expectEvent(receipt, "ExecutionFailure", {
              transactionId: transactionId,
            });
          });
        });

        context("if there are already 50 owners", function () {
          let fullContract: MultisigWallet;

          this.beforeAll(async function () {
            let fiftyOwners = defaultSignatories.concat(
              FIFTY_ONE_RANDOS.slice(0, 46)
            );
            fullContract = await initMultisig({ signers: fiftyOwners });
            receipt = await doAddOwner(fullContract, FIFTY_ONE_RANDOS[47]);
            transactionId = await fullContract.transactionCount();
          });

          it("An `ExecutionFailure` event is emitted", async function () {
            expectEvent(receipt, "ExecutionFailure", {
              transactionId: transactionId,
            });
          });
        });
      }); // When adding an owner

      context("When removing an owner", function () {
        this.beforeAll(async function () {
          contractUnderTest = await initMultisig({});
          let ownerCount = (await contractUnderTest.getOwnerCount()).toNumber();
          expectedOwnerCount = ownerCount + 1;
        });

        context("if `removeOwner` is called directly", function () {
          it("the error is 'Must be wallet'", async function () {
            await expect(
              contractUnderTest
                .connect(signatory1)
                .removeOwner(signatory2.address)
            ).to.be.revertedWith("Must be wallet");
          });
        });

        context("when all prerequisites are met", function () {
          context("if there are more owners than required", function () {
            this.beforeAll(async function () {
              oldOwner = signatory4.address;

              let ownerCount = (
                await contractUnderTest.getOwnerCount()
              ).toNumber();
              expectedOwnerCount = ownerCount - 1;

              expectedRequirement = await contractUnderTest.required();

              receipt = await doRemoveOwner(contractUnderTest, oldOwner);
              transactionId = await contractUnderTest.transactionCount();
            });

            it("The required number is unchanged", async function () {
              expect(await contractUnderTest.required()).to.equal(
                expectedRequirement
              );
            });

            removeWasSuccessful();
          });

          context(
            "if there are exactly as many owners as required",
            function () {
              this.beforeAll(async function () {
                oldOwner = signatory3.address;

                originalRequirement = await contractUnderTest.required();

                let currentOwnerCount = await contractUnderTest.getOwnerCount();

                if (originalRequirement.lt(currentOwnerCount)) {
                  await doChangeRequirement(
                    contractUnderTest,
                    currentOwnerCount.toNumber()
                  );
                }

                expectedOwnerCount = currentOwnerCount.sub(1).toNumber();
                expectedRequirement = originalRequirement.sub(1);
                receipt = await doRemoveOwner(contractUnderTest, oldOwner);
                transactionId = await contractUnderTest.transactionCount();
              });

              it("The required number is reduced to the new owner count", async function () {
                expect(await contractUnderTest.required()).to.equal(
                  expectedRequirement
                );
              });

              removeWasSuccessful();
            }
          );

          context("if the address is not an owner", function () {
            this.beforeAll(async function () {
              receipt = await doRemoveOwner(
                contractUnderTest,
                FIFTY_ONE_RANDOS[32]
              );
              transactionId = await contractUnderTest.transactionCount();
            });

            it("An `ExecutionFailure` event is emitted", async function () {
              expectEvent(receipt, "ExecutionFailure", {
                transactionId: transactionId,
              });
            });
          });

          context("if there is only one owner", function () {
            let singleOwnerWallet: MultisigWallet;

            this.beforeAll(async function () {
              oldOwner = signatory1.address;
              singleOwnerWallet = await initMultisig({
                signers: [oldOwner],
                required: 1,
              });
              receipt = await doRemoveOwner(singleOwnerWallet, oldOwner);
              transactionId = await singleOwnerWallet.transactionCount();
            });

            it("An `ExecutionFailure` event is emitted", async function () {
              expectEvent(receipt, "ExecutionFailure", {
                transactionId: transactionId,
              });
            });
          });
        });
      }); // When removing an owner

      context("When replacing an owner", function () {
        this.beforeAll(async function () {
          contractUnderTest = await initMultisig({});
          expectedOwnerCount = (
            await contractUnderTest.getOwnerCount()
          ).toNumber();
        });

        context("if `replaceOwner` is called directly", function () {
          it("the error is 'Must be wallet'", async function () {
            await expect(
              contractUnderTest
                .connect(signatory1)
                .replaceOwner(signatory2.address, FIFTY_ONE_RANDOS[9])
            ).to.be.revertedWith("Must be wallet");
          });
        });

        context("if everything is copacetic", function () {
          this.beforeAll(async function () {
            oldOwner = signatory4.address;
            newOwner = signatory5.address;
            originalLastActiveTime = await contractUnderTest.lastCheckin(
              newOwner
            );
            receipt = await doReplaceOwner(
              contractUnderTest,
              oldOwner,
              newOwner
            );
            transactionId = await contractUnderTest.transactionCount();
          });

          replaceWasSuccessful();
        });

        context("if the new owner is already an owner", function () {
          this.beforeAll(async function () {
            receipt = await doReplaceOwner(
              contractUnderTest,
              signatory1.address,
              signatory2.address
            );
            transactionId = await contractUnderTest.transactionCount();
          });

          it("An `ExecutionFailure` event is emitted", async function () {
            expectEvent(receipt, "ExecutionFailure", {
              transactionId: transactionId,
            });
          });
        });

        context("if the new owner is the null address", function () {
          this.beforeAll(async function () {
            receipt = await doReplaceOwner(
              contractUnderTest,
              signatory1.address,
              "0x0000000000000000000000000000000000000000"
            );
            transactionId = await contractUnderTest.transactionCount();
          });

          it("An `ExecutionFailure` event is emitted", async function () {
            expectEvent(receipt, "ExecutionFailure", {
              transactionId: transactionId,
            });
          });
        });

        context("if the old owner is not an owner", function () {
          this.beforeAll(async function () {
            receipt = await doReplaceOwner(
              contractUnderTest,
              FIFTY_ONE_RANDOS[32],
              FIFTY_ONE_RANDOS[34]
            );
            transactionId = await contractUnderTest.transactionCount();
          });

          it("An `ExecutionFailure` event is emitted", async function () {
            expectEvent(receipt, "ExecutionFailure", {
              transactionId: transactionId,
            });
          });
        });
      }); // When replacing an owner

      context("When changing the number of required signatures", function () {
        this.beforeAll(async function () {
          contractUnderTest = await initMultisig({});
        });

        context("if `changeRequirement` is called directly", function () {
          it("the error is 'Must be wallet'", async function () {
            await expect(
              contractUnderTest.connect(signatory1).changeRequirement(2)
            ).to.be.revertedWith("Must be wallet");
          });
        });

        context(
          "if the new requirement is less than the owner count",
          function () {
            this.beforeAll(async function () {
              originalRequirement = await contractUnderTest.required();
              expectedRequirement = BigNumber.from(2);
              receipt = await doChangeRequirement(
                contractUnderTest,
                expectedRequirement.toNumber()
              );
              transactionId = await contractUnderTest.transactionCount();
            });

            changeRequirementWasSuccessful();
          }
        );

        context(
          "if the new requirement is equal to the owner count",
          function () {
            this.beforeAll(async function () {
              originalRequirement = await contractUnderTest.required();
              expectedRequirement = await contractUnderTest.getOwnerCount();
              receipt = await doChangeRequirement(
                contractUnderTest,
                expectedRequirement.toNumber()
              );
              transactionId = await contractUnderTest.transactionCount();
            });

            changeRequirementWasSuccessful();
          }
        );

        context(
          "if the new requirement is greater than the owner count",
          function () {
            this.beforeAll(async function () {
              originalRequirement = await contractUnderTest.required();
              expectedRequirement = await contractUnderTest.getOwnerCount();
              receipt = await doChangeRequirement(
                contractUnderTest,
                expectedRequirement.toNumber() + 1
              );
              transactionId = await contractUnderTest.transactionCount();
            });

            it("An `ExecutionFailure` event is emitted", async function () {
              expectEvent(receipt, "ExecutionFailure", {
                transactionId: transactionId,
              });
            });
          }
        );

        context(
          "if the new requirement is equal to the current requirement",
          function () {
            this.beforeAll(async function () {
              originalRequirement = await contractUnderTest.required();
              receipt = await doChangeRequirement(
                contractUnderTest,
                originalRequirement.toNumber()
              );
              transactionId = await contractUnderTest.transactionCount();
            });

            it("An `ExecutionFailure` event is emitted", async function () {
              expectEvent(receipt, "ExecutionFailure", {
                transactionId: transactionId,
              });
            });
          }
        );

        context("if the new requirement is zero", function () {
          this.beforeAll(async function () {
            originalRequirement = await contractUnderTest.required();
            receipt = await doChangeRequirement(contractUnderTest, 0);
            transactionId = await contractUnderTest.transactionCount();
          });

          it("An `ExecutionFailure` event is emitted", async function () {
            expectEvent(receipt, "ExecutionFailure", {
              transactionId: transactionId,
            });
          });
        });
      }); // When changing the number of required signatures
    });
  } // testFilter.testOwnerMgmt

  if (testFilter.testWalletFeatures) {
    describe("Withdrawing from the wallet", function () {
      let coinContract: MockERC20;
      let nftContract: MockERC721;
      let sftContract: MockERC1155;
      let contractUnderTest: MultisigWallet;
      let receipt: ContractReceipt;
      let transactionId: BigNumberish;
      let expectedRecipient: string;
      let expectedWithdrawnAmount: BigNumberish;
      let expectedRemainingAmount: BigNumberish;

      const CURRENCY_AMOUNT = ethers.utils.parseEther("1.0");
      const NFT_TOKEN = BigNumber.from("12345");
      const SFT_TOKEN = BigNumber.from("3");
      const SFT_AMOUNT = BigNumber.from(10);

      this.beforeAll(async function () {
        contractUnderTest = await initMultisig({});
        await contractOwner.sendTransaction({
          to: contractUnderTest.address,
          value: CURRENCY_AMOUNT,
        });

        let erc20Factory = (await ethers.getContractFactory(
          "MockERC20"
        )) as MockERC20__factory;
        coinContract = await erc20Factory.deploy("Space Bucks", "SBx", 18);

        await coinContract.mint(contractUnderTest.address, CURRENCY_AMOUNT);

        let erc721Factory = (await ethers.getContractFactory(
          "MockERC721"
        )) as MockERC721__factory;
        nftContract = await erc721Factory.deploy("Junko Pops", "JPS");
        await nftContract.mint(contractUnderTest.address, NFT_TOKEN);

        let erc1155Factory = (await ethers.getContractFactory(
          "MockERC1155"
        )) as MockERC1155__factory;
        sftContract = await erc1155Factory.deploy("https://example.com/foo");
        await sftContract.mint(
          contractUnderTest.address,
          SFT_TOKEN,
          SFT_AMOUNT
        );
      }); // beforeAll

      context("When withdrawing native currency", async function () {
        function withdrawWasSuccessful() {
          it("An 'Execution' event is emitted", async function () {
            expectEvent(receipt, "Execution", {
              transactionId: transactionId,
            });
          });

          it("A 'Withdraw' event is emitted", async function () {
            expectEvent(receipt, "Withdraw", {
              recipient: expectedRecipient,
              value: expectedWithdrawnAmount,
            });
          });

          it("The expected amount remains in the wallet", async function () {
            expect(
              await contractUnderTest.provider.getBalance(
                contractUnderTest.address
              )
            ).to.equal(expectedRemainingAmount);
          });

          it("The expected amount is transferred to the recipient", async function () {
            expect(
              await contractUnderTest.provider.getBalance(expectedRecipient)
            ).to.equal(expectedWithdrawnAmount);
          });
        } // withdrawWasSuccessful

        context("if `withdraw` is called directly", function () {
          it("the error is 'Must be wallet'", async function () {
            await expect(
              contractUnderTest
                .connect(signatory1)
                .withdraw(signatory1.address, ethers.utils.parseEther("1.0"))
            ).to.be.revertedWith("Must be wallet");
          });
        });

        context("after all the approvals are in", function () {
          this.beforeAll(async function () {
            expectedRecipient = FIFTY_ONE_RANDOS[19];
            expectedWithdrawnAmount = ethers.utils.parseEther("0.3");
            expectedRemainingAmount = ethers.utils.parseEther("0.7");
            receipt = await doNativeWithdrawal(
              contractUnderTest,
              expectedRecipient,
              expectedWithdrawnAmount
            );
            transactionId = await contractUnderTest.transactionCount();
          });

          withdrawWasSuccessful();
        });
      }); // When withdrawing native currency

      context("When withdrawing ERC20 tokens", async function () {
        function withdrawWasSuccessful() {
          it("An 'Execution' event is emitted", async function () {
            expectEvent(receipt, "Execution", {
              transactionId: transactionId,
            });
          });

          it("A 'WithdrawERC20' event is emitted", async function () {
            expectEvent(receipt, "WithdrawERC20", {
              recipient: expectedRecipient,
              tokenContract: coinContract.address,
              amount: expectedWithdrawnAmount,
            });
          });

          it("The expected amount remains in the wallet", async function () {
            expect(
              await coinContract.balanceOf(contractUnderTest.address)
            ).to.equal(expectedRemainingAmount);
          });

          it("The expected amount is transferred to the recipient", async function () {
            expect(await coinContract.balanceOf(expectedRecipient)).to.equal(
              expectedWithdrawnAmount
            );
          });
        } // withdrawWasSuccessful

        context("if `withdrawERC20` is called directly", function () {
          it("the error is 'Must be wallet'", async function () {
            await expect(
              contractUnderTest
                .connect(signatory1)
                .withdrawERC20(
                  signatory1.address,
                  ethers.utils.parseEther("1.0"),
                  coinContract.address
                )
            ).to.be.revertedWith("Must be wallet");
          });
        });

        context("after all the approvals are in", function () {
          this.beforeAll(async function () {
            expectedRecipient = FIFTY_ONE_RANDOS[8];
            expectedWithdrawnAmount = ethers.utils.parseEther("0.3");
            expectedRemainingAmount = ethers.utils.parseEther("0.7");
            receipt = await doERC20Withdrawal(
              contractUnderTest,
              expectedRecipient,
              expectedWithdrawnAmount,
              coinContract.address
            );
            transactionId = await contractUnderTest.transactionCount();
          });

          withdrawWasSuccessful();
        });
      }); // When withdrawing ERC20 tokens

      context("When withdrawing an ERC721 token", function () {
        function withdrawWasSuccessful() {
          it("An 'Execution' event is emitted", async function () {
            expectEvent(receipt, "Execution", {
              transactionId: transactionId,
            });
          });

          it("A 'WithdrawERC721' event is emitted", async function () {
            expectEvent(receipt, "WithdrawERC721", {
              recipient: expectedRecipient,
              tokenContract: nftContract.address,
              tokenId: NFT_TOKEN,
            });
          });

          it("The token is transferred to the recipient", async function () {
            expect(await nftContract.ownerOf(NFT_TOKEN)).to.equal(
              expectedRecipient
            );
          });
        } // withdrawWasSuccessful

        context("if `withdrawERC721` is called directly", function () {
          it("the error is 'Must be wallet'", async function () {
            await expect(
              contractUnderTest
                .connect(signatory1)
                .withdrawERC721(
                  signatory1.address,
                  NFT_TOKEN,
                  nftContract.address
                )
            ).to.be.revertedWith("Must be wallet");
          });
        });

        context("after all the approvals are in", function () {
          this.beforeAll(async function () {
            expectedRecipient = FIFTY_ONE_RANDOS[11];
            receipt = await doERC721Withdrawal(
              contractUnderTest,
              expectedRecipient,
              NFT_TOKEN,
              nftContract.address
            );
            transactionId = await contractUnderTest.transactionCount();
          });

          withdrawWasSuccessful();
        });
      }); // When withdrawing an ERC721 token

      context("When withdrawing ERC1155 tokens", function () {
        function withdrawWasSuccessful() {
          it("An 'Execution' event is emitted", async function () {
            expectEvent(receipt, "Execution", {
              transactionId: transactionId,
            });
          });

          it("A 'WithdrawERC1155' event is emitted", async function () {
            expectEvent(receipt, "WithdrawERC1155", {
              recipient: expectedRecipient,
              tokenContract: sftContract.address,
              tokenId: SFT_TOKEN,
              amount: expectedWithdrawnAmount,
            });
          });

          it("The expected amount remains in the wallet", async function () {
            expect(
              await sftContract.balanceOf(contractUnderTest.address, SFT_TOKEN)
            ).to.equal(expectedRemainingAmount);
          });

          it("The expected amount is transferred to the recipient", async function () {
            expect(
              await sftContract.balanceOf(expectedRecipient, SFT_TOKEN)
            ).to.equal(expectedWithdrawnAmount);
          });
        } // withdrawWasSuccessful

        context("if `withdrawERC1155` is called directly", function () {
          it("the error is 'Must be wallet'", async function () {
            await expect(
              contractUnderTest
                .connect(signatory1)
                .withdrawERC1155(
                  signatory1.address,
                  SFT_TOKEN,
                  10,
                  sftContract.address
                )
            ).to.be.revertedWith("Must be wallet");
          });
        });

        context("after all the approvals are in", function () {
          this.beforeAll(async function () {
            expectedRecipient = FIFTY_ONE_RANDOS[27];
            expectedWithdrawnAmount = BigNumber.from(3);
            expectedRemainingAmount = BigNumber.from(7);
            receipt = await doERC1155Withdrawal(
              contractUnderTest,
              expectedRecipient,
              SFT_TOKEN,
              expectedWithdrawnAmount,
              sftContract.address
            );
            transactionId = await contractUnderTest.transactionCount();
          });

          withdrawWasSuccessful();
        });
      }); // When withdrawing ERC1155 tokens
    }); // Withdrawing from the wallet

    describe("Managing an external contract", function () {
      let proxyAdmin: ProxyAdmin;
      let proxyAdminABI: ContractABI;
      let viciCoin: ViciERC20UtilityToken;
      let viciCoinABI: ContractABI;
      let tokenContract: MockERC721;
      let tokenContractABI: ContractABI;
      let contractUnderTest: MultisigWallet;
      let receipt: ContractReceipt;
      let transactionId: BigNumberish;
      let hardhatProxyAdmin: ProxyAdmin;
      let bannedUser: string;
      const TOKEN_ID = 10101;

      this.beforeAll(async function () {
        hardhatProxyAdmin = await getProxyAdmin();
        bannedUser = FIFTY_ONE_RANDOS[48];

        contractUnderTest = await initMultisig({});
        let proxyAdminFactory = (await ethers.getContractFactory(
          "ProxyAdmin"
        )) as ProxyAdmin__factory;
        proxyAdmin = await proxyAdminFactory.deploy();
        proxyAdmin.transferOwnership(contractUnderTest.address);
        await hardhatProxyAdmin.changeProxyAdmin(
          contractUnderTest.address,
          proxyAdmin.address
        );
        proxyAdminABI = new ContractABI(proxyAdmin.interface);

        viciCoin = await deployERC20(
          accessServer,
          "Foo Dollars",
          "Foo$",
          18,
          BigNumber.from("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF")
        );
        await viciCoin.mint(
          contractUnderTest.address,
          ethers.utils.parseEther("1.0")
        );
        await viciCoin.mint(bannedUser, ethers.utils.parseEther("1.0"));
        await viciCoin.grantRole(MODERATOR, contractUnderTest.address);
        await viciCoin.transferOwnership(contractUnderTest.address);
        await hardhatProxyAdmin.changeProxyAdmin(
          viciCoin.address,
          proxyAdmin.address
        );
        viciCoinABI = new ContractABI(viciCoin.interface);

        let erc721Factory = (await ethers.getContractFactory(
          "MockERC721"
        )) as MockERC721__factory;
        tokenContract = await erc721Factory.deploy("FooNFT", "FNFT");
        await tokenContract.mint(
          contractUnderTest.address,
          TOKEN_ID
        );
        tokenContractABI = new ContractABI(tokenContract.interface);
      }); // beforeAll

      function executionWasSuccessful() {
        it("An 'Execution' event is emitted", async function () {
          expectEvent(receipt, "Execution", {
            transactionId: transactionId,
          });
        });
      }

      context(
        "When calling a function that requires token ownership",
        function () {
          let approvalEventABI: EventABI;

          context(
            "Granting approval for a token owned by the wallet",
            function () {
              this.beforeAll(async function () {
                approvalEventABI = tokenContractABI.eventsBySignature.get(
                  "Approval(address,address,uint256)"
                ) as EventABI;

                let encodedTx = tokenContractABI.encodeFunctionCall(
                  "approve(address,uint256)",
                  [signatory1.address, TOKEN_ID.toString()]
                );

                receipt = await submitAndConfirm(
                  encodeString(`Approve ${TOKEN_ID}`),
                  tokenContract.address,
                  encodedTx,
                  contractUnderTest
                );
                transactionId = await contractUnderTest.transactionCount();
              });

              this.afterAll(async function () {
                receipt = undefined as unknown as ContractReceipt;
                transactionId = undefined as unknown as BigNumberish;
              });

              executionWasSuccessful();

              it("An 'Approval' event is emitted", async function () {
                expectEvent(receipt, approvalEventABI, {
                  owner: contractUnderTest.address,
                  approved: signatory1.address,
                  tokenId: TOKEN_ID.toString(),
                });
              });

              it("the approval was granted", async function () {
                expect(await tokenContract.getApproved(TOKEN_ID)).to.equal(
                  signatory1.address
                );
              });
            }
          );
        }
      );

      context("When calling a function that requires a role", function () {
        let roleGrantedEventABI: EventABI;

        context("Banning a user as moderator", function () {
          this.beforeAll(async function () {
            roleGrantedEventABI = viciCoinABI.eventsBySignature.get(
              "RoleGranted(bytes32,address,address)"
            ) as EventABI;

            let encodedTx = viciCoinABI.encodeFunctionCall(
              "grantRole(bytes32,address)",
              [BANNED, bannedUser]
            );

            receipt = await submitAndConfirm(
              encodeString("Ban some rascal"),
              viciCoin.address,
              encodedTx,
              contractUnderTest
            );
            transactionId = await contractUnderTest.transactionCount();
          });

          this.afterAll(async function () {
            receipt = undefined as unknown as ContractReceipt;
            transactionId = undefined as unknown as BigNumberish;
          });

          executionWasSuccessful();

          it("A 'RoleGranted' event is emitted", async function () {
            expectEvent(receipt, roleGrantedEventABI, {
              role: BANNED,
              account: bannedUser,
              sender: contractUnderTest.address,
            });
          });

          it("the user was banned", async function () {
            // console.log(util.inspect(receipt, { depth: null, colors: true }));
            // console.log(
            //   "banned count: ",
            //   await viciCoin.getRoleMemberCount(BANNED)
            // );
            // console.log("banned user:", bannedUser);
            // console.log("vicicoin addr:", viciCoin.address);
            expect(await viciCoin.hasRole(BANNED, bannedUser)).to.be.true;
          });
        });
      });

      context("When calling an only owner function", function () {
        let recoveredEventABI: EventABI;
        const AMOUNT_RECOVERED = ethers.utils.parseEther("1.0");

        context("Recovering sanctioned assets", function () {
          this.beforeAll(async function () {
            recoveredEventABI = viciCoinABI.eventsBySignature.get(
              "SanctionedAssetsRecovered(address,address,uint256)"
            ) as EventABI;

            let encodedTx = viciCoinABI.encodeFunctionCall(
              "recoverSanctionedAssets(address,address)",
              [bannedUser, signatory3.address]
            );

            receipt = await submitAndConfirm(
              encodeString("recover sanctioned"),
              viciCoin.address,
              encodedTx,
              contractUnderTest
            );
            transactionId = await contractUnderTest.transactionCount();
          });

          this.afterAll(async function () {
            receipt = undefined as unknown as ContractReceipt;
            transactionId = undefined as unknown as BigNumberish;
          });

          executionWasSuccessful();

          it("A 'SanctionedAssetsRecovered' event is emitted", async function () {
            expectEvent(receipt, recoveredEventABI, {
              from: bannedUser,
              to: signatory3.address,
              value: AMOUNT_RECOVERED.toString(),
            });
          });

          it("The amount was removed from the banned user", async function () {
            expect(await viciCoin.balanceOf(bannedUser)).to.equal(0);
          });

          it("The amount was transferred to the recovery address", async function () {
            expect(await viciCoin.balanceOf(signatory3.address)).to.equal(
              AMOUNT_RECOVERED
            );
          });
        });
      });

      context("When upgrading a contract", function () {
        let newImplAddress: string;

        context("upgrading ViciCoin to a new version", function () {
          let upgraded: MockViciERC20;

          this.beforeAll(async function () {
            let newImplFactory = (await ethers.getContractFactory(
              "MockViciERC20"
            )) as MockViciERC20__factory;
            let newImpl = await newImplFactory.deploy();
            newImplAddress = newImpl.address;

            let encodedTx = proxyAdminABI.encodeFunctionCall(
              "upgrade(address,address)",
              [viciCoin.address, newImplAddress]
            );

            receipt = await submitAndConfirm(
              encodeString("Upgrade ViciCoin"),
              proxyAdmin.address,
              encodedTx,
              contractUnderTest
            );
            transactionId = await contractUnderTest.transactionCount();
            upgraded = newImplFactory.attach(viciCoin.address);
          });

          this.afterAll(async function () {
            receipt = undefined as unknown as ContractReceipt;
            transactionId = undefined as unknown as BigNumberish;
            newImplAddress = undefined as unknown as string;
          });

          executionWasSuccessful();

          it("An 'Upgraded' event is emitted", async function () {
            expectEvent(receipt, PROXY_UPGRADE_EVENT, {
              implementation: newImplAddress,
            });
          });

          it("the upgraded contract has the new feature", async function () {
            let amount = ethers.utils.parseEther("1.0");
            await upgraded.connect(rando).freeMint(rando.address, amount);

            expect(await upgraded.balanceOf(rando.address)).to.equal(amount);
          });
        });

        context("When upgrading itself", function () {
          context("upgrading multisig wallet to a new version", function () {
            let upgraded: MockMultiSigWallet;

            this.beforeAll(async function () {
              let newImplFactory = (await ethers.getContractFactory(
                "MockMultiSigWallet"
              )) as MockMultiSigWallet__factory;
              let newImpl = await newImplFactory.deploy();
              newImplAddress = newImpl.address;

              let encodedTx = proxyAdminABI.encodeFunctionCall(
                "upgrade(address,address)",
                [contractUnderTest.address, newImplAddress]
              );

              receipt = await submitAndConfirm(
                encodeString("Upgrade Multisig Wallet"),
                proxyAdmin.address,
                encodedTx,
                contractUnderTest
              );
              upgraded = newImplFactory.attach(contractUnderTest.address);
              transactionId = await upgraded.transactionCount();
            });

            this.afterAll(async function () {
              receipt = undefined as unknown as ContractReceipt;
              transactionId = undefined as unknown as BigNumberish;
            });

            executionWasSuccessful();

            it("An 'Upgraded' event is emitted", async function () {
              expectEvent(receipt, PROXY_UPGRADE_EVENT, {
                implementation: newImplAddress,
              });
            });

            it("the upgraded contract has the new feature", async function () {
              await upgraded
                .connect(rando)
                .setLastCheckinTime(signatory1.address, 0);

              expect(await upgraded.lastCheckin(signatory1.address)).to.equal(
                0
              );
            });
          });
        });
      }); // upgrading
    }); // Managing an external contract
  } // testFilter.testWalletFeatures

  if (testFilter.testEnumerateTx) {
    describe("Enumerating submitted transactions", function () {
      let txCount: BigNumberish;
      let txIdList: Array<BigNumber>;
      let contractUnderTest: MultisigWallet;

      this.beforeAll(async function () {
        contractUnderTest = await initMultisig({});
        await contractOwner.sendTransaction({
          to: contractUnderTest.address,
          value: ethers.utils.parseEther("1.0"),
        });

        // submit two tx's and leave pending
        await contractUnderTest
          .connect(signatory1)
          .submitTransaction(
            dummyDescription,
            contractUnderTest.address,
            0,
            dummyEncodedTransaction
          );
        await contractUnderTest
          .connect(signatory2)
          .submitTransaction(
            dummyDescription,
            contractUnderTest.address,
            0,
            dummyEncodedTransaction
          );

        // submit two tx's that will fail and try to confirm them
        await doAddOwner(
          contractUnderTest,
          "0x0000000000000000000000000000000000000000"
        );
        await doRemoveOwner(
          contractUnderTest,
          "0x0000000000000000000000000000000000000000"
        );

        // submit two tx's that will succeed and confirm them
        await doAddOwner(contractUnderTest, signatory5.address);
        await doNativeWithdrawal(
          contractUnderTest,
          signatory5.address,
          ethers.utils.parseEther("0.5")
        );
      }); // beforeAll

      function checkEnumeratedTransactions(
        expectedTxCount: number,
        txStatus: number
      ) {
        let testName: string;
        switch (txStatus) {
          case TransactionStatus.UNCONFIRMED:
            testName = "unconfirmed";
            break;
          case TransactionStatus.CONFIRMED:
            testName = "confirmed";
            break;
          case TransactionStatus.EXECUTED:
            testName = "executed";
            break;
          case TransactionStatus.VETOED:
            testName = "vetoed";
            break;
          default:
            testName = "all";
        }

        context(`When enumerating ${testName} transactions`, function () {
          this.beforeAll(async function () {
            txCount = await contractUnderTest.getTransactionCount(txStatus);
            txIdList = await contractUnderTest.getTransactionIds(
              0,
              txCount,
              txStatus
            );
          });

          this.afterAll(async function () {
            txIdList = undefined as unknown as Array<BigNumber>;
          });

          it("The transaction count is correct", async function () {
            expect(txCount).to.equal(expectedTxCount);
          });

          it("The returned tx list has the expected length", async function () {
            expect(txIdList.length).to.equal(expectedTxCount);
          });

          if (txStatus != TransactionStatus.EVERY_STATUS) {
            it(`The returned transactions are all in the ${testName} state`, async function () {
              for (let txId of txIdList) {
                let transaction = await contractUnderTest.transactions(txId);
                expect(transaction.status).to.equal(txStatus);
              }
            });
          } else {
            // it("Here are the transactions", async function () {
            //   for (let txId of txIdList) {
            //     let transaction = await contractUnderTest.transactions(txId);
            //     console.log(
            //       util.inspect(transaction, { depth: null, colors: true })
            //     );
            //   }
            // });
          }
        });
      } // checkEnumeratedTransactions

      checkEnumeratedTransactions(6, TransactionStatus.EVERY_STATUS);
      checkEnumeratedTransactions(2, TransactionStatus.UNCONFIRMED);
      checkEnumeratedTransactions(2, TransactionStatus.CONFIRMED);
      checkEnumeratedTransactions(2, TransactionStatus.EXECUTED);
    });
  } // testFilter.testEnumerateTx

  if (testFilter.testTimelock) {
    describe("Timelock feature enabled", function () {
      let contractUnderTest: MockMultiSigWallet;
      let tx: ContractTransaction;
      let receipt: ContractReceipt;
      let transactionId: BigNumberish;
      let signatory: SignerWithAddress;
      let signatoryOriginalLastActive: BigNumberish;
      const CURRENCY_AMOUNT = ethers.utils.parseEther("1.0");

      async function sumbitATransaction(): Promise<ContractReceipt> {
        let callData = walletABI.encodeFunctionCall(
          "withdraw(address,uint256)",
          [rando.address, CURRENCY_AMOUNT.toString()]
        );
        let tx = await contractUnderTest
          .connect(signatory)
          .submitTransaction(
            encodeString("withdraw"),
            contractUnderTest.address,
            0,
            callData
          );
        return tx.wait();
      }

      context("When a transaction is not confirmed", async function () {
        this.beforeAll(async function () {
          contractUnderTest = (await initMultisig({
            lockPeriod: 86400,
            mock: true,
          })) as MockMultiSigWallet;

          signatory = signatory1;
          await sumbitATransaction();
          transactionId = await contractUnderTest.transactionCount();
        });

        it("The confirmation time is zero", async function () {
          expect(
            await contractUnderTest.confirmationTimes(transactionId)
          ).to.equal(0);
        });
      }); // When a transaction is not confirmed

      context("When a transaction becomes confirmed", async function () {
        this.beforeAll(async function () {
          contractUnderTest = (await initMultisig({
            lockPeriod: 86400,
            mock: true,
          })) as MockMultiSigWallet;

          receipt = await doNativeWithdrawal(
            contractUnderTest,
            rando.address,
            ethers.utils.parseEther("0.1")
          );
          transactionId = await contractUnderTest.transactionCount();
        });

        this.afterAll(async function () {
          receipt = undefined as unknown as ContractReceipt;
          transactionId = undefined as unknown as BigNumberish;
        });

        it("The confirmation time is set", async function () {
          expect(
            await contractUnderTest.confirmationTimes(transactionId)
          ).to.be.greaterThan(0);
        });

        it("A 'ConfirmationTimeSet' event is emitted", async function () {
          let confirmEvent = getEventFromReceipt(
            receipt,
            "ConfirmationTimeSet"
          );
          expect(confirmEvent).to.be.not.null;
        });

        it("An 'Execution' event is not emitted", async function () {
          let confirmEvent = getEventFromReceipt(receipt, "Execution");
          expect(confirmEvent).to.be.null;
        });

        it("The transaction is in 'CONFIRMED' state", async function () {
          let transaction = await contractUnderTest.transactions(transactionId);
          expect(transaction.status).to.equal(TransactionStatus.CONFIRMED);
        });

        it("execute() reverts with 'Too Early'", async function () {
          await expect(
            contractUnderTest
              .connect(signatory1)
              .executeTransaction(transactionId)
          ).to.be.revertedWith("Too early");
        });
      }); // When a transaction becomes confirmed

      context("When a confirmed tx becomes unconfirmed", function () {
        this.beforeAll(async function () {
          contractUnderTest = (await initMultisig({
            lockPeriod: 86400,
            mock: true,
          })) as MockMultiSigWallet;

          await doNativeWithdrawal(
            contractUnderTest,
            rando.address,
            ethers.utils.parseEther("0.1")
          );
          transactionId = await contractUnderTest.transactionCount();

          tx = await contractUnderTest
            .connect(signatory1)
            .revokeConfirmation(transactionId);
          receipt = await tx.wait();
        });

        this.afterAll(async function () {
          receipt = undefined as unknown as ContractReceipt;
          transactionId = undefined as unknown as BigNumberish;
        });

        it("The confirmation time is reset", async function () {
          expect(
            await contractUnderTest
              .connect(signatory1)
              .confirmationTimes(transactionId)
          ).to.equal(0);
        });

        it("A 'ConfirmationTimeUnset' event is emitted", async function () {
          expectEvent(receipt, "ConfirmationTimeUnset", {
            transactionId: transactionId,
          });
        });

        it("The transaction is in 'UNCONFIRMED' state", async function () {
          let transaction = await contractUnderTest.transactions(transactionId);
          expect(transaction.status).to.equal(TransactionStatus.UNCONFIRMED);
        });
      }); // When a confirmed tx becomes unconfirmed

      context("When executing a tx after time elapsed", function () {
        this.beforeAll(async function () {
          contractUnderTest = (await initMultisig({
            lockPeriod: 86400,
            mock: true,
          })) as MockMultiSigWallet;

          await contractOwner.sendTransaction({
            to: contractUnderTest.address,
            value: CURRENCY_AMOUNT,
          });

          await doNativeWithdrawal(
            contractUnderTest,
            rando.address,
            ethers.utils.parseEther("0.1")
          );
          transactionId = await contractUnderTest.transactionCount();
          await contractUnderTest.setConfimationTime(transactionId, 1);

          tx = await contractUnderTest
            .connect(signatory1)
            .executeTransaction(transactionId);
          receipt = await tx.wait();
        });

        this.afterAll(async function () {
          receipt = undefined as unknown as ContractReceipt;
          transactionId = undefined as unknown as BigNumberish;
        });

        it("An 'Execution' event is emitted", async function () {
          //   console.log(util.inspect(receipt, { depth: null, colors: true }));
          expectEvent(receipt, "Execution", {
            transactionId: transactionId,
          });
        });

        it("A 'Withdraw' event is emitted", async function () {
          expectEvent(receipt, "Withdraw", {
            recipient: rando.address,
            value: ethers.utils.parseEther("0.1"),
          });
        });

        it("The transaction is in 'EXECUTED' state", async function () {
          let transaction = await contractUnderTest.transactions(transactionId);
          expect(transaction.status).to.equal(TransactionStatus.EXECUTED);
        });
      }); // When executing a confirmed tx after time elapsed
    });
  } // testFilter.testTimelock

  if (testFilter.testSurvivorship) {
    describe("Survivorship feature enabled", function () {
      let contractUnderTest: MockMultiSigWallet;

      this.beforeAll(async function () {
        contractUnderTest = (await initMultisig({
          signers: [signatory1.address, signatory2.address, signatory3.address],
          required: 3,
          liveAcctCheckin: 86400,
          mock: true,
        })) as MockMultiSigWallet;
      });

      context("When there are inactive owners", async function () {
        let receipt: ContractReceipt;
        let transactionId: BigNumberish;

        this.beforeAll(async function () {
          contractUnderTest.setLastCheckinTime(signatory1.address, 1);
          contractUnderTest.setLastCheckinTime(signatory2.address, 1);

          let callData = walletABI.encodeFunctionCall(
            "withdraw(address,uint256)",
            [rando.address, "10000"]
          );
          let tx = await contractUnderTest
            .connect(signatory1)
            .submitTransaction(
              encodeString("withdraw money"),
              contractUnderTest.address,
              0,
              callData
            );
          receipt = await tx.wait();
          transactionId = await contractUnderTest.transactionCount();
        });

        it("transactions may be executed without their sign-off", async function () {
          let confirmEvent = getEventFromReceipt(receipt, "Execution");
          expect(confirmEvent).to.be.null;

          let confirmationCount = await contractUnderTest.getConfirmationCount(
            transactionId
          );
          let required = await contractUnderTest.required();
          expect(confirmationCount[0]).to.be.lessThan(required);
        });
      });

      context("When calling `ping()`", async function () {
        context("as an owner", function () {
          this.beforeAll(async function () {
            contractUnderTest.setLastCheckinTime(signatory1.address, 100);
            contractUnderTest.connect(signatory1).ping();
          });

          it("the caller's time is reset", async function () {
            expect(
              await contractUnderTest.lastCheckin(signatory1.address)
            ).to.be.greaterThan(100);
          });
        });

        context("as a non-owner", function () {
          it("The error is 'Not owner'", async function () {
            await expect(
              contractUnderTest.connect(rando).ping()
            ).to.be.revertedWith(`Not owner: ${rando.address.toLowerCase()}`);
          });
        });
      });

      context("When calling `pingFor()`", async function () {
        context("as an owner for an owner", function () {
          this.beforeAll(async function () {
            contractUnderTest.setLastCheckinTime(signatory1.address, 100);
            contractUnderTest.setLastCheckinTime(signatory2.address, 100);
            contractUnderTest.connect(signatory1).pingFor(signatory2.address);
          });

          it("the caller's time is reset", async function () {
            expect(
              await contractUnderTest.lastCheckin(signatory1.address)
            ).to.be.greaterThan(100);
          });
        });

        context("as an owner for a non-owner", function () {
          it("The error is 'Not owner'", async function () {
            await expect(
              contractUnderTest.connect(signatory1).pingFor(rando.address)
            ).to.be.revertedWith(`Not owner: ${rando.address.toLowerCase()}`);
          });
        });

        context("as a non-owner", function () {
          it("The error is 'Not owner'", async function () {
            await expect(
              contractUnderTest.connect(rando).pingFor(signatory2.address)
            ).to.be.revertedWith(`Not owner: ${rando.address.toLowerCase()}`);
          });
        });
      });
    });
  } // testFilter.testSurvivorship
}); // Multisig Wallet
