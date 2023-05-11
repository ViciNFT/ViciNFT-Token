import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  BigNumberish,
  Contract,
  ContractReceipt,
  ContractTransaction,
} from "ethers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { MOCK_CONTRACTS } from "../test-utils/CommonContracts";
import { expectEvent } from "../helper";
import { AccessServer, MockSanctions } from "../../typechain-types";

const BANNED =
  "0x62616e6e65640000000000000000000000000000000000000000000000000000";

describe("AccessServerTest", () => {
  let accessServer: AccessServer;
  let contractOwner: SignerWithAddress;
  let admin1: SignerWithAddress;
  let admin2: SignerWithAddress;
  let admin3: SignerWithAddress;
  let futureAdmin: SignerWithAddress;
  let regularUser1: SignerWithAddress;
  let regularUser2: SignerWithAddress;
  let bannedUser: SignerWithAddress;
  let oligarch: SignerWithAddress;

  let tx: ContractTransaction;
  let receipt: ContractReceipt;
  let sanctionsOracle: MockSanctions;

  before(async function () {
    let signers = await ethers.getSigners();
    contractOwner = signers[0];
    admin1 = signers[1];
    admin2 = signers[2];
    admin3 = signers[3];
    futureAdmin = signers[4];
    regularUser1 = signers[5];
    regularUser2 = signers[6];
    bannedUser = signers[7];
    oligarch = signers[8];

    sanctionsOracle = await MOCK_CONTRACTS.mockSanctionsList();
    await sanctionsOracle.addToSanctionsList([oligarch.address]);

    accessServer = await MOCK_CONTRACTS.mockAccessServer();

    await accessServer.addAdministrator(admin1.address);
    await accessServer.addAdministrator(admin2.address);
    await accessServer.addAdministrator(admin3.address);

    await accessServer.setSanctionsList(sanctionsOracle.address);
    await accessServer
      .connect(admin1)
      .grantGlobalRole(BANNED, bannedUser.address);
  }); // main before()

  after(async function () {
    await sanctionsOracle.removeFromSanctionsList([
      oligarch.address,
    ]);
    await accessServer
      .connect(admin1)
      .revokeGlobalRole(BANNED, bannedUser.address);
    let accessAdmins = await accessServer.getAdmins();
    for (let eachAdmin of accessAdmins) {
      await accessServer.removeAdministrator(eachAdmin);
    }
  });

  describe("When first deployed", function () {
    it("Sets the contract deployer as the owner", async function () {
      expect(await accessServer.owner()).to.equal(contractOwner.address);
    });
  }); //When first deployed

  describe("Adding Administrators", function () {
    context(
      "When called by the owner and the account is an eligible administrator",
      function () {
        let currentAdminCount: number;

        this.beforeAll(async function () {
          let count = await accessServer.getAdminCount();
          currentAdminCount = count.toNumber();
          tx = await accessServer
            .connect(contractOwner)
            .addAdministrator(futureAdmin.address);
          receipt = await tx.wait();
        });

        this.afterAll(async function () {
          await accessServer
            .connect(contractOwner)
            .removeAdministrator(futureAdmin.address);
        });

        it("the new admin is added", async function () {
          expect(await accessServer.isAdministrator(futureAdmin.address)).to.be
            .true;
        });

        it("the admin count is updated", async function () {
          expect(await accessServer.getAdminCount()).to.equal(
            currentAdminCount + 1
          );
        });

        it("the admin was added to the end of the list", async function () {
          expect(await accessServer.getAdminAt(currentAdminCount)).to.equal(
            futureAdmin.address
          );
        });

        it("AdminAddition is emitted", async function () {
          expectEvent(receipt, "AdminAddition", { admin: futureAdmin.address });
        });
      }
    ); //Adding Administrators: Happy Path

    context("When called by a non-owner", function () {
      it("the error is 'Ownable: caller is not the owner'", async function () {
        await expect(
          accessServer.connect(admin1).addAdministrator(futureAdmin.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    context("When called for a current admin", function () {
      it("the error is 'AccessServer: already admin'", async function () {
        await expect(
          accessServer.connect(contractOwner).addAdministrator(admin1.address)
        ).to.be.revertedWith("AccessServer: already admin");
      });
    });
  }); //Adding Administrators

  describe("Removing Administrators", async function () {
    context("When called for a current administrator", function () {
      let currentAdminCount: number;

      function removalWasSuccessful() {
        it("the admin is removed", async function () {
          expect(
            await accessServer.isAdministrator(admin2.address)
          ).to.be.false;
        });

        it("the admin count is updated", async function () {
          expect(await accessServer.getAdminCount()).to.equal(
            currentAdminCount - 1
          );
        });

        it("the admin at the end of the list was moved up", async function () {
          expect(await accessServer.getAdminAt(currentAdminCount - 2)).to.equal(
            admin3.address
          );
        });

        it("AdminRemoval is emitted", async function () {
          expectEvent(receipt, "AdminRemoval", { admin: admin2.address });
        });
      }

      async function _doRemove(operator: SignerWithAddress) {
        let count = await accessServer.getAdminCount();
        currentAdminCount = count.toNumber();
        tx = await accessServer
          .connect(operator)
          .removeAdministrator(admin2.address);
        receipt = await tx.wait();
      }

      async function _removeCleanup() {
        await accessServer
          .connect(contractOwner)
          .removeAdministrator(admin3.address);
        await accessServer
          .connect(contractOwner)
          .addAdministrator(admin2.address);
        await accessServer
          .connect(contractOwner)
          .addAdministrator(admin3.address);
      }

      context("by the contract owner", function () {
        this.beforeAll(async function () {
          await _doRemove(contractOwner);
        });

        this.afterAll(async function () {
          await _removeCleanup();
        });

        removalWasSuccessful();
      });

      context("by that same administrator", function () {
        this.beforeAll(async function () {
          await _doRemove(admin2);
        });

        this.afterAll(async function () {
          await _removeCleanup();
        });

        removalWasSuccessful();
      });

      context("by a different administrator", function () {
        it("the error is 'AccessServer: caller is not owner or self'", async function () {
          await expect(
            accessServer.connect(admin1).removeAdministrator(admin2.address)
          ).to.be.revertedWith("AccessServer: caller is not owner or self");
        });
      });
    }); // Removing Administrators: current admin
  }); // Removing Administrators
});
