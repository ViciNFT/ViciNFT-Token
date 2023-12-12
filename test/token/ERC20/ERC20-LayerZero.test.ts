import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  BigNumber,
  BigNumberish,
  ContractReceipt,
  ContractTransaction,
  ethers,
} from "ethers";
import Web3 from "web3";
import { expect } from "chai";
import hardhat from "hardhat";
import {
  MOCK_CONTRACTS,
  proxyDeploy,
  proxyDeployWithInitSignature,
  proxyUpgradeWithInitSignature,
} from "../../test-utils/CommonContracts";
import {
  AccessServer,
  ERC20UtilityOperations,
  ERC20UtilityOperations_v01,
  LZEndpointMock,
  LzBridgeableTokenTunnel,
  ViciERC20MintableUtilityToken,
  ViciERC20UtilityToken,
  ViciERC20v01,
} from "../../../typechain-types";
import { SendParamsStruct } from "../../../typechain-types/contracts/bridging/layerzero/LzBridgeableTokenTunnel";
import {
  ContractABI,
  EventABI,
  expectEvent,
  getEventFromReceipt,
} from "../../helper";
import { BridgeArgsStruct } from "../../../typechain-types/contracts/bridging/IBridgeable";
import util from "util";
import { BytesLike, Result, keccak256 } from "ethers/lib/utils";
import {
  CrossChainPayload,
  LAYER_ZERO_FACTORY,
  LayerZeroEcosystem,
  LayerZeroService,
  TransactionProof,
} from "../../layerzero/lz_fixtures";

const w3 = new Web3();

const LAYERZERO_ADMIN_ROLE =
  "0x85c4600424d81fbff075e32085ae37829c97adaa85deea5fc84092ce10227b52";
const BRIDGE_CONTRACT_ROLE =
  "0x3fd4a614bd02c8fb908a3b3a05852476cf4c63cfc1b7280860fd956aa0982f9f";
const BANNED =
  "0x62616e6e65640000000000000000000000000000000000000000000000000000";

const name = "Vici ERC20 Token";
const lzChainIdMain = 1;
const lzChainIdChild1 = 101;
const lzChainIdChild2 = 102;
const lzChainIdUntrusted = 666;
const normalChainIdMain = 1;
const normalChainIdChild1 = 10001;
const normalChainIdChild2 = 10002;
const normalChainIdUntrusted = 10666;
const normalChainToLzChain = {
  [normalChainIdMain.toString()]: lzChainIdMain,
  [normalChainIdChild1.toString()]: lzChainIdChild1,
  [normalChainIdChild2.toString()]: lzChainIdChild2,
  [normalChainIdUntrusted.toString()]: lzChainIdUntrusted,
};
const symbol = "VICI";
const decimals = 18;
const max_supply = hardhat.ethers.utils.parseUnits("10000000", 18);
const AIRDROP_THRESHOLD = hardhat.ethers.utils.parseUnits("1000", 18);
const holderStartAmount = hardhat.ethers.utils.parseUnits("100000", 18);

let Transfer: EventABI;
let SentToBridge: EventABI;
let ReceivedFromBridge: EventABI;

let SendToChain: EventABI;
let ReceiveFromChain: EventABI;
let MessageFailed: EventABI;
let RetryMessageSuccess: EventABI;

let PayloadStored: EventABI;
let PayloadCleared: EventABI;
let UaForceResumeReceive: EventABI;

function getLzChainId(normalChainId: number): number {
  let lzChainId = normalChainToLzChain[normalChainId.toString()] as number;
  expect(lzChainId).is.not.undefined;
  expect(lzChainId).is.not.null;
  expect(lzChainId).is.finite;
  expect(lzChainId).greaterThan(0);
  return lzChainId;
}

let lzEcoSystem: LayerZeroEcosystem;
let tokens: Map<number, ViciERC20UtilityToken> = new Map();
let tunnels: Map<number, LzBridgeableTokenTunnel> = new Map();

function getLzService(lzChainId: number): LayerZeroService {
  let lzService = lzEcoSystem.getService(lzChainId) as LayerZeroService;
  expect(!!lzService).to.be.true;
  return lzService;
}

function getEndpoint(lzChainId: number): LZEndpointMock {
  return getLzService(lzChainId).endpoint;
}

function getToken(lzChainId: number): ViciERC20UtilityToken {
  let token = tokens.get(lzChainId) as ViciERC20UtilityToken;
  expect(token).is.not.null;
  expect(token).is.not.undefined;
  return token;
}

function getTunnel(lzChainId: number): LzBridgeableTokenTunnel {
  let tunnel = tunnels.get(lzChainId) as LzBridgeableTokenTunnel;
  expect(tunnel).is.not.null;
  expect(tunnel).is.not.undefined;
  return tunnel;
}

function buildPath(you: string, me: string): string {
  return hardhat.ethers.utils.solidityPack(["address", "address"], [you, me]);
}

function encodeRevertReason(reason: string | null): string | null {
  if (reason) {
    return (
      "0x08c379a0" +
      w3.eth.abi.encodeParameters(["bytes"], [Buffer.from(reason)]).substring(2)
    );
  }

  return null;
}

interface TestState {
  vaultAmount: BigNumber;
  srcCirculatingSupply: BigNumber;
  dstCirculatingSupply: BigNumber;
  senderBalance: BigNumber;
  receiverBalance: BigNumber;
  outboundNonce: BigNumber;
  inboundNonce: BigNumber;
}

interface TestCaseConstructorArgs {
  fromAddress: string;
  toAddress?: string;
  srcChainId: number;
  dstChainId: number;
  sendAmount?: BigNumber;
  adapterParams?: string;
}

interface ExtraPayloadArgs {
  srcToken?: ViciERC20UtilityToken;
  dstToken?: ViciERC20UtilityToken;
  srcTunnel?: LzBridgeableTokenTunnel;
  dstTunnel?: LzBridgeableTokenTunnel;
}

class LayerZeroTestCase {
  public fromAddress: string;
  public toAddress: string;
  public srcChainId: number;
  public dstChainId: number;
  public sendAmount: BigNumber;
  public adapterParams: string;
  public debug: boolean = false;

  private _srcPath?: string;
  private _dstPath?: string;
  private _srcToken?: ViciERC20UtilityToken;
  private _dstToken?: ViciERC20UtilityToken;
  private _srcTunnel?: LzBridgeableTokenTunnel;
  private _dstTunnel?: LzBridgeableTokenTunnel;
  private _originalState?: TestState;
  private _expectedState?: TestState;
  private _actualState?: TestState;
  private _expectedCrossChainPayload?: CrossChainPayload;
  private _expectedTransactionProof?: TransactionProof;
  private _receipt?: ContractReceipt;
  private _payload?: string;

  public static async sendToChildChain(
    args: TestCaseConstructorArgs,
    operator: SignerWithAddress
  ) {
    await new LayerZeroTestCase(args).sendCrossChain(operator);
  }

  public static createPayload(
    args: TestCaseConstructorArgs,
    operator: SignerWithAddress,
    extraArgs?: ExtraPayloadArgs
  ): string {
    let tc = new LayerZeroTestCase(args);
    if (extraArgs) {
      if (extraArgs.srcToken) tc.srcToken = extraArgs.srcToken;
      if (extraArgs.dstToken) tc.dstToken = extraArgs.dstToken;
      if (extraArgs.srcTunnel) tc.srcTunnel = extraArgs.srcTunnel;
      if (extraArgs.dstTunnel) tc.dstTunnel = extraArgs.dstTunnel;
    }
    return tc.getPayload(operator);
  }

  public constructor({
    fromAddress,
    toAddress,
    srcChainId,
    dstChainId,
    sendAmount,
    adapterParams,
  }: TestCaseConstructorArgs) {
    this.fromAddress = fromAddress;
    this.toAddress = toAddress ?? fromAddress;
    this.srcChainId = srcChainId;
    this.dstChainId = dstChainId;
    this.sendAmount = sendAmount ?? hardhat.ethers.utils.parseUnits("100", 18);
    this.adapterParams = adapterParams ?? "0x";
  }

  public reinit({
    fromAddress,
    toAddress,
    srcChainId,
    dstChainId,
    sendAmount,
    adapterParams,
  }: TestCaseConstructorArgs) {
    this.fromAddress = fromAddress;
    this.toAddress = toAddress ?? fromAddress;
    this.srcChainId = srcChainId;
    this.dstChainId = dstChainId;
    this.sendAmount = sendAmount ?? hardhat.ethers.utils.parseUnits("100", 18);
    this.adapterParams = adapterParams ?? "0x";
  }

  public reset() {
    this.reinit({
      fromAddress: hardhat.ethers.constants.AddressZero,
      srcChainId: 0,
      dstChainId: 0,
    });
    this._srcPath = undefined;
    this._dstPath = undefined;
    this._srcToken = undefined;
    this._dstToken = undefined;
    this._srcTunnel = undefined;
    this._dstTunnel = undefined;
    this._originalState = undefined;
    this._expectedState = undefined;
    this._actualState = undefined;
    this._receipt = undefined;
  }

  public async resetState(): Promise<TestState> {
    this._originalState = undefined;
    this._expectedState = undefined;
    this._actualState = undefined;
    this._receipt = undefined;
    return this.originalState;
  }

  public async reloadActualState(): Promise<TestState> {
    this._actualState = await this.buildTestState();
    return this._actualState;
  }

  public get srcToken(): ViciERC20UtilityToken {
    return (
      this._srcToken ??
      (this._srcToken = getToken(getLzChainId(this.srcChainId)))
    );
  }

  public set srcToken(token: ViciERC20UtilityToken) {
    this._srcToken = token;
  }

  public get dstToken(): ViciERC20UtilityToken {
    return (
      this._dstToken ??
      (this._dstToken = getToken(getLzChainId(this.dstChainId)))
    );
  }

  public set dstToken(token: ViciERC20UtilityToken) {
    this._dstToken = token;
  }

  public get srcTunnel(): LzBridgeableTokenTunnel {
    return (
      this._srcTunnel ??
      (this._srcTunnel = getTunnel(getLzChainId(this.srcChainId)))
    );
  }

  public set srcTunnel(tunnel: LzBridgeableTokenTunnel) {
    this._srcTunnel = tunnel;
  }

  public get dstTunnel(): LzBridgeableTokenTunnel {
    return (
      this._dstTunnel ??
      (this._dstTunnel = getTunnel(getLzChainId(this.dstChainId)))
    );
  }

  public set dstTunnel(tunnel: LzBridgeableTokenTunnel) {
    this._dstTunnel = tunnel;
  }

  public async buildTestState(): Promise<TestState> {
    let mainToken = getToken(lzChainIdMain);
    let srcLzChainId = getLzChainId(this.srcChainId);
    let dstLzChainId = getLzChainId(this.dstChainId);

    return {
      vaultAmount: await mainToken.balanceOf(await mainToken.vault()),
      srcCirculatingSupply: await this.srcToken.circulatingSupply(),
      dstCirculatingSupply: await this.dstToken.circulatingSupply(),
      senderBalance: await this.srcToken.balanceOf(this.fromAddress),
      receiverBalance: await this.dstToken.balanceOf(this.toAddress),
      outboundNonce: await getEndpoint(srcLzChainId).getOutboundNonce(
        dstLzChainId,
        getTunnel(srcLzChainId).address
      ),
      inboundNonce: await getEndpoint(dstLzChainId).getInboundNonce(
        srcLzChainId,
        this.dstPath
      ),
    };
  }

  public get originalState(): Promise<TestState> {
    return (async () => {
      if (!this._originalState) {
        this._originalState = await this.buildTestState();
      }
      return this._originalState;
    })();
  }

  public get expectedState(): Promise<TestState> {
    return (async () => {
      if (!this._expectedState) {
        let originalState = await this.originalState;
        let sendAmount = this.sendAmount;
        let vaultAmount = originalState.vaultAmount;
        if (this.srcChainId == normalChainIdMain) {
          vaultAmount = vaultAmount.add(sendAmount);
        }
        if (this.dstChainId == normalChainIdMain) {
          vaultAmount = vaultAmount.sub(sendAmount);
        }

        this._expectedState = {
          vaultAmount: vaultAmount,
          srcCirculatingSupply:
            originalState.srcCirculatingSupply.sub(sendAmount),
          dstCirculatingSupply:
            originalState.dstCirculatingSupply.add(sendAmount),
          senderBalance: originalState.senderBalance.sub(sendAmount),
          receiverBalance: originalState.receiverBalance.add(sendAmount),
          outboundNonce: originalState.outboundNonce.add(1),
          inboundNonce: originalState.inboundNonce.add(1),
        };
      }

      return this._expectedState;
    })();
  }

  public get actualState(): TestState {
    expect(this._actualState).is.not.undefined;
    return this._actualState as TestState;
  }

  public get expectedCrossChainPayload(): CrossChainPayload {
    expect(this._expectedCrossChainPayload).is.not.undefined;
    return this._expectedCrossChainPayload as CrossChainPayload;
  }

  public get expectedTransactionProof(): TransactionProof {
    expect(this._expectedTransactionProof).is.not.undefined;
    return this._expectedTransactionProof as TransactionProof;
  }

  public get srcPath(): string {
    if (!this._srcPath) {
      this._srcPath = buildPath(this.dstTunnel.address, this.srcTunnel.address);
    }

    return this._srcPath;
  }

  public get dstPath(): string {
    if (!this._dstPath) {
      this._dstPath = buildPath(this.srcTunnel.address, this.dstTunnel.address);
    }

    return this._dstPath;
  }

  public get receipt(): ContractReceipt {
    expect(this._receipt).is.not.undefined;
    return this._receipt as ContractReceipt;
  }

  public get payload(): string {
    expect(this._payload).is.not.undefined;
    return this._payload as string;
  }

  public get sendParams(): SendParamsStruct {
    return {
      fromAddress: this.fromAddress,
      dstChainId: this.dstChainId,
      toAddress: this.toAddress,
      itemId: 1,
      amount: this.sendAmount,
    };
  }

  public getBridgeArgs(
    operator: SignerWithAddress,
    remoteChainId: number
  ): BridgeArgsStruct {
    return {
      caller: operator.address,
      fromAddress: this.fromAddress,
      toAddress: this.toAddress,
      remoteChainId: remoteChainId,
      itemId: 1,
      amount: this.sendAmount,
    };
  }

  public getPayload(operator: SignerWithAddress): string {
    let selector = w3.eth.abi.encodeFunctionSignature(
      "receivedFromBridge((address,address,address,uint256,uint256,uint256))"
    );

    let parameters = w3.eth.abi.encodeParameters(
      [
        {
          BridgeArgs: {
            caller: "address",
            fromAddress: "address",
            toAddress: "address",
            remoteChainId: "uint256",
            itemId: "uint256",
            amount: "uint256",
          },
        },
      ],
      [this.getBridgeArgs(operator, this.srcChainId)]
    );

    return selector + parameters.substring(2);
  }

  public async getExpectedCrossChainPayload(
    payload?: string
  ): Promise<CrossChainPayload> {
    payload = payload ?? this.payload;

    return new CrossChainPayload(
      (await this.expectedState).outboundNonce.toNumber(),
      getLzChainId(this.srcChainId),
      this.srcTunnel.address,
      getLzChainId(this.dstChainId),
      this.dstTunnel.address,
      payload
    );
  }

  public getExpectedTransactionProof(
    expectedPayload?: CrossChainPayload
  ): TransactionProof {
    expectedPayload = expectedPayload ?? this.expectedCrossChainPayload;

    return new TransactionProof(
      getLzService(expectedPayload.localChainId).ulnNode.address,
      expectedPayload.nonce,
      expectedPayload.localChainId,
      expectedPayload.ua,
      expectedPayload.dstChainId,
      expectedPayload.dstAddress,
      expectedPayload.payload
    );
  }

  public async sendCrossChain(
    operator: SignerWithAddress
  ): Promise<ContractReceipt> {
    await this.originalState;
    this._payload = this.getPayload(operator);
    this._expectedCrossChainPayload = await this.getExpectedCrossChainPayload();
    this._expectedTransactionProof = this.getExpectedTransactionProof();

    let nativeFee = (
      await this.srcTunnel.estimateSendFee(
        this.sendParams,
        false,
        this.adapterParams
      )
    ).nativeFee;

    let rcpt = await lzEcoSystem.sendMessage(
      this.srcTunnel.address,
      async () => {
        return this.srcTunnel.connect(operator).sendFrom(
          this.sendParams,
          this.fromAddress, // _refundAddress
          hardhat.ethers.constants.AddressZero, // _zroPaymentAddress
          this.adapterParams, // _adapterParams
          { value: nativeFee }
        );
      }
    );

    return this.getReceipt(rcpt);
  } // sendCrossChain

  public crossChainSendWasSuccessful(fromMain: boolean, toMain: boolean) {
    it("The total circulating supply is unchanged", async () => {
      let mainToken = getToken(lzChainIdMain);
      let totalTokenBalance = (await mainToken.circulatingSupply())
        .add(await getToken(lzChainIdChild1).circulatingSupply())
        .add(await getToken(lzChainIdChild2).circulatingSupply());

      expect(totalTokenBalance).to.equal(max_supply);
    });

    this.sendFromWasSuccessful(fromMain, false);
    this.lzReceiveWasSuccessful(toMain, false);
  } // crossChainSendWasSuccessful

  public crossChainFailedOnRemoteSide(fromMain: boolean, toMain: boolean) {
    it("The total circulating supply is reduced by the send amount", async () => {
      let mainToken = getToken(lzChainIdMain);
      let totalTokenBalance = (await mainToken.circulatingSupply())
        .add(await getToken(lzChainIdChild1).circulatingSupply())
        .add(await getToken(lzChainIdChild2).circulatingSupply());

      expect(totalTokenBalance).to.equal(max_supply.sub(this.sendAmount));
    });

    this.sendFromWasSuccessful(fromMain, true);
    this.receiveFailed(toMain);
  } // crossChainSendWasSuccessful

  public crossChainFailedAtRemoteEndpoint(
    fromMain: boolean,
    toMain: boolean,
    expectedReason: string | null
  ) {
    this.sendFromWasSuccessful(fromMain, true);
    this.receiveFailed(toMain);

    it(`PayloadStored is emitted, error is '${expectedReason}'`, async () => {
      expectEvent(this.receipt, PayloadStored, {
        srcChainId: getLzChainId(this.srcChainId),
        srcAddress: this.dstPath,
        dstAddress: this.dstTunnel.address,
        nonce: (await this.expectedState).inboundNonce,
        payload: this.payload,
        reason: encodeRevertReason(expectedReason),
      });
    });
  } // crossChainFailedAtRemoteEndpoint

  public crossChainFailedAtRemoteTunnel(
    fromMain: boolean,
    toMain: boolean,
    expectedReason: string
  ) {
    this.crossChainFailedOnRemoteSide(fromMain, toMain);

    it(`MessageFailed is emitted, error is '${expectedReason}'`, async () => {
      expectEvent(this.receipt, MessageFailed, {
        srcChainId: getLzChainId(this.srcChainId),
        srcAddress: this.dstPath,
        nonce: (await this.expectedState).inboundNonce,
        payload: this.payload,
        reason: encodeRevertReason(expectedReason),
      });
    });
  } // crossChainFailedAtRemoteTunnel

  public async callSentToBridge(
    operator: SignerWithAddress,
    psuedobridge: SignerWithAddress
  ): Promise<ContractReceipt> {
    await this.originalState;

    let tx = await this.srcToken
      .connect(psuedobridge)
      .sentToBridge(this.getBridgeArgs(operator, this.dstChainId));
    return this.getReceipt(tx);
  } // callSentToBridge

  public sentToBridgeWasSuccessful(
    fromMain: boolean,
    checkTransferEvents = true
  ) {
    it("The circulating supply is reduced on the source chain", async () => {
      expect(this.actualState.srcCirculatingSupply).to.equal(
        (await this.expectedState).srcCirculatingSupply
      );
    });

    it("The sender's balance is reduced on the source chain", async () => {
      expect(this.actualState.senderBalance).to.equal(
        (await this.expectedState).senderBalance
      );
    });

    if (fromMain) {
      it("Tokens were added to the vault on the main chain", async () => {
        expect(this.actualState.vaultAmount).to.equal(
          (await this.expectedState).vaultAmount
        );
      });

      if (checkTransferEvents) {
        it("Transfer to vault address is emitted by the source token contract", async () => {
          expectEvent(this.receipt, Transfer, {
            from: this.fromAddress,
            to: await this.srcToken.vault(),
            value: this.sendAmount,
          });
        });
      }
    } else if (checkTransferEvents) {
      it("Transfer to null address (burn) is emitted by the source token contract", async () => {
        expectEvent(this.receipt, Transfer, {
          from: this.fromAddress,
          to: hardhat.ethers.constants.AddressZero,
          value: this.sendAmount,
        });
      });
    }

    it("SentToBridge is emitted by the source token contract", async () => {
      expectEvent(this.receipt, SentToBridge, {
        fromAddress: this.fromAddress,
        toAddress: this.toAddress,
        itemId: 1,
        amount: this.sendAmount,
        // caller: this.operator.address,
        dstChainId: this.dstChainId,
      });
    });
  } // sentToBridgeWasSuccessful

  public async callReceivedFromBridge(
    operator: SignerWithAddress,
    psuedobridge: SignerWithAddress
  ): Promise<ContractReceipt> {
    await this.originalState;

    this._payload = this.getPayload(operator);

    let tx = await this.dstToken
      .connect(psuedobridge)
      .receivedFromBridge(this.getBridgeArgs(operator, this.srcChainId));
    return this.getReceipt(tx);
  } // callReceivedFromBridge

  public receivedFromBridgeWasSuccessful(
    toMain: boolean,
    checkTransferEvents = true
  ) {
    it("The circulating supply is increased on the destination chain", async () => {
      expect(this.actualState.dstCirculatingSupply).to.equal(
        (await this.expectedState).dstCirculatingSupply
      );
    });

    it("The receiver's balance is increased on the destination chain", async () => {
      expect(this.actualState.receiverBalance).to.equal(
        (await this.expectedState).receiverBalance
      );
    });

    if (toMain) {
      it("Tokens were removed from the vault on the main chain", async () => {
        expect(this.actualState.vaultAmount).to.equal(
          (await this.expectedState).vaultAmount
        );
      });

      if (checkTransferEvents) {
        it("Transfer from vault address is emitted by the destination token contract", async () => {
          expectEvent(this.receipt, Transfer, {
            from: await this.dstToken.vault(),
            to: this.toAddress,
            value: this.sendAmount,
          });
        });
      }
    } else if (checkTransferEvents) {
      it("Transfer from null address (mint) is emitted by the destination token contract", async () => {
        expectEvent(this.receipt, Transfer, {
          from: hardhat.ethers.constants.AddressZero,
          to: this.toAddress,
          value: this.sendAmount,
        });
      });
    }

    it("ReceivedFromBridge is emitted by the destination token contract", async () => {
      expectEvent(this.receipt, ReceivedFromBridge, {
        fromAddress: this.fromAddress,
        toAddress: this.toAddress,
        itemId: 1,
        amount: this.sendAmount,
        // caller: this.operator.address,
        srcChainId: this.srcChainId,
      });
    });
  } // receivedFromBridgeWasSuccessful

  public async receiveFailed(toMain: boolean) {
    it("The circulating supply is unchanged on the destination chain", async () => {
      expect(this.actualState.dstCirculatingSupply).to.equal(
        (await this.originalState).dstCirculatingSupply
      );
    });

    it("The receiver's balance is unchanged on the destination chain", async () => {
      expect(this.actualState.receiverBalance).to.equal(
        (await this.originalState).receiverBalance
      );
    });

    if (toMain) {
      it("Tokens were not removed from the vault on the main chain", async () => {
        expect(this.actualState.vaultAmount).to.equal(
          (await this.originalState).vaultAmount
        );
      });
    }
  } // receiveFailed

  public async callLzReceive(
    operator: SignerWithAddress,
    psuedobridge: SignerWithAddress,
    psuedoTunnel: LzBridgeableTokenTunnel
  ): Promise<ContractReceipt> {
    let originalState = await this.originalState;
    let expectedState = await this.expectedState;
    expectedState.inboundNonce = originalState.inboundNonce;

    let lzChainId = getLzChainId(this.srcChainId);

    this._payload = this.getPayload(operator);

    let tx = await psuedoTunnel
      .connect(psuedobridge)
      .lzReceive(
        lzChainId,
        await psuedoTunnel.trustedRemoteLookup(lzChainId),
        0,
        this.getPayload(operator)
      );
    return this.getReceipt(tx);
  } // callLzReceive

  public lzReceiveWasSuccessful(toMain: boolean, checkTransferEvents = true) {
    this.receivedFromBridgeWasSuccessful(toMain, checkTransferEvents);

    it("ReceiveFromChain is emitted by the destination token tunnel contract", async () => {
      expectEvent(this.receipt, ReceiveFromChain, {
        srcChainId: getLzChainId(this.srcChainId),
        to: this.toAddress,
        nonce: (await this.expectedState).inboundNonce,
        tokenId: 1,
        amount: this.sendAmount,
      });
    });
  } // lzReceiveWasSuccessful

  public async callSendFrom(
    operator: SignerWithAddress
  ): Promise<ContractReceipt> {
    await this.originalState;
    this._payload = this.getPayload(operator);
    this._expectedCrossChainPayload = await this.getExpectedCrossChainPayload();
    this._expectedTransactionProof = this.getExpectedTransactionProof();

    let nativeFee = (
      await this.srcTunnel.estimateSendFee(
        this.sendParams,
        false,
        this.adapterParams
      )
    ).nativeFee;

    // let lzChainId = getLzChainId(this.srcChainId);
    // console.log("srcChainId:", this.srcChainId);
    // console.log("lzChainId:", lzChainId);
    // expect(await this.srcTunnel.lzEndpoint()).to.equal(
    //   getEndpoint(lzChainId).address
    // );
    // expect(getLzService(lzChainId).endpoint.address).to.equal(
    //   getEndpoint(lzChainId).address
    // );
    // expect(await getEndpoint(lzChainId).chainId()).to.equal(lzChainId);
    // expect(
    //   await this.srcTunnel.layerZeroChainIdsToNormalChainIds(lzChainId)
    // ).to.equal(this.srcChainId);

    let tx = await this.srcTunnel.connect(operator).sendFrom(
      this.sendParams,
      this.fromAddress, // _refundAddress
      hardhat.ethers.constants.AddressZero, // _zroPaymentAddress
      this.adapterParams, // _adapterParams
      { value: nativeFee }
    );

    return this.getReceipt(tx);
  } // callSendFrom

  public sendFromWasSuccessful(fromMain: boolean, checkTransferEvents = true) {
    this.sentToBridgeWasSuccessful(fromMain, checkTransferEvents);

    it("SentToChain is emitted by the source token tunnel contract", async () => {
      expectEvent(this.receipt, SendToChain, {
        dstChainId: getLzChainId(this.dstChainId),
        from: this.fromAddress,
        nonce: (await this.expectedState).outboundNonce,
        toAddress: this.toAddress,
        tokenId: 1,
        amount: this.sendAmount,
      });
    });

    it("PacketEvent is emitted", async () => {
      let packetEvent = (await lzEcoSystem.getPacketEvent(
        this.receipt
      )) as Result;
      expect(!!packetEvent).to.be.true;
      expect(CrossChainPayload.decode(packetEvent.payload)).to.deep.equal(
        this.expectedCrossChainPayload
      );
    });

    it("The transaction proof has the expected values", async () => {
      expect(
        await lzEcoSystem.buildTransactionProofFromReceipt(
          this.srcTunnel.address,
          this.receipt
        )
      ).to.deep.equal(this.expectedTransactionProof);
    });
  } // sendFromWasSuccessful

  public async reportConfirmation(
    confirmations: number
  ): Promise<ContractReceipt> {
    let transactionProof = await lzEcoSystem.buildTransactionProofFromReceipt(
      this.srcTunnel.address,
      this.receipt
    );

    let rcpt = await lzEcoSystem.reportConfirmations(
      transactionProof,
      confirmations
    );
    return this.getReceipt(rcpt);
  }

  public confirmationWasSuccessful(confirmations: number) {
    it("The confirmations are updated", async () => {
      let dstService = getLzService(getLzChainId(this.dstChainId));
      let hash = this.expectedTransactionProof.blockHash();

      expect(
        await dstService.ulnNode.hashLookup(
          dstService.oracle.address,
          getLzChainId(this.srcChainId),
          hash,
          hash
        )
      ).to.equal(1);
    });

    it("HashReceived is emitted", async () => {
      let dstService = getLzService(getLzChainId(this.dstChainId));
      let hash = this.expectedTransactionProof.blockHash();
      let HashReceived = await lzEcoSystem.hashEventAbi;

      expectEvent(this.receipt, HashReceived, {
        srcChainId: getLzChainId(this.srcChainId),
        oracle: dstService.oracle.address,
        lookupHash: hash,
        blockData: hash,
        confirmations: 1,
      });
    });
  }

  public async routeMessage(): Promise<ContractReceipt | null> {
    let maybeReceipt = await lzEcoSystem.routePacket(
      this.expectedTransactionProof
    );
    if (maybeReceipt) {
      return this.getReceipt(maybeReceipt);
    }
    return null;
  }

  public async callRetryPayload(payload?: string): Promise<ContractReceipt> {
    await this.resetState();
    let dstLzChainId = getLzChainId(this.dstChainId);
    let endpoint = getEndpoint(dstLzChainId);

    payload = payload ?? this.payload;

    let tx = await endpoint.retryPayload(
      getLzChainId(this.srcChainId),
      this.dstPath,
      payload
    );
    return this.getReceipt(tx);
  } // callRetryPayload

  public async retryQueuedMessage(): Promise<ContractReceipt> {
    await this.resetState();
    let dstLzChainId = getLzChainId(this.dstChainId);
    let lzService = getLzService(dstLzChainId);

    return this.getReceipt(
      await lzService.retryNextQueuedMessage(this.dstPath)
    );
  } // retryQueuedMessage

  public retryPayloadSuccessful(toMain: boolean) {
    this.lzReceiveWasSuccessful(toMain, false);

    it("PayloadCleared is emitted by the remote endpoint", async () => {
      expectEvent(this.receipt, PayloadCleared, {
        srcChainId: getLzChainId(this.srcChainId),
        srcAddress: this.dstPath,
        nonce: (await this.expectedState).inboundNonce,
        dstAddress: this.dstTunnel.address,
      });
    });
  } // retryPayloadSuccessful

  public async callForceResumeReceive(
    layerzeroAdmin: SignerWithAddress
  ): Promise<ContractReceipt> {
    await this.resetState();
    let srcLzChainId = getLzChainId(this.srcChainId);
    let dstLzChainId = getLzChainId(this.dstChainId);
    let tunnel = getTunnel(dstLzChainId);

    let tx = await tunnel
      .connect(layerzeroAdmin)
      .forceResumeReceive(srcLzChainId, this.dstPath);
    return this.getReceipt(tx);
  } // callForceResumeReceive

  public forceResumeReceiveSuccessful(shouldProceed: boolean, toMain: boolean) {
    if (shouldProceed) {
      this.lzReceiveWasSuccessful(toMain, false);
    } else {
      this.receiveFailed(toMain);
    }

    it("UaForceResumeReceive is emitted by the remore endpoint", async () => {
      expectEvent(this.receipt, UaForceResumeReceive, {
        chainId: getLzChainId(this.srcChainId),
        srcAddress: this.dstPath,
      });
    });
  } // forceResumeReceiveSuccessful

  public async callRetryMessage(
    nonce: number,
    payload?: string
  ): Promise<ContractReceipt> {
    let ogState = await this.resetState();
    ogState.inboundNonce = BigNumber.from(nonce);
    let srcLzChainId = getLzChainId(this.srcChainId);

    payload = payload ?? this.payload;

    let tx = await this.dstTunnel.retryMessage(
      srcLzChainId,
      this.dstPath,
      nonce,
      payload
    );
    return this.getReceipt(tx);
  } // callRetryMessage

  public retryMessageSuccessful(toMain: boolean) {
    this.lzReceiveWasSuccessful(toMain, true);

    it("RetryMessageSuccess is emitted by the remote endpoint", async () => {
      expectEvent(this.receipt, RetryMessageSuccess, {
        srcChainId: getLzChainId(this.srcChainId),
        srcAddress: this.dstPath,
        nonce: (await this.expectedState).inboundNonce,
        payloadHash: keccak256(this.payload),
      });
    });
  } // retryPayloadSuccessful

  protected async getReceipt(
    tx: ContractTransaction | ContractReceipt
  ): Promise<ContractReceipt> {
    if ("logsBloom" in tx) this._receipt = tx as ContractReceipt;
    else this._receipt = await (tx as ContractTransaction).wait();

    if (this.debug) {
      console.log(util.inspect(this._receipt, { depth: null, colors: true }));
    }

    this._actualState = await this.buildTestState();
    return this._receipt;
  }
}

let debug = false;
let testEverything = true;
let testDeployment = testEverything;
let testBridgeFunctions = testEverything;
let testCrossChainSend = true;
let testRetry = testEverything;

let deployFilter = {
  testUpgrade: true,
  testChild: true,
  testWiring: true,
};
let bridgeFilter = {
  sentToBridge: testEverything,
  receivedFromBridge: testEverything,
  lzReceive: testEverything,
  stepThrough: testEverything,
};
let crossChainFilter = {
  mainToChild: true,
  childToMain: true,
  childToChild: true,
};
let retryFilter = {
  testRetryOnEndpoint: testEverything,
  testRetryOnTunnel: testEverything,
};

describe("ERC20 Layer Zero Tests", function () {
  let signers: SignerWithAddress[];

  let contractOwner: SignerWithAddress;
  let layerzeroAdmin: SignerWithAddress;
  let hodler1: SignerWithAddress;
  let hodler2: SignerWithAddress;
  let hodler3: SignerWithAddress;
  let hodler4: SignerWithAddress;
  let hodler5: SignerWithAddress;
  let operator1: SignerWithAddress;
  let operator2: SignerWithAddress;
  let operator3: SignerWithAddress;
  let l33tHaxx0r: SignerWithAddress;
  let psuedobridge: SignerWithAddress;

  let accessServer: AccessServer;

  const testCase: LayerZeroTestCase = new LayerZeroTestCase({
    fromAddress: hardhat.ethers.constants.AddressZero,
    srcChainId: 0,
    dstChainId: 0,
  });

  // deploy original on src network, then upgrade to cross-chain version
  let initSrcTokenContract: () => Promise<
    [ViciERC20UtilityToken, LzBridgeableTokenTunnel]
  >;

  // deploy cross-chain version directly on dst network
  let initChildTokenContract: (
    layerZeroChainId: number
  ) => Promise<[ViciERC20UtilityToken, LzBridgeableTokenTunnel]>;

  let initUntrustedTokenContract: (
    chainId: number
  ) => Promise<[ViciERC20MintableUtilityToken, LzBridgeableTokenTunnel]>;

  let connectCrosschainContracts: (
    lzChainId1: number,
    lzChainId2: number
  ) => Promise<void>;

  let preTestSetup: () => Promise<void>;
  let postTestTeardown: () => Promise<void>;

  let spoofToken: ViciERC20MintableUtilityToken;
  let spoofTunnel: LzBridgeableTokenTunnel;

  before(async function () {
    signers = await hardhat.ethers.getSigners();
    contractOwner = signers[0];
    layerzeroAdmin = signers[1];
    hodler1 = signers[2];
    hodler2 = signers[3];
    hodler3 = signers[4];
    hodler4 = signers[5];
    hodler5 = signers[6];
    operator1 = signers[7];
    operator2 = signers[8];
    operator3 = signers[9];
    l33tHaxx0r = signers[10];
    psuedobridge = signers[11];

    accessServer = await MOCK_CONTRACTS.mockAccessServer();
    accessServer.addAdministrator(contractOwner.address);
    await accessServer.grantGlobalRole(
      LAYERZERO_ADMIN_ROLE,
      layerzeroAdmin.address
    );

    initSrcTokenContract = async function () {
      // deploy original
      let erc20Ops = (await proxyDeploy(
        "ERC20UtilityOperations_v01",
        max_supply
      )) as ERC20UtilityOperations_v01;

      let originalContract = (await proxyDeploy(
        "ViciERC20v01",
        accessServer.address,
        erc20Ops.address,
        name,
        symbol,
        decimals
      )) as ViciERC20v01;
      erc20Ops.transferOwnership(originalContract.address);

      // mint all the tokens
      await originalContract.mint(contractOwner.address, max_supply);

      // pass them around
      await originalContract
        .connect(contractOwner)
        .transfer(hodler1.address, holderStartAmount);
      await originalContract
        .connect(contractOwner)
        .transfer(hodler2.address, holderStartAmount);
      await originalContract
        .connect(contractOwner)
        .transfer(hodler3.address, holderStartAmount);
      await originalContract
        .connect(contractOwner)
        .transfer(hodler4.address, holderStartAmount);
      await originalContract
        .connect(contractOwner)
        .transfer(hodler5.address, holderStartAmount);

      await originalContract
        .connect(hodler1)
        .approve(operator1.address, holderStartAmount);

      await proxyUpgradeWithInitSignature(
        erc20Ops,
        "ERC20UtilityOperations",
        "reinit(uint256)",
        AIRDROP_THRESHOLD
      );
      let tokenContract = (await proxyUpgradeWithInitSignature(
        originalContract,
        "ViciERC20UtilityToken",
        "reinit(bool)",
        true
      )) as ViciERC20UtilityToken;

      let lzTunnel = (await proxyDeploy(
        "LzBridgeableTokenTunnel",
        accessServer.address,
        getEndpoint(lzChainIdMain).address,
        tokenContract.address
      )) as LzBridgeableTokenTunnel;

      tokenContract.grantRole(BRIDGE_CONTRACT_ROLE, lzTunnel.address);

      await lzTunnel.setChainIdMappings(
        [lzChainIdMain, lzChainIdChild1, lzChainIdChild2, lzChainIdUntrusted],
        [
          normalChainIdMain,
          normalChainIdChild1,
          normalChainIdChild2,
          normalChainIdUntrusted,
        ]
      );

      tokens.set(lzChainIdMain, tokenContract);
      tunnels.set(lzChainIdMain, lzTunnel);

      // console.log(
      //   `Main token (${layerZeroChainIdMain}): ${tokenContract.address}`
      // );
      // console.log(
      //   `Main Tunnel (${layerZeroChainIdMain}): ${lzTunnel.address}`
      // );
      // console.log("----------");

      return [tokenContract, lzTunnel];
    }; // initSrcTokenContract

    initChildTokenContract = async function (layerZeroChainId: number) {
      let erc20Ops = (await proxyDeployWithInitSignature(
        "ERC20UtilityOperations",
        "initialize(uint256,uint256)",
        max_supply,
        AIRDROP_THRESHOLD
      )) as ERC20UtilityOperations;

      let tokenContract = (await proxyDeployWithInitSignature(
        "ViciERC20UtilityToken",
        "initialize(address,address,string,string,uint8,bool)",
        accessServer.address,
        erc20Ops.address,
        name,
        symbol,
        decimals,
        false
      )) as ViciERC20UtilityToken;

      erc20Ops.transferOwnership(tokenContract.address);

      await tokenContract
        .connect(hodler2)
        .approve(operator2.address, holderStartAmount);

      let endpoint = getEndpoint(layerZeroChainId);

      let lzTunnel = (await proxyDeploy(
        "LzBridgeableTokenTunnel",
        accessServer.address,
        endpoint.address,
        tokenContract.address
      )) as LzBridgeableTokenTunnel;

      tokenContract.grantRole(BRIDGE_CONTRACT_ROLE, lzTunnel.address);

      await lzTunnel.setChainIdMappings(
        [lzChainIdMain, lzChainIdChild1, lzChainIdChild2, lzChainIdUntrusted],
        [
          normalChainIdMain,
          normalChainIdChild1,
          normalChainIdChild2,
          normalChainIdUntrusted,
        ]
      );

      // console.log(
      //   `Child token (${layerZeroChainId}): ${tokenContract.address}`
      // );
      // console.log(`Child Tunnel (${layerZeroChainId}): ${lzTunnel.address}`);
      // console.log("----------");

      tokens.set(layerZeroChainId, tokenContract);
      tunnels.set(layerZeroChainId, lzTunnel);

      return [tokenContract, lzTunnel];
    }; //initDstTokenContract

    connectCrosschainContracts = async function (
      lzChainId1: number,
      lzChainId2: number
    ) {
      let tunnel1 = getTunnel(lzChainId1);
      let tunnel2 = getTunnel(lzChainId2);

      await tunnel1
        .connect(layerzeroAdmin)
        .setTrustedRemote(
          lzChainId2,
          buildPath(tunnel2.address, tunnel1.address)
        );

      // console.log(
      //   `Set trusted remote for ${lzChainId2} on ${tunnel1.address} to ${dstPath}`
      // );

      await tunnel2
        .connect(layerzeroAdmin)
        .setTrustedRemote(
          lzChainId1,
          buildPath(tunnel1.address, tunnel2.address)
        );

      // console.log(
      //   `Set trusted remote for ${lzChainId1} on ${tunnel2.address} to ${srcPath}`
      // );
      // console.log("----------");
    }; // connectCrosschainContracts

    initUntrustedTokenContract = async function (chainId) {
      let erc20Ops = (await proxyDeployWithInitSignature(
        "ERC20UtilityOperations",
        "initialize(uint256,uint256)",
        max_supply,
        AIRDROP_THRESHOLD
      )) as ERC20UtilityOperations;
      let lzChainId = getLzChainId(chainId);

      let tokenContract = (await proxyDeployWithInitSignature(
        "ViciERC20MintableUtilityToken",
        "initialize(address,address,string,string,uint8,bool)",
        accessServer.address,
        erc20Ops.address,
        name,
        symbol,
        decimals,
        false
      )) as ViciERC20MintableUtilityToken;

      erc20Ops.transferOwnership(tokenContract.address);
      await tokenContract.transferOwnership(l33tHaxx0r.address);

      await tokenContract
        .connect(l33tHaxx0r)
        .mint(l33tHaxx0r.address, max_supply);

      let endpoint = getEndpoint(lzChainId);

      let tunnel = (await proxyDeploy(
        "LzBridgeableTokenTunnel",
        accessServer.address,
        endpoint.address,
        tokenContract.address
      )) as LzBridgeableTokenTunnel;

      await tunnel.transferOwnership(l33tHaxx0r.address);

      await tunnel
        .connect(l33tHaxx0r)
        .setChainIdMappings(
          [lzChainIdMain, lzChainIdChild1, lzChainIdChild2, lzChainIdUntrusted],
          [
            normalChainIdMain,
            normalChainIdChild1,
            normalChainIdChild2,
            normalChainIdUntrusted,
          ]
        );

      tokenContract
        .connect(l33tHaxx0r)
        .grantRole(BRIDGE_CONTRACT_ROLE, tunnel.address);
      await tunnel
        .connect(l33tHaxx0r)
        .grantRole(LAYERZERO_ADMIN_ROLE, l33tHaxx0r.address);

      for (let remoteChainId of [
        lzChainIdMain,
        lzChainIdChild1,
        lzChainIdChild2,
      ]) {
        let remoteTunnel = getTunnel(remoteChainId);
        let remoteEndpoint = getEndpoint(remoteChainId);

        await tunnel
          .connect(l33tHaxx0r)
          .setTrustedRemote(
            remoteChainId,
            buildPath(remoteTunnel.address, tunnel.address)
          );
      }

      return [tokenContract, tunnel];
    };

    preTestSetup = async function () {
      lzEcoSystem = new LayerZeroEcosystem();
      await lzEcoSystem.createServiceForChain(
        lzChainIdMain,
        contractOwner.address
      );
      await lzEcoSystem.createServiceForChain(
        lzChainIdChild1,
        contractOwner.address
      );
      await lzEcoSystem.createServiceForChain(
        lzChainIdChild2,
        contractOwner.address
      );
      await lzEcoSystem.createServiceForChain(
        lzChainIdUntrusted,
        contractOwner.address
      );
      await initSrcTokenContract();
      await initChildTokenContract(lzChainIdChild1);
      await initChildTokenContract(lzChainIdChild2);
      await connectCrosschainContracts(lzChainIdMain, lzChainIdChild1);
      await connectCrosschainContracts(lzChainIdMain, lzChainIdChild2);
      await connectCrosschainContracts(lzChainIdChild1, lzChainIdChild2);

      let [untrustedToken, untrustedTunnel] = await initUntrustedTokenContract(
        normalChainIdUntrusted
      );
      tokens.set(lzChainIdUntrusted, untrustedToken);
      tunnels.set(lzChainIdUntrusted, untrustedTunnel);

      [spoofToken, spoofTunnel] = await initUntrustedTokenContract(
        normalChainIdChild2
      );
    }; // preTestSetup

    postTestTeardown = async function () {
      tokens.clear();
      tunnels.clear();
      testCase.reset();
    }; // postTestTeardown

    let viciCoinFactory = await hardhat.ethers.getContractFactory(
      "ViciERC20UtilityToken"
    );
    let viciCoinAbi = new ContractABI(viciCoinFactory.interface);
    Transfer = viciCoinAbi.eventsBySignature.get(
      "Transfer(address,address,uint256)"
    ) as EventABI;
    SentToBridge = viciCoinAbi.eventsBySignature.get(
      "SentToBridge(address,address,uint256,uint256,address,uint256)"
    ) as EventABI;
    ReceivedFromBridge = viciCoinAbi.eventsBySignature.get(
      "ReceivedFromBridge(address,address,uint256,uint256,address,uint256)"
    ) as EventABI;

    let tunnelFactory = await hardhat.ethers.getContractFactory(
      "LzBridgeableTokenTunnel"
    );
    let tunnelAbi = new ContractABI(tunnelFactory.interface);
    SendToChain = tunnelAbi.eventsBySignature.get(
      "SendToChain(uint16,address,uint64,address,uint256,uint256)"
    ) as EventABI;
    ReceiveFromChain = tunnelAbi.eventsBySignature.get(
      "ReceiveFromChain(uint16,address,uint64,uint256,uint256)"
    ) as EventABI;
    MessageFailed = tunnelAbi.eventsBySignature.get(
      "MessageFailed(uint16,bytes,uint64,bytes,bytes)"
    ) as EventABI;
    RetryMessageSuccess = tunnelAbi.eventsBySignature.get(
      "RetryMessageSuccess(uint16,bytes,uint64,bytes32)"
    ) as EventABI;

    let endpointAbi = new ContractABI(
      (await LAYER_ZERO_FACTORY.endpointFactory).interface
    );
    PayloadStored = endpointAbi.eventsBySignature.get(
      "PayloadStored(uint16,bytes,address,uint64,bytes,bytes)"
    ) as EventABI;
    PayloadCleared = endpointAbi.eventsBySignature.get(
      "PayloadCleared(uint16,bytes,uint64,address)"
    ) as EventABI;
    UaForceResumeReceive = endpointAbi.eventsBySignature.get(
      "UaForceResumeReceive(uint16,bytes)"
    ) as EventABI;
  }); // main before()

  if (testDeployment) {
    describe("Test Deployment", function () {
      if (deployFilter.testUpgrade) {
        context("After upgrading to cross-chain version", function () {
          let mainERC20: ViciERC20UtilityToken;
          let mainTunnel: LzBridgeableTokenTunnel;

          before(async function () {
            lzEcoSystem = new LayerZeroEcosystem();
            await lzEcoSystem.createServiceForChain(
              lzChainIdMain,
              contractOwner.address
            );
            [mainERC20, mainTunnel] = await initSrcTokenContract();
          });

          after(async function () {
            lzEcoSystem = undefined as unknown as LayerZeroEcosystem;
            tokens.delete(lzChainIdMain);
            tunnels.delete(lzChainIdMain);
          });

          it("hodler1 balance is unchanged", async function () {
            expect(await mainERC20.balanceOf(hodler1.address)).to.equal(
              holderStartAmount
            );
          });

          it("operator has the expected approval", async function () {
            expect(
              await mainERC20.allowance(hodler1.address, operator1.address)
            ).to.equal(holderStartAmount);
          });

          it("tunnel is connected to the token contract", async function () {
            expect(await mainTunnel.token()).to.equal(mainERC20.address);
          });

          it("the vault is created", async function () {
            expect(await mainERC20.vault()).to.not.equal(
              hardhat.ethers.constants.AddressZero
            );
          });

          it("the contract is marked as 'main'", async function () {
            expect(await mainERC20.isMain()).to.be.true;
          });

          it("the tunnel is connected to the endpoint", async function () {
            expect(await mainTunnel.lzEndpoint()).to.equal(
              getEndpoint(lzChainIdMain).address
            );
          });
        }); // After upgrading to cross-chain version
      }
      if (deployFilter.testChild) {
        context("After deploying child contract", function () {
          let childERC20: ViciERC20UtilityToken;
          let childTunnel: LzBridgeableTokenTunnel;

          before(async function () {
            lzEcoSystem = new LayerZeroEcosystem();
            await lzEcoSystem.createServiceForChain(
              lzChainIdChild1,
              contractOwner.address
            );
            [childERC20, childTunnel] = await initChildTokenContract(
              lzChainIdChild1
            );
          });

          after(async function () {
            lzEcoSystem = undefined as unknown as LayerZeroEcosystem;
            tokens.delete(lzChainIdChild1);
            tunnels.delete(lzChainIdChild1);
          });

          it("operator has the expected approval", async function () {
            expect(
              await childERC20.allowance(hodler2.address, operator2.address)
            ).to.equal(holderStartAmount);
          });

          it("tunnel is connected to the token contract", async function () {
            expect(await childTunnel.token()).to.equal(childERC20.address);
          });

          it("the vault is not created", async function () {
            expect(await childERC20.vault()).to.equal(
              hardhat.ethers.constants.AddressZero
            );
          });

          it("the contract is not marked as 'main'", async function () {
            expect(await childERC20.isMain()).to.be.false;
          });

          it("the tunnel is connected to the endpoint", async function () {
            expect(await childTunnel.lzEndpoint()).to.equal(
              getEndpoint(lzChainIdChild1).address
            );
          });
        }); // After deploying child contract
      }

      if (deployFilter.testWiring) {
        context("After wiring the contracts together", function () {
          before(async function () {
            await preTestSetup();
          });

          after(async function () {
            await postTestTeardown();
          });

          context("If both sides are trusted", function () {
            function checkWiring(
              chain1: number,
              name1: string,
              chain2: number,
              name2: string
            ) {
              it(`The ${name1} tunnel trusts the ${name2} tunnel`, async function () {
                expect(
                  await getTunnel(chain1).getTrustedRemoteAddress(chain2)
                ).to.equal(getTunnel(chain2).address.toLocaleLowerCase());
              });

              it(`The ${name2} tunnel trusts the ${name1} tunnel`, async function () {
                expect(
                  await getTunnel(chain2).getTrustedRemoteAddress(chain1)
                ).to.equal(getTunnel(chain1).address.toLocaleLowerCase());
              });
            } // checkWiring()

            checkWiring(lzChainIdMain, "main", lzChainIdChild1, "child1");
            checkWiring(lzChainIdMain, "main", lzChainIdChild2, "child2");
            checkWiring(lzChainIdChild1, "child1", lzChainIdChild2, "child2");
          }); // When both sides are trusted

          context("If one side is untrusted", function () {
            function checkUntrusted(chain1: number, name1: string) {
              it(`The untrusted tunnel trusts the ${name1} tunnel`, async function () {
                expect(
                  await getTunnel(lzChainIdUntrusted).getTrustedRemoteAddress(
                    chain1
                  )
                ).to.equal(getTunnel(chain1).address.toLocaleLowerCase());
              });

              it(`The ${name1} tunnel does not trust the untrusted tunnel`, async function () {
                expect(
                  await getTunnel(chain1).trustedRemoteLookup(
                    lzChainIdUntrusted
                  )
                ).to.equal("0x");
              });
            } // checkUntrusted

            checkUntrusted(lzChainIdMain, "main");
            checkUntrusted(lzChainIdChild1, "child1");
            checkUntrusted(lzChainIdChild2, "child2");
          }); // When one side is untrusted
        }); // After wiring main contract to child contract
      }
    }); // Test Deployment
  }

  if (testBridgeFunctions) {
    describe("Test bridge functions", function () {
      if (bridgeFilter.sentToBridge) {
        describe("ViciERC20.sentToBridge", function () {
          context(
            "When sentToBridge() called on main token contract",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();

                testCase.reinit({
                  fromAddress: hodler1.address,
                  toAddress: hodler2.address,
                  srcChainId: normalChainIdMain,
                  dstChainId: normalChainIdChild1,
                });
                await getToken(lzChainIdMain).grantRole(
                  BRIDGE_CONTRACT_ROLE,
                  psuedobridge.address
                );

                await testCase.callSentToBridge(hodler1, psuedobridge);
              });

              this.afterAll(async function () {
                await postTestTeardown();
              });

              testCase.sentToBridgeWasSuccessful(true);
            }
          ); // sentToBridge() on main

          context(
            "When sentToBridge() called on child token contract",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();
                await LayerZeroTestCase.sendToChildChain(
                  {
                    fromAddress: contractOwner.address,
                    toAddress: hodler3.address,
                    srcChainId: normalChainIdMain,
                    dstChainId: normalChainIdChild1,
                    sendAmount: hardhat.ethers.utils.parseUnits("250", 18),
                  },
                  contractOwner
                );

                testCase.reinit({
                  fromAddress: hodler3.address,
                  toAddress: hodler4.address,
                  srcChainId: normalChainIdChild1,
                  dstChainId: normalChainIdMain,
                });
                await getToken(lzChainIdChild1).grantRole(
                  BRIDGE_CONTRACT_ROLE,
                  psuedobridge.address
                );

                await testCase.callSentToBridge(hodler3, psuedobridge);
              });

              this.afterAll(async function () {
                await postTestTeardown();
              });

              testCase.sentToBridgeWasSuccessful(false);
            }
          ); // sentToBridge() on child

          context("When sentToBridge() called by a hacker", function () {
            this.beforeAll(async function () {
              await preTestSetup();

              testCase.reinit({
                fromAddress: hodler1.address,
                toAddress: hodler2.address,
                srcChainId: normalChainIdMain,
                dstChainId: normalChainIdChild1,
              });
            });

            this.afterAll(async function () {
              await postTestTeardown();
            });

            it("The error is {user} does not have role", async function () {
              await expect(
                testCase.callSentToBridge(hodler1, l33tHaxx0r)
              ).to.be.revertedWith(
                `AccessControl: account ${l33tHaxx0r.address.toLowerCase()} is missing role ${BRIDGE_CONTRACT_ROLE}`
              );
            });
          }); // When sentToBridge() called by a hacker
        }); // ViciERC20.sentToBridge
      }

      if (bridgeFilter.receivedFromBridge) {
        describe("ViciERC20.receivedFromBridge", function () {
          context(
            "When receivedFromBridge() called on main token contract",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();
                await LayerZeroTestCase.sendToChildChain(
                  {
                    fromAddress: contractOwner.address,
                    toAddress: hodler3.address,
                    srcChainId: normalChainIdMain,
                    dstChainId: normalChainIdChild1,
                    sendAmount: hardhat.ethers.utils.parseUnits("250", 18),
                  },
                  contractOwner
                );

                testCase.reinit({
                  fromAddress: hodler3.address,
                  toAddress: hodler4.address,
                  srcChainId: normalChainIdChild1,
                  dstChainId: normalChainIdMain,
                });
                await getToken(lzChainIdMain).grantRole(
                  BRIDGE_CONTRACT_ROLE,
                  psuedobridge.address
                );

                await testCase.callReceivedFromBridge(hodler3, psuedobridge);
              });

              this.afterAll(async function () {
                await postTestTeardown();
              });

              testCase.receivedFromBridgeWasSuccessful(true);
            }
          ); // receivedFromBridge() on main

          context(
            "When receivedFromBridge() called on child token contract",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();

                testCase.reinit({
                  fromAddress: hodler1.address,
                  toAddress: hodler2.address,
                  srcChainId: normalChainIdMain,
                  dstChainId: normalChainIdChild1,
                });
                await getToken(lzChainIdChild1).grantRole(
                  BRIDGE_CONTRACT_ROLE,
                  psuedobridge.address
                );

                await testCase.callReceivedFromBridge(hodler1, psuedobridge);
              });

              this.afterAll(async function () {
                await postTestTeardown();
              });

              testCase.receivedFromBridgeWasSuccessful(false);
            }
          ); // receivedFromBridge() on child

          context("When receivedFromBridge() called by a hacker", function () {
            this.beforeAll(async function () {
              await preTestSetup();

              testCase.reinit({
                fromAddress: hodler1.address,
                toAddress: hodler2.address,
                srcChainId: normalChainIdMain,
                dstChainId: normalChainIdChild1,
              });
            });

            this.afterAll(async function () {
              await postTestTeardown();
            });

            it("The error is {user} does not have role", async function () {
              await expect(
                testCase.callReceivedFromBridge(hodler1, l33tHaxx0r)
              ).to.be.revertedWith(
                `AccessControl: account ${l33tHaxx0r.address.toLowerCase()} is missing role ${BRIDGE_CONTRACT_ROLE}`
              );
            });
          }); // When sentToBridge() called by a hacker
        }); // ViciERC20.receivedFromBridge
      }

      if (bridgeFilter.lzReceive) {
        describe("LzBridgeableTokenTunnel.lzReceive", function () {
          let psuedoTunnel: LzBridgeableTokenTunnel;

          async function setupPseudoTunnel(
            lzChainId1: number,
            lzChainId2: number
          ): Promise<LzBridgeableTokenTunnel> {
            let token1 = getToken(lzChainId1);
            let token2 = getToken(lzChainId2);

            let lzTunnel = (await proxyDeploy(
              "LzBridgeableTokenTunnel",
              accessServer.address,
              psuedobridge.address,
              token2.address
            )) as LzBridgeableTokenTunnel;

            token2.grantRole(BRIDGE_CONTRACT_ROLE, lzTunnel.address);

            await lzTunnel.setChainIdMappings(
              [lzChainIdMain, lzChainIdChild1, lzChainIdChild2],
              [normalChainIdMain, normalChainIdChild1, normalChainIdChild2]
            );

            await lzTunnel
              .connect(layerzeroAdmin)
              .setTrustedRemote(
                lzChainId1,
                buildPath(token1.address, token2.address)
              );

            return lzTunnel;
          } // setupPseudoTunnel

          context(
            "When lzReceive() called on main tunnel contract",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();
                psuedoTunnel = await setupPseudoTunnel(
                  lzChainIdChild1,
                  lzChainIdMain
                );
                await LayerZeroTestCase.sendToChildChain(
                  {
                    fromAddress: contractOwner.address,
                    toAddress: hodler3.address,
                    srcChainId: normalChainIdMain,
                    dstChainId: normalChainIdChild1,
                    sendAmount: hardhat.ethers.utils.parseUnits("250", 18),
                  },
                  contractOwner
                );

                testCase.reinit({
                  fromAddress: hodler3.address,
                  toAddress: hodler4.address,
                  srcChainId: normalChainIdChild1,
                  dstChainId: normalChainIdMain,
                });

                await testCase.callLzReceive(
                  hodler3,
                  psuedobridge,
                  psuedoTunnel
                );
              });

              this.afterAll(async function () {
                await postTestTeardown();
              });

              testCase.lzReceiveWasSuccessful(true);
            }
          ); // receivedFromBridge() on main

          context(
            "When lzReceive() called on child tunnel contract",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();
                psuedoTunnel = await setupPseudoTunnel(
                  lzChainIdMain,
                  lzChainIdChild1
                );

                testCase.reinit({
                  fromAddress: hodler1.address,
                  toAddress: hodler2.address,
                  srcChainId: normalChainIdMain,
                  dstChainId: normalChainIdChild1,
                });

                await testCase.callLzReceive(
                  hodler1,
                  psuedobridge,
                  psuedoTunnel
                );
              });

              this.afterAll(async function () {
                await postTestTeardown();
              });

              testCase.lzReceiveWasSuccessful(false);
            }
          ); // receivedFromBridge() on child

          context("When lzReceive() called by a hacker", function () {
            this.beforeAll(async function () {
              await preTestSetup();
              psuedoTunnel = await setupPseudoTunnel(
                lzChainIdMain,
                lzChainIdChild1
              );

              testCase.reinit({
                fromAddress: l33tHaxx0r.address,
                toAddress: l33tHaxx0r.address,
                srcChainId: normalChainIdMain,
                dstChainId: normalChainIdChild1,
              });
            });

            this.afterAll(async function () {
              await postTestTeardown();
            });

            it("The error is 'LzApp: invalid endpoint caller'", async function () {
              await expect(
                testCase.callLzReceive(l33tHaxx0r, l33tHaxx0r, psuedoTunnel)
              ).to.be.revertedWith("LzApp: invalid endpoint caller");
            });
          }); // When sentToBridge() called by a hacker

          context(
            "When lzReceive() called with an untrusted remote",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();
                psuedoTunnel = await setupPseudoTunnel(
                  lzChainIdMain,
                  lzChainIdChild1
                );

                testCase.reinit({
                  fromAddress: l33tHaxx0r.address,
                  toAddress: l33tHaxx0r.address,
                  srcChainId: normalChainIdUntrusted,
                  dstChainId: normalChainIdChild1,
                });
              });

              this.afterAll(async function () {
                await postTestTeardown();
              });

              it("The error is 'LzApp: invalid source sending contract'", async function () {
                await expect(
                  testCase.callLzReceive(l33tHaxx0r, psuedobridge, psuedoTunnel)
                ).to.be.revertedWith("LzApp: invalid source sending contract");
              });
            }
          ); // When lzReceive() called with an untrusted remote
        }); // LzBridgeableTokenTunnel.lzReceive
      }

      if (bridgeFilter.stepThrough) {
        describe("Stepping through individual steps", function () {
          function doStepCheck(fromMain: boolean) {
            context(
              "After sendFrom is called on the source tunnel",
              function () {
                this.beforeAll(async function () {
                  await testCase.callSendFrom(hodler1);
                });

                testCase.sendFromWasSuccessful(fromMain, true);
              }
            ); // After send from is called on the source tunnel
            context("After the confirmation is reported", function () {
              this.beforeAll(async function () {
                await testCase.reportConfirmation(1);
              });

              testCase.confirmationWasSuccessful(1);
            }); // After the confirmation is reported

            context("After the relayer validates the message", function () {
              this.beforeAll(async function () {
                await testCase.routeMessage();
              });

              testCase.lzReceiveWasSuccessful(!fromMain, true);
            }); // After the relayer validates the message
          } // doStepCheck

          context(
            "When sending from the main chain to a child chain",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();

                testCase.reinit({
                  fromAddress: hodler1.address,
                  toAddress: hodler2.address,
                  srcChainId: normalChainIdMain,
                  dstChainId: normalChainIdChild1,
                });
              });

              this.afterAll(async function () {
                await postTestTeardown();
              });

              doStepCheck(true);
            }
          ); // When sending from the main chain to a child chain

          context(
            "When sending from a child chain to the main chain",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();
                await LayerZeroTestCase.sendToChildChain(
                  {
                    fromAddress: contractOwner.address,
                    toAddress: hodler1.address,
                    srcChainId: normalChainIdMain,
                    dstChainId: normalChainIdChild1,
                    sendAmount: hardhat.ethers.utils.parseUnits("250", 18),
                  },
                  contractOwner
                );

                testCase.reinit({
                  fromAddress: hodler1.address,
                  toAddress: hodler2.address,
                  srcChainId: normalChainIdChild1,
                  dstChainId: normalChainIdMain,
                });
              });

              this.afterAll(async function () {
                await postTestTeardown();
              });

              doStepCheck(false);
            }
          ); // When sending from a child chain to the main chain
        }); // Stepping through individual steps
      }
    }); // Test bridge functions
  }

  if (testCrossChainSend) {
    describe("Sending across chains", function () {
      if (crossChainFilter.mainToChild) {
        context(
          "When depositing from the main chain to a child chain",
          function () {
            async function mainToChildTestSetup(operator: SignerWithAddress) {
              await preTestSetup();

              testCase.reinit({
                fromAddress: hodler1.address,
                toAddress: hodler3.address,
                srcChainId: normalChainIdMain,
                dstChainId: normalChainIdChild1,
              });

              await testCase.sendCrossChain(operator);
            } // mainToChildTestSetup

            context("As the owner of the funds being transferred", function () {
              this.beforeAll(async function () {
                await mainToChildTestSetup(hodler1);
              });

              this.afterAll(async function () {
                await postTestTeardown();
              });

              testCase.crossChainSendWasSuccessful(true, false);
            }); // As the owner of the funds being transferred

            context("As the authorized agent of fund owner", function () {
              this.beforeAll(async function () {
                // testCase.debug = true;
                await mainToChildTestSetup(operator1);
                // testCase.debug = false;
              });

              this.afterAll(async function () {
                await postTestTeardown();
              });

              testCase.crossChainSendWasSuccessful(true, false);
            }); //  As the authorized agent of fund owner

            context(
              "if the transfer amount exceeds the unlocked balance",
              function () {
                this.beforeAll(async function () {
                  await preTestSetup();
                  testCase.reinit({
                    fromAddress: hodler1.address,
                    toAddress: hodler3.address,
                    srcChainId: normalChainIdMain,
                    dstChainId: normalChainIdChild1,
                    sendAmount: holderStartAmount.add(
                      hardhat.ethers.utils.parseUnits("1000", 18)
                    ),
                  });
                  await testCase.srcToken.airdropTimelockedTokens(
                    hodler1.address,
                    holderStartAmount,
                    BigNumber.from(LAYERZERO_ADMIN_ROLE)
                  );
                  // console.log(
                  //   "user total balance: ",
                  //   await testCase.srcToken.balanceOf(hodler1.address)
                  // );
                  // console.log(
                  //   "user locked balance: ",
                  //   await testCase.srcToken.lockedBalanceOf(hodler1.address)
                  // );
                  // console.log("bridge amount", testCase.sendAmount);
                });

                this.afterAll(async function () {
                  await postTestTeardown();
                });

                it("The error is 'insufficient balance'", async function () {
                  await expect(
                    testCase.sendCrossChain(hodler1)
                  ).to.be.revertedWith("insufficient balance");
                });
              }
            ); // if the transfer amount exceeds the unlocked balance
          }
        ); // When depositing from the main chain to a child chain
      }

      if (crossChainFilter.childToMain) {
        context(
          "When withdrawing from a child chain to the main chain",
          function () {
            async function childToMainTestSetup(operator: SignerWithAddress) {
              await preTestSetup();
              await LayerZeroTestCase.sendToChildChain(
                {
                  fromAddress: contractOwner.address,
                  toAddress: hodler2.address,
                  srcChainId: normalChainIdMain,
                  dstChainId: normalChainIdChild1,
                  sendAmount: hardhat.ethers.utils.parseUnits("250", 18),
                },
                contractOwner
              );

              testCase.reinit({
                fromAddress: hodler2.address,
                toAddress: hodler4.address,
                srcChainId: normalChainIdChild1,
                dstChainId: normalChainIdMain,
              });

              await testCase.sendCrossChain(operator);
            } // childToMainTestSetup

            context("As the owner of the funds being transferred", function () {
              this.beforeAll(async function () {
                // testCase.debug = true;
                await childToMainTestSetup(hodler2);
                // testCase.debug = false;
              });

              this.afterAll(async function () {
                await postTestTeardown();
              });

              testCase.crossChainSendWasSuccessful(false, true);
            }); //  As the owner of the funds being transferred

            context("As the authorized agent of fund owner", function () {
              this.beforeAll(async function () {
                // testCase.debug = true;
                await childToMainTestSetup(operator2);
                // testCase.debug = false;
              });

              this.afterAll(async function () {
                await postTestTeardown();
              });

              testCase.crossChainSendWasSuccessful(false, true);
            }); //  As the authorized agent of fund owner

            context(
              "if the transfer amount exceeds the unlocked balance",
              function () {
                this.beforeAll(async function () {
                  await preTestSetup();
                  await LayerZeroTestCase.sendToChildChain(
                    {
                      fromAddress: contractOwner.address,
                      toAddress: contractOwner.address,
                      srcChainId: normalChainIdMain,
                      dstChainId: normalChainIdChild1,
                      sendAmount: hardhat.ethers.utils.parseUnits("250", 18),
                    },
                    contractOwner
                  );
                  await LayerZeroTestCase.sendToChildChain(
                    {
                      fromAddress: contractOwner.address,
                      toAddress: hodler2.address,
                      srcChainId: normalChainIdMain,
                      dstChainId: normalChainIdChild1,
                      sendAmount: hardhat.ethers.utils.parseUnits("250", 18),
                    },
                    contractOwner
                  );
                  testCase.reinit({
                    fromAddress: hodler2.address,
                    toAddress: hodler4.address,
                    srcChainId: normalChainIdChild1,
                    dstChainId: normalChainIdMain,
                    sendAmount: hardhat.ethers.utils.parseUnits("400", 18),
                  });
                  await testCase.srcToken.airdropTimelockedTokens(
                    hodler2.address,
                    hardhat.ethers.utils.parseUnits("250", 18),
                    BigNumber.from(LAYERZERO_ADMIN_ROLE)
                  );
                  // console.log(
                  //   "user total balance: ",
                  //   await testCase.srcToken.balanceOf(hodler2.address)
                  // );
                  // console.log(
                  //   "user locked balance: ",
                  //   await testCase.srcToken.lockedBalanceOf(hodler2.address)
                  // );
                  // console.log("bridge amount", testCase.sendAmount);
                });

                this.afterAll(async function () {
                  await postTestTeardown();
                });

                it("The error is 'insufficient balance'", async function () {
                  await expect(
                    testCase.sendCrossChain(hodler2)
                  ).to.be.revertedWith("insufficient balance");
                });
              }
            ); // if the transfer amount exceeds the unlocked balance
          }
        ); // When depositing from the main chain to a child chain
      }

      if (crossChainFilter.childToChild) {
        context(
          "When transferring from one child chain to another",
          function () {
            async function childToChildTestSetup(operator: SignerWithAddress) {
              await preTestSetup();
              await LayerZeroTestCase.sendToChildChain(
                {
                  fromAddress: contractOwner.address,
                  toAddress: hodler2.address,
                  srcChainId: normalChainIdMain,
                  dstChainId: normalChainIdChild1,
                  sendAmount: hardhat.ethers.utils.parseUnits("250", 18),
                },
                contractOwner
              );

              testCase.reinit({
                fromAddress: hodler2.address,
                toAddress: hodler4.address,
                srcChainId: normalChainIdChild1,
                dstChainId: normalChainIdChild2,
              });

              await testCase.sendCrossChain(operator);
            } // childToChildTestSetup

            context("As the owner of the funds being transferred", function () {
              this.beforeAll(async function () {
                await childToChildTestSetup(hodler2);
              });

              this.afterAll(async function () {
                await postTestTeardown();
              });

              testCase.crossChainSendWasSuccessful(false, false);
            }); //  As the owner of the funds being transferred

            context("As the authorized agent of fund owner", function () {
              this.beforeAll(async function () {
                // testCase.debug = true;
                await childToChildTestSetup(operator2);
                // testCase.debug = false;
              });

              this.afterAll(async function () {
                await postTestTeardown();
              });

              testCase.crossChainSendWasSuccessful(false, true);
            }); //  As the authorized agent of fund owner

            context(
              "if the transfer amount exceeds the unlocked balance",
              function () {
                this.beforeAll(async function () {
                  await preTestSetup();
                  await LayerZeroTestCase.sendToChildChain(
                    {
                      fromAddress: contractOwner.address,
                      toAddress: contractOwner.address,
                      srcChainId: normalChainIdMain,
                      dstChainId: normalChainIdChild1,
                      sendAmount: hardhat.ethers.utils.parseUnits("250", 18),
                    },
                    contractOwner
                  );
                  await LayerZeroTestCase.sendToChildChain(
                    {
                      fromAddress: contractOwner.address,
                      toAddress: hodler2.address,
                      srcChainId: normalChainIdMain,
                      dstChainId: normalChainIdChild1,
                      sendAmount: hardhat.ethers.utils.parseUnits("250", 18),
                    },
                    contractOwner
                  );
                  testCase.reinit({
                    fromAddress: hodler2.address,
                    toAddress: hodler4.address,
                    srcChainId: normalChainIdChild1,
                    dstChainId: normalChainIdChild2,
                    sendAmount: hardhat.ethers.utils.parseUnits("400", 18),
                  });
                  await testCase.srcToken.airdropTimelockedTokens(
                    hodler2.address,
                    hardhat.ethers.utils.parseUnits("250", 18),
                    BigNumber.from(LAYERZERO_ADMIN_ROLE)
                  );
                  // console.log(
                  //   "user total balance: ",
                  //   await testCase.srcToken.balanceOf(hodler2.address)
                  // );
                  // console.log(
                  //   "user locked balance: ",
                  //   await testCase.srcToken.lockedBalanceOf(hodler2.address)
                  // );
                  // console.log("bridge amount", testCase.sendAmount);
                });

                this.afterAll(async function () {
                  await postTestTeardown();
                });

                it("The error is 'insufficient balance'", async function () {
                  await expect(
                    testCase.sendCrossChain(hodler2)
                  ).to.be.revertedWith("insufficient balance");
                });
              }
            ); // if the transfer amount exceeds the unlocked balance
          }
        ); //  When transferring from one child chain to another
      }

      context("When sending to an untrusted remote", function () {
        this.beforeAll(async function () {
          await preTestSetup();

          testCase.reinit({
            fromAddress: hodler1.address,
            toAddress: l33tHaxx0r.address,
            srcChainId: normalChainIdMain,
            dstChainId: normalChainIdUntrusted,
          });
        });

        this.afterAll(async function () {
          await postTestTeardown();
        });

        it("The error is 'LzApp: destination chain is not a trusted source'", async function () {
          await expect(testCase.sendCrossChain(hodler1)).to.be.revertedWith(
            "LzApp: destination chain is not a trusted source"
          );
        });
      }); // When sending to an untrusted remote

      context("When sending from an untrusted remote", function () {
        this.beforeAll(async function () {
          await preTestSetup();

          testCase.reinit({
            fromAddress: l33tHaxx0r.address,
            toAddress: l33tHaxx0r.address,
            srcChainId: normalChainIdChild2,
            dstChainId: normalChainIdMain,
          });

          testCase.srcToken = spoofToken;
          testCase.srcTunnel = spoofTunnel;

          await testCase.sendCrossChain(l33tHaxx0r);
        });

        this.afterAll(async function () {
          await postTestTeardown();
        });

        testCase.crossChainFailedAtRemoteEndpoint(
          false,
          true,
          "LzApp: invalid source sending contract"
        );
      }); // When sending from an untrusted remote

      context("When send fails due to revert on remote side", function () {
        this.beforeAll(async function () {
          await preTestSetup();

          testCase.reinit({
            fromAddress: hodler1.address,
            toAddress: l33tHaxx0r.address,
            srcChainId: normalChainIdMain,
            dstChainId: normalChainIdChild1,
          });
          let dstToken = getToken(lzChainIdChild1);
          await dstToken.grantRole(BANNED, l33tHaxx0r.address);

          // testCase.debug = true;
          await testCase.sendCrossChain(hodler1);
          // testCase.debug = false;
        });

        this.afterAll(async function () {
          let dstToken = getToken(lzChainIdChild1);
          await dstToken.revokeRole(BANNED, l33tHaxx0r.address);
          await postTestTeardown();
        });

        testCase.crossChainFailedAtRemoteTunnel(
          true,
          false,
          "AccessControl: banned"
        );
      }); // When send fails due to revert on remote side
    }); //Sending across chains
  }

  if (testRetry) {
    describe("Retrying failed transactions", function () {
      const testCase2: LayerZeroTestCase = new LayerZeroTestCase({
        fromAddress: hardhat.ethers.constants.AddressZero,
        srcChainId: 0,
        dstChainId: 0,
      });
      const testCase3: LayerZeroTestCase = new LayerZeroTestCase({
        fromAddress: hardhat.ethers.constants.AddressZero,
        srcChainId: 0,
        dstChainId: 0,
      });

      async function runTransaction(
        tc: LayerZeroTestCase,
        user: SignerWithAddress
      ): Promise<ContractReceipt | null> {
        // console.log(`Sending from ${user.address} to child chain`);
        await LayerZeroTestCase.sendToChildChain(
          {
            fromAddress: contractOwner.address,
            toAddress: user.address,
            srcChainId: normalChainIdMain,
            dstChainId: normalChainIdChild2,
            sendAmount: hardhat.ethers.utils.parseUnits("250", 18),
          },
          contractOwner
        );

        // console.log("Creating test case");
        tc.reinit({
          fromAddress: user.address,
          toAddress: user.address,
          srcChainId: normalChainIdChild2,
          dstChainId: normalChainIdMain,
        });
        try {
          // console.log(`Sending from ${user.address} to main chain`);
          return tc.sendCrossChain(user);
        } catch (e) {
          // console.log("Caught error ", e);
          return null;
        }
      }

      if (retryFilter.testRetryOnEndpoint) {
        describe("Retrying after 'PayloadStored'", function () {
          let payloadStoredEvent: Result;

          function getPayloadStoredEvent(receipt: ContractReceipt): Result {
            let e = getEventFromReceipt(receipt, PayloadStored);
            let result = e?.args as Result;
            expect(result).is.not.null;
            expect(result).is.not.undefined;
            return result;
          }

          async function setupRecoverableFailure(user: SignerWithAddress) {
            await getEndpoint(lzChainIdMain).blockNextMessage();
            let receipt = await runTransaction(testCase, user);
            expect(!!receipt).to.be.true;
            payloadStoredEvent = getPayloadStoredEvent(
              receipt as ContractReceipt
            );

            // console.log(
            //   `In Test: Checking stored payload for ${payloadStoredEvent.srcChainId}, ${payloadStoredEvent.srcAddress}`
            // );
          }

          async function setupUnrecoverableFailure() {
            testCase.reinit({
              fromAddress: l33tHaxx0r.address,
              toAddress: l33tHaxx0r.address,
              srcChainId: normalChainIdChild2,
              dstChainId: normalChainIdMain,
            });

            testCase.srcToken = spoofToken;
            testCase.srcTunnel = spoofTunnel;

            let receipt = await testCase.sendCrossChain(l33tHaxx0r);
            payloadStoredEvent = getPayloadStoredEvent(receipt);

            // console.log(
            //   `In Test: Checking stored payload for ${payloadStoredEvent.srcChainId}, ${payloadStoredEvent.srcAddress}`
            // );
          }

          async function payloadStoredTeardown() {
            testCase2.reset();
            testCase3.reset();
            payloadStoredEvent = undefined as unknown as Result;
            await postTestTeardown();
          }

          context("When 'PayloadStored' is emitted", function () {
            this.beforeAll(async function () {
              await preTestSetup();
              await setupRecoverableFailure(hodler1);
              await runTransaction(testCase2, hodler2);
              await runTransaction(testCase3, hodler3);
            });

            this.afterAll(payloadStoredTeardown);

            context("When examining the current state", function () {
              testCase.crossChainFailedAtRemoteEndpoint(false, true, "BLOCKED");

              it("The endpoint reports a stored payload", async function () {
                let endpoint = getEndpoint(lzChainIdMain);
                expect(
                  await endpoint.hasStoredPayload(
                    payloadStoredEvent.srcChainId as BigNumberish,
                    payloadStoredEvent.srcAddress as BytesLike
                  )
                ).to.be.true;
              });
            });

            context(
              "When additional transactions are sent to this tunnel",
              function () {
                testCase2.sendFromWasSuccessful(false, true);
                testCase2.receiveFailed(true);
              }
            );
          }); // When examining the current state

          context(
            "When calling retryPayload() for a non-existent payload",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();

                testCase.reinit({
                  fromAddress: l33tHaxx0r.address,
                  toAddress: l33tHaxx0r.address,
                  srcChainId: normalChainIdChild2,
                  dstChainId: normalChainIdMain,
                });
              });

              this.afterAll(payloadStoredTeardown);

              it("The error is 'LayerZero: no stored payload'", async function () {
                let endpoint = getEndpoint(lzChainIdMain);
                await expect(
                  endpoint.retryPayload(
                    lzChainIdChild2,
                    testCase.dstPath,
                    testCase.getPayload(l33tHaxx0r)
                  )
                ).to.be.revertedWith("LayerZero: no stored payload");
              });
            }
          ); // retryPayload() non-existent payload

          context(
            "When calling retryPayload() with a bad payload",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();
                await setupRecoverableFailure(l33tHaxx0r);
                await runTransaction(testCase2, hodler2);
                await runTransaction(testCase3, hodler3);
              });

              this.afterAll(payloadStoredTeardown);

              it("The error is 'LayerZero: invalid payload'", async function () {
                let endpoint = getEndpoint(lzChainIdMain);
                let fakePayload = LayerZeroTestCase.createPayload(
                  {
                    fromAddress: l33tHaxx0r.address,
                    toAddress: l33tHaxx0r.address,
                    srcChainId: normalChainIdChild2,
                    dstChainId: normalChainIdMain,
                    sendAmount: hardhat.ethers.utils.parseUnits("10000", 18),
                  },
                  l33tHaxx0r
                );

                await expect(
                  endpoint.retryPayload(
                    lzChainIdChild2,
                    testCase.dstPath,
                    fakePayload
                  )
                ).to.be.revertedWith("LayerZero: invalid payload");
              });
            }
          ); // retryPayload() bad payload

          context(
            "When calling retryPayload() before fixing the issue",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();
                await setupUnrecoverableFailure();
              });

              this.afterAll(payloadStoredTeardown);

              it("it reverts with the orginal error message", async function () {
                let endpoint = getEndpoint(lzChainIdMain);
                await expect(
                  endpoint.retryPayload(
                    payloadStoredEvent.srcChainId,
                    payloadStoredEvent.srcAddress,
                    payloadStoredEvent.payload
                  )
                ).to.be.revertedWith("LzApp: invalid source sending contract");
              });
            }
          ); //  retryPayload() before fixing

          context(
            "When calling retryPayload() after fixing the issue",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();
                await setupRecoverableFailure(hodler1);
                // let endpoint = getEndpoint(lzChainIdMain);
                await runTransaction(testCase2, hodler2);
                await runTransaction(testCase3, hodler3);

                let savedNonces = [
                  testCase.actualState.outboundNonce,
                  testCase2.actualState.outboundNonce,
                  testCase3.actualState.outboundNonce,
                ];

                await testCase.callRetryPayload();
                await testCase2.retryQueuedMessage();
                await testCase3.retryQueuedMessage();

                (await testCase.expectedState).inboundNonce = savedNonces[0];
                (await testCase2.expectedState).inboundNonce = savedNonces[1];
                (await testCase3.expectedState).inboundNonce = savedNonces[2];
              });

              this.afterAll(payloadStoredTeardown);

              context("Checking the blocking transaction", function () {
                testCase.retryPayloadSuccessful(true);
              });

              context("Checking the first queued transaction", function () {
                testCase2.lzReceiveWasSuccessful(true);
              });

              context("Checking the second queued transaction", function () {
                testCase3.lzReceiveWasSuccessful(true);
              });
            }
          ); // retryPayload() after fixing

          context("When calling forceResumeReceive()", function () {
            context("From the tunnel contract", function () {
              context("As a user with admin privileges", function () {
                this.beforeAll(async function () {
                  await preTestSetup();
                  await setupRecoverableFailure(hodler1);
                  await runTransaction(testCase2, hodler2);
                  await runTransaction(testCase3, hodler3);
                  await testCase.callForceResumeReceive(layerzeroAdmin);
                  await testCase2.retryQueuedMessage();
                  await testCase3.retryQueuedMessage();

                  (await testCase.expectedState).inboundNonce =
                    BigNumber.from(1);
                  (await testCase2.expectedState).inboundNonce =
                    BigNumber.from(2);
                  (await testCase3.expectedState).inboundNonce =
                    BigNumber.from(3);
                });

                this.afterAll(payloadStoredTeardown);

                context("Checking the blocking transaction", function () {
                  testCase.forceResumeReceiveSuccessful(false, false);
                });

                context("Checking the first queued transaction", function () {
                  testCase2.lzReceiveWasSuccessful(true);
                });

                context("Checking the second queued transaction", function () {
                  testCase3.lzReceiveWasSuccessful(true);
                });
              }); // As a user with admin privileges

              context("When there is no blocked message", function () {
                this.beforeAll(async function () {
                  await preTestSetup();
                  await runTransaction(testCase, hodler1);
                });

                this.afterAll(payloadStoredTeardown);

                it("The error is 'LayerZero: no stored payload'", async function () {
                  await expect(
                    testCase.callForceResumeReceive(layerzeroAdmin)
                  ).to.be.revertedWith("LayerZero: no stored payload");
                });
              }); // forceResumeReceive when not blocked
            }); // forceResumeReceive as tunnel

            context("As a regular user", function () {
              this.beforeAll(async function () {
                await preTestSetup();
                await setupRecoverableFailure(hodler1);
              });

              this.afterAll(payloadStoredTeardown);

              it("The error is 'LayerZero: invalid caller'", async function () {
                let endpoint = getEndpoint(getLzChainId(testCase.dstChainId));

                await expect(
                  endpoint
                    .connect(l33tHaxx0r)
                    .forceResumeReceive(
                      getLzChainId(testCase.srcChainId),
                      testCase.dstPath
                    )
                ).to.be.revertedWith("LayerZero: invalid caller");
              });
            }); // forceResumeReceive as user
          }); // forceResumeReceive()
        }); // Retrying after 'PayloadStored'
      }

      if (retryFilter.testRetryOnTunnel) {
        describe("Retrying after 'MessageFailed'", function () {
          let messageFailedEvent: Result;

          function getMessageFailedEvent(receipt: ContractReceipt): Result {
            let e = getEventFromReceipt(receipt, MessageFailed);
            let result = e?.args as Result;
            expect(result).is.not.null;
            expect(result).is.not.undefined;
            return result;
          }

          async function runFailTransaction() {
            let dstToken = getToken(normalChainIdMain);
            dstToken.grantRole(BANNED, l33tHaxx0r.address);
            let receipt = await runTransaction(testCase, l33tHaxx0r);
            expect(!!receipt).to.be.true;
            messageFailedEvent = getMessageFailedEvent(
              receipt as ContractReceipt
            );
          }

          async function clearFailure() {
            await getToken(normalChainIdMain).revokeRole(
              BANNED,
              l33tHaxx0r.address
            );
          }

          async function messageFailedTeardown() {
            testCase2.reset();
            testCase3.reset();
            messageFailedEvent = undefined as unknown as Result;
            await postTestTeardown();
          }

          context("When 'MessageFailed' is emitted", function () {
            this.beforeAll(async function () {
              await preTestSetup();
              await runFailTransaction();
              await runTransaction(testCase2, hodler2);
            });

            this.afterAll(messageFailedTeardown);

            context("When examining the current state", function () {
              testCase.crossChainFailedAtRemoteTunnel(
                false,
                true,
                "AccessControl: banned"
              );

              it("failedMessageLookup returns a payload hash", async function () {
                let failedMessage = await testCase.dstTunnel.failedMessages(
                  messageFailedEvent.srcChainId,
                  messageFailedEvent.srcAddress,
                  messageFailedEvent.nonce
                );
                expect(failedMessage).to.not.equal(
                  "0x0000000000000000000000000000000000000000000000000000000000000000"
                );
              });
            }); // When examining the current state
            context(
              "Additional transactions are sent to this tunnel are NOT blocked",
              function () {
                testCase2.sendFromWasSuccessful(false, false);
                testCase2.lzReceiveWasSuccessful(true, false);
              }
            ); // When additional transactions are sent to this tunnel
          }); // When 'MessageFailed' is emitted

          context(
            "When calling retryMessage() for a non-existent payload",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();
                await runTransaction(testCase, hodler1);
              });

              this.afterAll(messageFailedTeardown);

              it("failedMessageLookup returns empty bytes32", async function () {
                let failedMessage = await testCase.dstTunnel.failedMessages(
                  getLzChainId(testCase.srcChainId),
                  testCase.dstPath,
                  testCase.actualState.inboundNonce
                );
                expect(failedMessage).to.equal(
                  "0x0000000000000000000000000000000000000000000000000000000000000000"
                );
              });

              it("The error is 'LzApp: no stored message'", async function () {
                await expect(
                  testCase.dstTunnel.retryMessage(
                    getLzChainId(testCase.srcChainId),
                    testCase.dstPath,
                    testCase.actualState.inboundNonce,
                    testCase.payload
                  )
                ).to.be.revertedWith("LzApp: no stored message");
              });
            }
          ); // retryMessage() non-existent payload

          context(
            "When calling retryMessage() with a bad payload",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();
                await runFailTransaction();
                await clearFailure();
              });

              this.afterAll(messageFailedTeardown);

              it("The error is 'LzApp: invalid payload'", async function () {
                let fakePayload = LayerZeroTestCase.createPayload(
                  {
                    fromAddress: testCase.fromAddress,
                    toAddress: testCase.toAddress,
                    srcChainId: testCase.srcChainId,
                    dstChainId: testCase.dstChainId,
                    sendAmount: testCase.sendAmount.mul(100),
                  },
                  l33tHaxx0r
                );
                await expect(
                  testCase.callRetryMessage(
                    messageFailedEvent.nonce,
                    fakePayload
                  )
                ).to.be.revertedWith("LzApp: invalid payload");
              });
            }
          ); // retryMessage() bad payload

          context(
            "When calling retryMessage() before fixing the issue",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();
                await runFailTransaction();
              });

              this.afterAll(messageFailedTeardown);

              it("It reverts with the original error message", async function () {
                await expect(
                  testCase.callRetryMessage(messageFailedEvent.nonce)
                ).to.be.revertedWith("AccessControl: banned");
              });
            }
          ); //  retryMessage() before fixing

          context(
            "When calling retryMessage() after fixing the issue",
            function () {
              this.beforeAll(async function () {
                await preTestSetup();
                await runFailTransaction();
                await clearFailure();
                testCase.callRetryMessage(messageFailedEvent.nonce);
                (await testCase.expectedState).inboundNonce =
                  messageFailedEvent.nonce;
              });

              this.afterAll(messageFailedTeardown);

              testCase.retryMessageSuccessful(true);
            }
          ); // retryMessage() after fixing
        }); // Retrying after 'MessageFailed'
      }
    }); // Retrying failed transactions
  }
});
