import invariant from "tiny-invariant";
import hardhat from "hardhat";
import {
  FPValidator,
  FPValidator__factory,
  LZEndpointMock,
  LZEndpointMock__factory,
  LayerZeroOracleMockV2,
  LayerZeroOracleMockV2__factory,
  LayerZeroTokenMock,
  LayerZeroTokenMock__factory,
  NonceContract,
  NonceContract__factory,
  RelayerV2,
  RelayerV2__factory,
  TreasuryV2,
  TreasuryV2__factory,
  MockUltraLightNodeV2,
  MockUltraLightNodeV2__factory,
} from "../../typechain-types";
import {
  BigNumber,
  ContractReceipt,
  ContractTransaction,
  ethers,
} from "ethers";
// import Web3 from "web3";
import { ContractABI, EventABI, getEventFromReceipt } from "../helper";
import { Result } from "ethers/lib/utils";

// const w3 = new Web3();

export type SendFunction = () => Promise<ContractTransaction>;

export class CrossChainPayload {
  nonce: number;
  localChainId: number;
  ua: string;
  dstChainId: number;
  dstAddress: string;
  payload: string;

  public static decode(payload: string): CrossChainPayload {
    return new CrossChainPayload(
      parseInt(payload.substring(2, 18), 16),
      parseInt(payload.substring(18, 22), 16),
      "0x" + payload.substring(22, 62),
      parseInt(payload.substring(62, 66), 16),
      "0x" + payload.substring(66, 106),
      "0x" + payload.substring(106)
    );
  }

  public constructor(
    nonce: number,
    localChainId: number,
    ua: string,
    dstChainId: number,
    dstAddress: string,
    payload: string
  ) {
    this.nonce = nonce;
    this.localChainId = localChainId;
    this.ua = ua;
    this.dstChainId = dstChainId;
    this.dstAddress = dstAddress;
    this.payload = payload;
  }

  public encode(): string {
    let data = ethers.utils.solidityPack(
      ["uint64", "uint16", "address", "uint16", "address", "bytes"],
      [
        this.nonce,
        this.localChainId,
        this.ua,
        this.dstChainId,
        this.dstAddress,
        this.payload,
      ]
    );

    return data;
    // return ethers.utils.defaultAbiCoder.encode(["bytes"], [data]);
  }
}

export class TransactionProof {
  sourceNode: string;
  nonce: number;
  sourceChain: number;
  sourceUserApp: string;
  destChain: number;
  destUserApp: string;
  payload: string;

  public static decode(transactionProof: string): TransactionProof {
    return new TransactionProof(
      "0x" + transactionProof.substring(26, 66),
      parseInt(transactionProof.substring(66, 82), 16),
      parseInt(transactionProof.substring(82, 86), 16),
      "0x" + transactionProof.substring(86, 126),
      parseInt(transactionProof.substring(126, 130), 16),
      "0x" + transactionProof.substring(130, 170),
      "0x" + transactionProof.substring(170)
    );
  }

  public constructor(
    sourceNode: string,
    nonce: number,
    sourceChain: number,
    sourceUserApp: string,
    destChain: number,
    destUserApp: string,
    payload: string
  ) {
    this.sourceNode = sourceNode;
    this.nonce = nonce;
    this.sourceChain = sourceChain;
    this.sourceUserApp = sourceUserApp;
    this.destChain = destChain;
    this.destUserApp = destUserApp;
    this.payload = payload;
  }

  public encode(): string {
    let sourceULN = addressToBytes32(this.sourceNode);
    return ethers.utils.solidityPack(
      ["bytes32", "uint64", "uint16", "address", "uint16", "address", "bytes"],
      [
        sourceULN,
        this.nonce,
        this.sourceChain,
        this.sourceUserApp,
        this.destChain,
        this.destUserApp,
        this.payload,
      ]
    );
  }

  public blockHash(): string {
    return ethers.utils.keccak256(this.encode());
  }
}

export function buildPath(you: string, me: string): string {
  return ethers.utils.solidityPack(["address", "address"], [you, me]);
}

export function addressToBytes32(address: string): string {
  return ethers.utils.defaultAbiCoder.encode(
    ["bytes32"],
    [ethers.utils.defaultAbiCoder.encode(["uint160"], [address.toLowerCase()])]
  );
}

export function bytes32ToAddress(addressBytes: string): string {
  return addressBytes.substring(26);
}

interface LayerZeroFactoryArgs {
  endpointFactory: Promise<LZEndpointMock__factory>;
  nonceFactory: Promise<NonceContract__factory>;
  relayerFactory: Promise<RelayerV2__factory>;
  nodeFactory: Promise<MockUltraLightNodeV2__factory>;
  oracleFactory: Promise<LayerZeroOracleMockV2__factory>;
  tokenFactory: Promise<LayerZeroTokenMock__factory>;
  treasuryFactory: Promise<TreasuryV2__factory>;
  validatorFactory: Promise<FPValidator__factory>;
}

let factoryArgs: LayerZeroFactoryArgs = {
  endpointFactory: hardhat.ethers.getContractFactory("LZEndpointMock"),
  nonceFactory: hardhat.ethers.getContractFactory("NonceContract"),
  relayerFactory: hardhat.ethers.getContractFactory("RelayerV2"),
  nodeFactory: hardhat.ethers.getContractFactory("MockUltraLightNodeV2"),
  oracleFactory: hardhat.ethers.getContractFactory("LayerZeroOracleMockV2"),
  tokenFactory: hardhat.ethers.getContractFactory("LayerZeroTokenMock"),
  treasuryFactory: hardhat.ethers.getContractFactory("TreasuryV2"),
  validatorFactory: hardhat.ethers.getContractFactory("FPValidator"),
};

export class LayerZeroFactory {
  public readonly endpointFactory: Promise<LZEndpointMock__factory>;
  public readonly nonceFactory: Promise<NonceContract__factory>;
  public readonly relayerFactory: Promise<RelayerV2__factory>;
  public readonly nodeFactory: Promise<MockUltraLightNodeV2__factory>;
  public readonly oracleFactory: Promise<LayerZeroOracleMockV2__factory>;
  public readonly tokenFactory: Promise<LayerZeroTokenMock__factory>;
  public readonly treasuryFactory: Promise<TreasuryV2__factory>;
  public readonly validatorFactory: Promise<FPValidator__factory>;
  _validator?: FPValidator;

  public constructor(factoryArgs: LayerZeroFactoryArgs) {
    this.endpointFactory = factoryArgs.endpointFactory;
    this.nonceFactory = factoryArgs.nonceFactory;
    this.relayerFactory = factoryArgs.relayerFactory;
    this.nodeFactory = factoryArgs.nodeFactory;
    this.oracleFactory = factoryArgs.oracleFactory;
    this.tokenFactory = factoryArgs.tokenFactory;
    this.treasuryFactory = factoryArgs.treasuryFactory;
    this.validatorFactory = factoryArgs.validatorFactory;
  }

  public async buildEndpoint(lzChainId: number): Promise<LZEndpointMock> {
    return (await this.endpointFactory).deploy(lzChainId);
  }

  public async buildNonceContract(endpoint: string): Promise<NonceContract> {
    return (await this.nonceFactory).deploy(endpoint);
  }

  public async buildUltralightNode(
    endpoint: string,
    nonceContract: string,
    lzChainId: number
  ): Promise<MockUltraLightNodeV2> {
    return (await this.nodeFactory).deploy(endpoint, nonceContract, lzChainId);
  }

  public async buildRelayer(ulnAddress: string): Promise<RelayerV2> {
    return (await this.relayerFactory).deploy(ulnAddress);
  }

  public async buildTreasury(ulnAddress: string): Promise<TreasuryV2> {
    return (await this.treasuryFactory).deploy(ulnAddress);
  }

  public async buildOracle(ulnAddress: string): Promise<LayerZeroOracleMockV2> {
    let oracle = await (await this.oracleFactory).deploy(ulnAddress);
    return oracle;
  }

  public async buildToken(): Promise<LayerZeroTokenMock> {
    return (await this.tokenFactory).deploy();
  }

  public get validator(): Promise<FPValidator> {
    return (async () => {
      if (!this._validator) {
        this._validator = await (
          await this.validatorFactory
        ).deploy(
          hardhat.ethers.constants.AddressZero,
          hardhat.ethers.constants.AddressZero
        );
      }
      return this._validator;
    })();
  }
}

export const LAYER_ZERO_FACTORY = new LayerZeroFactory(factoryArgs);

interface LayerZeroServices {
  endpoint: LZEndpointMock;
  relayer: RelayerV2;
  ulnNode: MockUltraLightNodeV2;
  oracle: LayerZeroOracleMockV2;
  treasury: TreasuryV2;
  validator: FPValidator;
}

export class LayerZeroService {
  public readonly lzChainId: number;
  public readonly feeRecipient: string;
  services: LayerZeroServices;
  queuedMessages: Map<string, TransactionProof[]> = new Map();

  public constructor(
    lzChainId: number,
    feeRecipient: string,
    services: LayerZeroServices
  ) {
    this.lzChainId = lzChainId;
    this.feeRecipient = feeRecipient;
    this.services = services;
  }

  public get endpoint(): LZEndpointMock {
    return this.services.endpoint;
  }

  public get relayer(): RelayerV2 {
    return this.services.relayer;
  }

  public get treasury(): TreasuryV2 {
    return this.services.treasury;
  }

  public get ulnNode(): MockUltraLightNodeV2 {
    return this.services.ulnNode;
  }

  public get oracle(): LayerZeroOracleMockV2 {
    return this.services.oracle;
  }

  public get validator(): FPValidator {
    return this.services.validator;
  }

  public async receiveMessage(
    proof: TransactionProof
  ): Promise<ContractReceipt | null> {
    let path = buildPath(proof.sourceUserApp, proof.destUserApp);
    // console.log(
    //   `In Fixture: Checking stored payload for ${proof.sourceChain}, ${path}`
    // );
    if (await this.endpoint.hasStoredPayload(proof.sourceChain, path)) {
      this.getMessageQueue(path).push(proof);
      return null;
    } else {
      return this._doReceive(proof);
    }
  }

  public async retryNextQueuedMessage(path: string): Promise<ContractReceipt> {
    let queue = this.getMessageQueue(path);
    invariant(queue.length > 0, "NO MESSAGES");

    let result = await this._doReceive(queue[0]);
    queue.shift();
    return result;
  }

  public clearQueue() {
    this.queuedMessages.clear();
  }

  protected async _doReceive(
    proof: TransactionProof
  ): Promise<ContractReceipt> {
    let blockHash = proof.blockHash();

    let tx = await this.services.relayer.validateTransactionProofV2(
      proof.sourceChain,
      proof.destUserApp,
      450000,
      blockHash,
      blockHash,
      proof.encode(),
      this.feeRecipient
    );
    return await tx.wait();
  }

  protected getMessageQueue(path: string): TransactionProof[] {
    if (!this.queuedMessages.has(path)) {
      let messageQueue: TransactionProof[] = [];
      this.queuedMessages.set(path, messageQueue);
      return messageQueue;
    }

    return this.queuedMessages.get(path) as TransactionProof[];
  }
}

export class LayerZeroEcosystem {
  services: Map<number, LayerZeroService> = new Map();
  _packetEventAbi?: EventABI;
  _hashEventAbi?: EventABI;

  public get packetEventAbi(): Promise<EventABI> {
    return (async () => {
      if (this._packetEventAbi) {
        return this._packetEventAbi;
      }

      let ulnAbi = new ContractABI(
        (await LAYER_ZERO_FACTORY.nodeFactory).interface
      );
      this._packetEventAbi = ulnAbi.eventsBySignature.get(
        "Packet(bytes)"
      ) as EventABI;
      return this._packetEventAbi;
    })();
  }

  public get hashEventAbi(): Promise<EventABI> {
    return (async () => {
      if (this._hashEventAbi) {
        return this._hashEventAbi;
      }

      let ulnAbi = new ContractABI(
        (await LAYER_ZERO_FACTORY.nodeFactory).interface
      );
      this._hashEventAbi = ulnAbi.eventsBySignature.get(
        "HashReceived(uint16,address,bytes32,bytes32,uint256)"
      ) as EventABI;
      return this._hashEventAbi;
    })();
  }

  public async createServiceForChain(
    lzChainId: number,
    feeRecipient: string
  ): Promise<LayerZeroService> {
    invariant(!this.getService(lzChainId), "ALREADY CREATED");

    let endpoint = await LAYER_ZERO_FACTORY.buildEndpoint(lzChainId);
    let nonceContract = await LAYER_ZERO_FACTORY.buildNonceContract(
      endpoint.address
    );
    let ulnNode = await LAYER_ZERO_FACTORY.buildUltralightNode(
      endpoint.address,
      nonceContract.address,
      lzChainId
    );
    let relayer = await LAYER_ZERO_FACTORY.buildRelayer(ulnNode.address);
    let treasury = await LAYER_ZERO_FACTORY.buildTreasury(ulnNode.address);
    let oracle = await LAYER_ZERO_FACTORY.buildOracle(ulnNode.address);

    let services: LayerZeroServices = {
      endpoint: endpoint,
      relayer: relayer,
      treasury: treasury,
      ulnNode: ulnNode,
      oracle: oracle,
      validator: await LAYER_ZERO_FACTORY.validator,
    };
    let service = new LayerZeroService(lzChainId, feeRecipient, services);
    await this.initialize(service);
    this.services.set(lzChainId, service);
    return service;
  }

  public getService(lzChainId: number): LayerZeroService | undefined {
    return this.services.get(lzChainId);
  }

  public async sendMessage(
    srcAddress: string,
    f: SendFunction
  ): Promise<ContractReceipt> {
    let tx = await f();
    let userAgentReceipt = await tx.wait();
    userAgentReceipt.events = userAgentReceipt.events ?? [];

    let proof = await this.buildTransactionProofFromReceipt(
      srcAddress,
      userAgentReceipt
    );
    let confirmReceipt = await this.reportConfirmations(proof, 1);
    confirmReceipt.events = confirmReceipt.events ?? [];

    let deliverReceipt = await this.routePacket(proof);
    let receiptToReturn: ContractReceipt;
    if (deliverReceipt) {
      receiptToReturn = deliverReceipt;
      receiptToReturn.events = receiptToReturn.events ?? [];
      receiptToReturn.events.push(...confirmReceipt.events);
      receiptToReturn.logs.push(...confirmReceipt.logs);
    } else {
      receiptToReturn = confirmReceipt;
      receiptToReturn.events = receiptToReturn.events ?? [];
    }

    // combine all events and logs for inspection
    receiptToReturn.events.push(...userAgentReceipt.events);
    receiptToReturn.logs.push(...userAgentReceipt.logs);
    return receiptToReturn;
  }

  public async getPacketEvent(
    receipt: ContractReceipt
  ): Promise<Result | null> {
    let packetEventAbi = await this.packetEventAbi;
    return getEventFromReceipt(receipt, packetEventAbi)?.args as Result;
  }

  public async buildTransactionProofFromPayload(
    srcAddress: string,
    decodedPayload: CrossChainPayload
  ): Promise<TransactionProof> {
    let srcService = this.services.get(
      decodedPayload.localChainId
    ) as LayerZeroService;
    invariant(srcService, "SRC CHAIN");

    let dstService = this.services.get(
      decodedPayload.dstChainId
    ) as LayerZeroService;
    invariant(dstService, "DEST CHAIN");

    return new TransactionProof(
      srcService.ulnNode.address,
      decodedPayload.nonce,
      decodedPayload.localChainId,
      srcAddress,
      decodedPayload.dstChainId,
      decodedPayload.dstAddress,
      decodedPayload.payload
    );
  }

  public async buildTransactionProofFromReceipt(
    srcAddress: string,
    receipt: ContractReceipt
  ): Promise<TransactionProof> {
    let packetEvent = (await this.getPacketEvent(receipt)) as Result;
    invariant(packetEvent, "NO PACKET");

    let payload = packetEvent.payload as string;
    let decodedPayload = CrossChainPayload.decode(payload);
    let srcService = this.services.get(
      decodedPayload.localChainId
    ) as LayerZeroService;
    invariant(srcService, "SRC CHAIN");

    return this.buildTransactionProofFromPayload(srcAddress, decodedPayload);
  }

  public async reportConfirmations(
    proof: TransactionProof,
    confirmations: number
  ): Promise<ContractReceipt> {
    let dstService = this.services.get(proof.destChain) as LayerZeroService;
    invariant(dstService, "DEST CHAIN");

    let blockHash = proof.blockHash();
    let tx = await dstService.oracle.updateHash(
      proof.sourceChain,
      blockHash,
      confirmations,
      blockHash
    );
    return tx.wait();
  }

  public async routePacket(
    proof: TransactionProof
  ): Promise<ContractReceipt | null> {
    let dstService = this.services.get(proof.destChain) as LayerZeroService;
    invariant(dstService, "DEST CHAIN");

    return dstService.receiveMessage(proof);
  }

  protected async initialize(service: LayerZeroService) {
    await service.endpoint.newVersion(service.ulnNode.address);
    let latestVersion = service.endpoint.latestVersion();
    await service.endpoint.setDefaultSendVersion(latestVersion);
    await service.endpoint.setDefaultReceiveVersion(latestVersion);

    let layerZeroToken = await LAYER_ZERO_FACTORY.buildToken();
    await service.ulnNode.setTreasury(service.treasury.address);
    await service.ulnNode.setLayerZeroToken(layerZeroToken.address);
    await service.ulnNode.setDefaultRelayer(service.relayer.address);
    await service.ulnNode.setDefaultOracle(service.oracle.address);
    await service.ulnNode.setDefaultValidator(service.validator.address);

    for (let otherService of this.services.values()) {
      await this.connect(service, otherService);
      await this.connect(otherService, service);
    }
  }

  protected async connect(
    fromService: LayerZeroService,
    toService: LayerZeroService
  ) {
    await fromService.ulnNode.connectChain(
      toService.lzChainId,
      toService.ulnNode.address,
      1
    );

    await fromService.ulnNode.setDefaultAdapterParamsForChainId(
      toService.lzChainId,
      1,
      "0x00010000000000000000000000000000000000000000000000000000000000030d40"
    );

    await fromService.relayer.setDstPrice(
      toService.lzChainId,
      BigNumber.from("100000000000000000001"),
      BigNumber.from("105")
    );

    await fromService.relayer.setDstConfig(
      toService.lzChainId,
      1,
      BigNumber.from("420000000000000000"),
      120000,
      16
    );
  }
}
