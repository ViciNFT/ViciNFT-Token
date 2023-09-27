import { expect } from "chai";
import {
  CrossChainPayload,
  LAYER_ZERO_FACTORY,
  LayerZeroEcosystem,
  LayerZeroService,
  TransactionProof,
  addressToBytes32,
} from "./lz_fixtures";
import hardhat from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  ILayerZeroUltraLightNodeV2,
  OmniCounter,
  OmniCounter__factory,
} from "../../typechain-types";
import { BigNumber, ContractReceipt, ethers } from "ethers";
import { Result } from "ethers/lib/utils";
import { ContractABI, EventABI, expectEvent } from "../helper";
import { LayerZeroPacket } from "../../typechain-types/contracts/bridging/layerzero/mock/interfaces/ILayerZeroValidationLibrary";

describe("LayerZero Fixtures Test", function () {
  let signers: SignerWithAddress[];
  let contractOwner: SignerWithAddress;

  this.beforeAll(async function () {
    signers = await hardhat.ethers.getSigners();
    contractOwner = signers[0];
  });

  describe("Encoding/Decoding Tests", function () {
    context("When decoding a `Packet` event", function () {
      const packetBytes =
        "0x" +
        "00000000000042c8006e6694340fc020c5e6b96567843da2df01b2ce1eb600b8" +
        "e3b53af74a4bf62ae5511055290838050bf764df000000000000000000000000" +
        "0000000000000000000000000000000000000040000000000000000000000000" +
        "000000000000000000000000018212ca0bbde000000000000000000000000000" +
        "0000000000000000000000000000000000000014ea9f87cc508275e6b8b9464a" +
        "4e5118d6548445e6000000000000000000000000000000000000000000000000";
      let crossChainPayload: CrossChainPayload;

      this.beforeAll(async function () {
        crossChainPayload = CrossChainPayload.decode(packetBytes);
      });

      it("Correctly decodes the nonce", async function () {
        expect(crossChainPayload.nonce).to.equal(17096);
      });

      it("Correctly decodes the localChainId", async function () {
        expect(crossChainPayload.localChainId).to.equal(110);
      });

      it("Correctly decodes the user app address", async function () {
        expect(crossChainPayload.ua).to.equal(
          "0x6694340fc020c5e6b96567843da2df01b2ce1eb6"
        );
      });

      it("Correctly decodes the dstChainId", async function () {
        expect(crossChainPayload.dstChainId).to.equal(184);
      });

      it("Correctly decodes the remote user app address", async function () {
        expect(crossChainPayload.dstAddress).to.equal(
          "0xe3b53af74a4bf62ae5511055290838050bf764df"
        );
      });

      it("Correctly decodes the payload", async function () {
        expect(crossChainPayload.payload).to.equal(
          "0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000018212ca0bbde0000000000000000000000000000000000000000000000000000000000000000014ea9f87cc508275e6b8b9464a4e5118d6548445e6000000000000000000000000000000000000000000000000"
        );
      });

      it("Round trip decode/reencode/redecode produces the same payload", async function () {
        let reencoded = crossChainPayload.encode();
        let redecoded = CrossChainPayload.decode(reencoded);
        expect(redecoded).to.deep.equal(crossChainPayload);
      });
    }); // When decoding a `Packet` event

    context("When decoding a transaction proof", function () {
      const proofBytes =
        "0x" +
        "0000000000000000000000004d73adb72bc3dd368966edd0f0b2148401a178e2" +
        "0000000000174af6006e352d8275aae3e0c2404d9f68f6cee084b5beb3dd006d" +
        "9d1b1669c73b033dfe47ae5a0164ab96df25b944000000000000000000000000" +
        "0000000000000000000000000000000000000001000000000000000000000000" +
        "0000000000000000000000000000000000000002000000000000000000000000" +
        "0000000000000000000000000000000000000002000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "000000000000000000000000000002ca4fccf90a000000000000000000000000" +
        "000000000000000000000000000000000adeb87f000000000000000000000000" +
        "0000000000000000000000000000000000011606000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "000000000000000000000000000000000001abd8000000000000000000000000" +
        "000000000000000000000000000000000ae17a5d000000000000000000000000" +
        "00000000000000000000000000000000000001c0000000000000000000000000" +
        "0000000000000000000000000000000000000200000000000000000000000000" +
        "0000000000000000000000000000000000000014ca21316d431ea8b7d9092160" +
        "5f4a4ccb7733ddc0000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000";
      let transactionProof: TransactionProof;

      this.beforeAll(async function () {
        transactionProof = TransactionProof.decode(proofBytes);
      });

      it("Correctly decodes the source node", async function () {
        expect(transactionProof.sourceNode).to.equal(
          "0x4d73adb72bc3dd368966edd0f0b2148401a178e2"
        );
      });

      it("Correctly decodes the nonce", async function () {
        expect(transactionProof.nonce).to.equal(1526518);
      });

      it("Correctly decodes the source chain", async function () {
        expect(transactionProof.sourceChain).to.equal(110);
      });

      it("Correctly decodes the source user app", async function () {
        expect(transactionProof.sourceUserApp).to.equal(
          "0x352d8275aae3e0c2404d9f68f6cee084b5beb3dd"
        );
      });

      it("Correctly decodes the dest chain", async function () {
        expect(transactionProof.destChain).to.equal(109);
      });

      it("Correctly decodes the dest user app", async function () {
        expect(transactionProof.destUserApp).to.equal(
          "0x9d1b1669c73b033dfe47ae5a0164ab96df25b944"
        );
      });

      it("Correctly decodes the payload", async function () {
        expect(transactionProof.payload).to.equal(
          "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002ca4fccf90a000000000000000000000000000000000000000000000000000000000adeb87f000000000000000000000000000000000000000000000000000000000001160600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001abd8000000000000000000000000000000000000000000000000000000000ae17a5d00000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000014ca21316d431ea8b7d90921605f4a4ccb7733ddc00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
        );
      });

      it("Re-encodes to the same bytes", async function () {
        expect(transactionProof.encode()).to.equal(proofBytes);
      });

      it("Round trip decode/reencode/redecode produces the same proof", async function () {
        let reencoded = transactionProof.encode();
        let redecoded = TransactionProof.decode(reencoded);
        expect(redecoded).to.deep.equal(transactionProof);
      });
    });
  }); // Encoding/Decoding Tests

  describe("Setting up LayerZero services", function () {
    const lzChainId1 = 1;
    const lzChainId2 = 2;
    const lzChainId3 = 3;

    let lzEcoSystem: LayerZeroEcosystem = new LayerZeroEcosystem();

    function chainIsProperlyConfigured(lzChainId: number) {
      context("When examining the contracts", function () {
        let lzService: LayerZeroService;

        this.beforeAll(async function () {
          lzService = lzEcoSystem.getService(lzChainId) as LayerZeroService;
        });

        it("The service is stored in the ecosystem lookup map", async function () {
          expect(!!lzService).to.be.true;
        });

        it("The service was created", async function () {
          expect(!!lzService.endpoint).to.be.true;
        });

        it("The relayer bone's connected to the node bone", async function () {
          expect(await lzService.relayer.uln()).to.equal(
            lzService.ulnNode.address
          );
        });

        it("The node bone's connected to the end bone", async function () {
          expect(await lzService.ulnNode.endpoint()).to.equal(
            lzService.endpoint.address
          );
        });

        it("The oracle bone's connected to the node bone", async function () {
          expect(await lzService.oracle.uln()).to.equal(
            lzService.ulnNode.address
          );
        });

        it("The endpoint's default library versions are set", async function () {
          expect(await lzService.endpoint.defaultSendVersion()).to.equal(1);
          expect(await lzService.endpoint.defaultReceiveVersion()).to.equal(1);
        });

        it("The end bone's connected to the node bone", async function () {
          expect(await lzService.endpoint.defaultSendLibrary()).to.equal(
            lzService.ulnNode.address
          );
          expect(
            await lzService.endpoint.defaultReceiveLibraryAddress()
          ).to.equal(lzService.ulnNode.address);
        });
      });
    } // chainIsProperlyConfigured

    function chainsAreProperlyConnected(
      localChain: number,
      remoteChain: number
    ) {
      context(
        `When checking connections for chain ${remoteChain} on chain ${localChain}`,
        function () {
          let localService: LayerZeroService;
          let remoteService: LayerZeroService;
          let appConfig: ILayerZeroUltraLightNodeV2.ApplicationConfigurationStructOutput;

          this.beforeAll(async function () {
            localService = lzEcoSystem.getService(
              localChain
            ) as LayerZeroService;
            remoteService = lzEcoSystem.getService(
              remoteChain
            ) as LayerZeroService;
            appConfig = await localService.ulnNode.defaultAppConfig(
              remoteChain
            );
          });

          it(`Remote uln for chain ${remoteChain} is set`, async function () {
            expect(await localService.ulnNode.ulnLookup(remoteChain)).to.equal(
              addressToBytes32(remoteService.ulnNode.address)
            );
          });

          it(`Default adapter params are set for outgoing messages to chain ${remoteChain}`, async function () {
            expect(
              await localService.ulnNode.defaultAdapterParams(remoteChain, 1)
            ).to.equal(
              "0x00010000000000000000000000000000000000000000000000000000000000030d40"
            );
          });

          it(`Validator is configured for incoming messeages from chain ${remoteChain}`, async function () {
            let validator = await LAYER_ZERO_FACTORY.validator;
            expect(
              await localService.ulnNode.inboundProofLibrary(remoteChain, 1)
            ).to.equal(validator.address);
          });

          it(`Relayer is configured for incoming messeages from chain ${remoteChain}`, async function () {
            expect(appConfig.relayer).to.equal(localService.relayer.address);
          });

          it(`Oracle is configured for incoming messeages from chain ${remoteChain}`, async function () {
            expect(appConfig.oracle).to.equal(localService.oracle.address);
          });

          it(`Relayer parameters configured for outgoing messages to chain ${remoteChain}`, async function () {
            let dstConfig = await localService.relayer.dstConfigLookup(
              remoteChain,
              1
            );
            expect(dstConfig.gasPerByte).to.be.greaterThan(0);
          });

          it(`Relayer price configured for outgoing messages to chain ${remoteChain}`, async function () {
            let dstprice = await localService.relayer.dstPriceLookup(
              remoteChain
            );
            expect(dstprice.dstGasPriceInWei).to.be.greaterThan(0);
          });
        }
      );
    } // chainsAreProperlyConnected

    context("After contracts for one chain are deployed", function () {
      this.beforeAll(async function () {
        await lzEcoSystem.createServiceForChain(
          lzChainId1,
          contractOwner.address
        );
      });

      chainIsProperlyConfigured(lzChainId1);
    }); // With one chain

    context("After contracts for a second chain are deployed", function () {
      this.beforeAll(async function () {
        await lzEcoSystem.createServiceForChain(
          lzChainId2,
          contractOwner.address
        );
      });

      chainIsProperlyConfigured(lzChainId2);
      chainsAreProperlyConnected(lzChainId1, lzChainId2);
      chainsAreProperlyConnected(lzChainId2, lzChainId1);
    }); // With two chains

    context("After contracts for a third chain are deployed", function () {
      this.beforeAll(async function () {
        await lzEcoSystem.createServiceForChain(
          lzChainId3,
          contractOwner.address
        );
      });

      chainIsProperlyConfigured(lzChainId3);
      chainsAreProperlyConnected(lzChainId1, lzChainId3);
      chainsAreProperlyConnected(lzChainId3, lzChainId1);
      chainsAreProperlyConnected(lzChainId2, lzChainId3);
      chainsAreProperlyConnected(lzChainId3, lzChainId2);
    }); // With three chains
  }); // Setting up LayerZero services

  describe("Sending simple messages", function () {
    const lzChainId1 = 1;
    const lzChainId2 = 2;

    let lzEcoSystem: LayerZeroEcosystem;
    let chain1Service: LayerZeroService;
    let chain2Service: LayerZeroService;

    let omniCounterFactory: OmniCounter__factory;
    let counter1: OmniCounter;
    let counter2: OmniCounter;

    let HashReceived: EventABI;
    let PacketReceived: EventABI;

    async function setup() {
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

      omniCounterFactory = await hardhat.ethers.getContractFactory(
        "OmniCounter"
      );
      counter1 = await omniCounterFactory.deploy(endpoint1.address);
      counter2 = await omniCounterFactory.deploy(endpoint2.address);

      await counter1.setTrustedRemoteAddress(lzChainId2, counter2.address);
      await counter2.setTrustedRemoteAddress(lzChainId1, counter1.address);

      let ulnAbi = new ContractABI(chain2Service.ulnNode.interface);
      HashReceived = ulnAbi.eventsBySignature.get(
        "HashReceived(uint16,address,bytes32,bytes32,uint256)"
      ) as EventABI;
      PacketReceived = ulnAbi.eventsBySignature.get(
        "PacketReceived(uint16,bytes,address,uint64,bytes32)"
      ) as EventABI;
    } // setup

    async function cleanup() {
      lzEcoSystem = undefined as unknown as LayerZeroEcosystem;
      chain1Service = undefined as unknown as LayerZeroService;
      chain2Service = undefined as unknown as LayerZeroService;
      counter1 = undefined as unknown as OmniCounter;
      counter2 = undefined as unknown as OmniCounter;
    }

    context("Testing the individual components", function () {
      let expectedPayload: CrossChainPayload;
      let expectedProof: TransactionProof;
      let sendReceipt: ContractReceipt;
      let packetEvent: Result;
      let packet: LayerZeroPacket.PacketStructOutput;

      this.beforeAll(setup);
      this.afterAll(async function () {
        await cleanup();
        sendReceipt = undefined as unknown as ContractReceipt;
        packetEvent = undefined as unknown as Result;
      });

      function checkPacketEvent() {
        context("Examining the packet event", function () {
          this.beforeAll(async function () {
            packetEvent = (await lzEcoSystem.getPacketEvent(
              sendReceipt
            )) as Result;
          });

          it("A packet event is emitted", async function () {
            expect(!!packetEvent).to.be.true;
          });

          it("The packet event has the expected payload", async function () {
            expect(packetEvent.payload).to.equal(expectedPayload.encode());
          });

          it("The packet event has the expected values", async function () {
            expect(CrossChainPayload.decode(packetEvent.payload)).to.deep.equal(
              expectedPayload
            );
          });
        });
      } // checkPacketEvent

      function checkTransactionProof() {
        context("Examining the generated proof", function () {
          it("The transaction proof has the expected values", async function () {
            expect(
              await lzEcoSystem.buildTransactionProofFromReceipt(
                counter1.address,
                sendReceipt
              )
            ).to.deep.equal(expectedProof);
          });
        });
      } // checkTransactionProof

      context("When generating a dummy packet event", function () {
        const dummyNonce = 101;
        const dummyPayload = "0xdead";

        this.beforeAll(async function () {
          expectedPayload = new CrossChainPayload(
            dummyNonce,
            lzChainId1,
            counter1.address.toLowerCase(),
            lzChainId2,
            counter2.address.toLowerCase(),
            dummyPayload
          );

          expectedProof = new TransactionProof(
            chain1Service.ulnNode.address,
            expectedPayload.nonce,
            expectedPayload.localChainId,
            expectedPayload.ua,
            expectedPayload.dstChainId,
            expectedPayload.dstAddress,
            expectedPayload.payload
          );

          let tx = await chain1Service.ulnNode.emitArbitraryPacket(
            expectedPayload.nonce,
            expectedPayload.ua,
            expectedPayload.dstChainId,
            expectedPayload.dstAddress,
            expectedPayload.payload
          );
          sendReceipt = await tx.wait();
        });

        checkPacketEvent();
        checkTransactionProof();
      }); // dummy packet event

      context("When stepping through a real transaction", function () {
        let nativeFee: BigNumber;

        this.beforeAll(setup);
        this.afterAll(async function () {
          await cleanup();
          sendReceipt = undefined as unknown as ContractReceipt;
          packetEvent = undefined as unknown as Result;
        });

        context("and estimating the native fee", function () {
          this.beforeAll(async function () {
            nativeFee = (await counter1.estimateFee(lzChainId2, false, "0x"))
              .nativeFee;
          });

          it("Returns a valid value", async function () {
            expect(nativeFee).to.be.greaterThan(0);
          });
        }); // native fee

        context("and sending the message", function () {
          this.beforeAll(async function () {
            let tx = await counter1.incrementCounter(lzChainId2, {
              value: nativeFee,
            });
            sendReceipt = await tx.wait();

            expectedPayload = new CrossChainPayload(
              (
                await chain1Service.endpoint.getOutboundNonce(
                  lzChainId2,
                  counter1.address
                )
              ).toNumber(),
              lzChainId1,
              counter1.address,
              lzChainId2,
              counter2.address,
              "0x01020304"
            );

            expectedProof = new TransactionProof(
              chain1Service.ulnNode.address,
              expectedPayload.nonce,
              expectedPayload.localChainId,
              expectedPayload.ua,
              expectedPayload.dstChainId,
              expectedPayload.dstAddress,
              expectedPayload.payload
            );
          });

          checkPacketEvent();
          checkTransactionProof();
        }); // sending message

        context("and reporting the confirmation", function () {
          let reportReceipt: ContractReceipt;

          this.beforeAll(async function () {
            let transactionProof =
              await lzEcoSystem.buildTransactionProofFromReceipt(
                counter1.address,
                sendReceipt
              );

            reportReceipt = await lzEcoSystem.reportConfirmations(
              transactionProof,
              1
            );
          });

          it("The confirmations are updated", async function () {
            expect(
              await chain2Service.ulnNode.hashLookup(
                chain2Service.oracle.address,
                lzChainId1,
                expectedProof.blockHash(),
                expectedProof.blockHash()
              )
            ).to.equal(1);
          });

          it("HashReceived is emitted", async function () {
            expectEvent(reportReceipt, HashReceived, {
              srcChainId: lzChainId1,
              oracle: chain2Service.oracle.address,
              lookupHash: expectedProof.blockHash(),
              blockData: expectedProof.blockHash(),
              confirmations: 1,
            });
          });
        }); // report confirmation

        context("and validating the proof", function () {
          this.beforeAll(async function () {
            packet = await chain2Service.validator.validateProof(
              expectedProof.blockHash(),
              expectedProof.encode(),
              20
            );
          });

          it("The validation packet has the correct source node", async function () {
            expect(packet.ulnAddress).to.equal(
              await chain2Service.ulnNode.ulnLookup(lzChainId1)
            );
          });

          it("The validation packet has the correct source chain", async function () {
            expect(packet.srcChainId).to.equal(lzChainId1);
          });

          it("The validation packet source address is the correct format", async function () {
            expect(packet.srcAddress.length).to.equal(42);
          });

          it("The validation packet has the correct dest chain", async function () {
            expect(packet.dstChainId).to.equal(lzChainId2);
          });

          it("The validation packet has the correct dest address", async function () {
            expect(packet.dstAddress).to.equal(counter2.address);
          });
        }); // validating the proof

        context("and routing the message through the relayer", function () {
          let routeReceipt: ContractReceipt;

          this.beforeAll(async function () {
            routeReceipt = (await lzEcoSystem.routePacket(
              expectedProof
            )) as ContractReceipt;
          });

          //   it("PacketReceived is emitted", async function () {
          //     expectEvent(routeReceipt, PacketReceived, {
          //       srcChainId: lzChainId1,
          //       srcAddress: counter1.address,
          //       dstAddress: counter2.address,
          //       nonce: expectedProof.nonce,
          //       payloadHash: ethers.utils.keccak256(packet.payload),
          //     });
          //   });

          it("The message is received by the dest user app", async function () {
            expect(await counter2.counter()).to.equal(1);
          });
        }); // routing through the relayer
      }); // When stepping through a real transaction
    }); //Testing the individual components

    context("Running holisticaly", function () {
      this.beforeAll(setup);
      this.afterAll(cleanup);

      async function callIncrement(
        counter: OmniCounter,
        dstChainId: number
      ): Promise<ContractReceipt> {
        let nativeFee = (await counter.estimateFee(dstChainId, false, "0x"))
          .nativeFee;

        return lzEcoSystem.sendMessage(counter.address, async function () {
          return counter.incrementCounter(dstChainId, {
            value: nativeFee,
          });
        });
      } // callIncrement

      context("Before any increment messages are sent", function () {
        it("counter 1 is 0", async function () {
          expect(await counter1.counter()).to.equal(0);
        });

        it("counter 2 is 0", async function () {
          expect(await counter2.counter()).to.equal(0);
        });
      });

      context("When the increment message is sent from chain 1", function () {
        let receipt: ContractReceipt;

        this.beforeAll(async function () {
          receipt = await callIncrement(counter1, lzChainId2);
        });

        it("counter 1 is 0", async function () {
          expect(await counter1.counter()).to.equal(0);
        });

        it("counter 2 is 1", async function () {
          expect(await counter2.counter()).to.equal(1);
        });
      });

      context("When the increment message is sent from chain 2", function () {
        let receipt: ContractReceipt;

        this.beforeAll(async function () {
          receipt = await callIncrement(counter2, lzChainId1);
        });

        it("counter 1 is 1", async function () {
          expect(await counter1.counter()).to.equal(1);
        });

        it("counter 2 is 1", async function () {
          expect(await counter2.counter()).to.equal(1);
        });
      });
    }); // Running holisticaly
  }); // Sending simple messages
});
