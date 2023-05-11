import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  ContractReceipt,
  ContractTransaction,
} from "ethers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { MOCK_CONTRACTS, proxyDeploy } from "../test-utils/CommonContracts";
import { expectEvent } from "../helper";
import { AccessServer, MockAccess, MockSanctions } from "../../typechain-types";

describe("AccessTest", () => {
  let accessServer: AccessServer;
  let mockAccessContract: MockAccess;
  let contractOwner: SignerWithAddress;
  let serverAdmin: SignerWithAddress;

  let localAdmin: SignerWithAddress;
  let localModerator: SignerWithAddress;
  let localUnitTesterRoleAdmin: SignerWithAddress;
  let localUnitTester: SignerWithAddress;
  let localBannedUser1: SignerWithAddress;
  let localBannedUser2: SignerWithAddress;

  let globalAdmin: SignerWithAddress;
  let globalModerator: SignerWithAddress;
  let globalUnitTesterRoleAdmin: SignerWithAddress;
  let globalUnitTester: SignerWithAddress;
  let globalBannedUser1: SignerWithAddress;
  let globalBannedUser2: SignerWithAddress;

  let regularUser1: SignerWithAddress;
  let regularUser2: SignerWithAddress;
  let oligarch1: SignerWithAddress;
  let oligarch2: SignerWithAddress;
  let oligarch3: SignerWithAddress;

  let tx: ContractTransaction;
  let receipt: ContractReceipt;
  let sanctionsOracle: MockSanctions;

  interface RoleInfo {
    roleName: string;
    role: string;
    isBanned: boolean;
  }
  interface TestCase {
    roleInfo: RoleInfo;
    user: SignerWithAddress;
  }

  const ADMIN: RoleInfo = {
    roleName: "admin",
    role: "0x0000000000000000000000000000000000000000000000000000000000000000",
    isBanned: false,
  };

  const MODERATOR: RoleInfo = {
    roleName: "moderator",
    role: "0x6d6f64657261746f720000000000000000000000000000000000000000000000",
    isBanned: false,
  };

  const BANNED: RoleInfo = {
    roleName: "banned",
    role: "0x62616e6e65640000000000000000000000000000000000000000000000000000",
    isBanned: true,
  };

  const UNIT_TESTER: RoleInfo = {
    roleName: "unit tester",
    role: "0x756e697420746573746572000000000000000000000000000000000000000000",
    isBanned: false,
  };

  const UNIT_TESTER_ROLE_ADMIN: RoleInfo = {
    roleName: "unit tester role admin",
    role: "0x5438868618818671878617817861871861000000000000000000000000000000",
    isBanned: false,
  };

  const ALL_ROLES = [
    ADMIN,
    MODERATOR,
    BANNED,
    UNIT_TESTER,
    UNIT_TESTER_ROLE_ADMIN,
  ];
  const ALL_ROLES_EXCEPT_BANNED = [
    ADMIN,
    MODERATOR,
    UNIT_TESTER,
    UNIT_TESTER_ROLE_ADMIN,
  ];

  let globalTestCases: Array<TestCase>;
  let localTestCases: Array<TestCase>;

  let globalTestCaseLookup: Map<string, SignerWithAddress> = new Map();
  let localTestCaseLookup: Map<string, SignerWithAddress> = new Map();

  before(async function () {
    let signers = await ethers.getSigners();
    contractOwner = signers[0];
    serverAdmin = signers[1];

    localAdmin = signers[2];
    localModerator = signers[3];
    localUnitTesterRoleAdmin = signers[4];
    localUnitTester = signers[5];
    localBannedUser1 = signers[6];
    localBannedUser2 = signers[7];

    globalAdmin = signers[8];
    globalModerator = signers[9];
    globalUnitTesterRoleAdmin = signers[10];
    globalUnitTester = signers[11];
    globalBannedUser1 = signers[12];
    globalBannedUser2 = signers[13];

    regularUser1 = signers[14];
    regularUser2 = signers[15];
    oligarch1 = signers[16];
    oligarch2 = signers[17];
    oligarch3 = signers[18];

    globalTestCases = [
      { roleInfo: ADMIN, user: globalAdmin },
      { roleInfo: MODERATOR, user: globalModerator },
      { roleInfo: BANNED, user: globalBannedUser1 },
      { roleInfo: UNIT_TESTER, user: globalUnitTester },
      { roleInfo: UNIT_TESTER_ROLE_ADMIN, user: globalUnitTesterRoleAdmin },
    ];

    localTestCases = [
      { roleInfo: ADMIN, user: localAdmin },
      { roleInfo: MODERATOR, user: localModerator },
      { roleInfo: BANNED, user: localBannedUser1 },
      { roleInfo: UNIT_TESTER, user: localUnitTester },
      { roleInfo: UNIT_TESTER, user: contractOwner },
      { roleInfo: UNIT_TESTER_ROLE_ADMIN, user: localUnitTesterRoleAdmin },
    ];

    accessServer = await MOCK_CONTRACTS.mockAccessServer();
    await accessServer.addAdministrator(serverAdmin.address);

    for (let testCase of globalTestCases) {
      await accessServer
        .connect(serverAdmin)
        .grantGlobalRole(testCase.roleInfo.role, testCase.user.address);

      globalTestCaseLookup.set(testCase.roleInfo.role, testCase.user);
    }
    // console.log("globalTestCaseLookup", globalTestCaseLookup);

    // grant banned2 and oligarch3 roles before banning/sanctioning
    await accessServer
      .connect(serverAdmin)
      .grantGlobalRole(ADMIN.role, globalBannedUser2.address);
    await accessServer
      .connect(serverAdmin)
      .grantGlobalRole(UNIT_TESTER.role, globalBannedUser2.address);
    await accessServer
      .connect(serverAdmin)
      .grantGlobalRole(UNIT_TESTER.role, globalBannedUser2.address);
    await accessServer
      .connect(serverAdmin)
      .grantGlobalRole(MODERATOR.role, globalBannedUser2.address);
    await accessServer
      .connect(serverAdmin)
      .grantGlobalRole(UNIT_TESTER_ROLE_ADMIN.role, globalBannedUser2.address);

    await accessServer
      .connect(serverAdmin)
      .grantGlobalRole(ADMIN.role, oligarch3.address);
    await accessServer
      .connect(serverAdmin)
      .grantGlobalRole(UNIT_TESTER.role, oligarch3.address);
    await accessServer
      .connect(serverAdmin)
      .grantGlobalRole(UNIT_TESTER.role, oligarch3.address);
    await accessServer
      .connect(serverAdmin)
      .grantGlobalRole(MODERATOR.role, oligarch3.address);
    await accessServer
      .connect(serverAdmin)
      .grantGlobalRole(UNIT_TESTER_ROLE_ADMIN.role, oligarch3.address);

    await accessServer
      .connect(serverAdmin)
      .grantGlobalRole(BANNED.role, globalBannedUser2.address);

    mockAccessContract = (await proxyDeploy(
      "MockAccess",
      accessServer.address
    )) as MockAccess;
    await mockAccessContract.setRoleAdmin(
      UNIT_TESTER.role,
      UNIT_TESTER_ROLE_ADMIN.role
    );

    for (let testCase of localTestCases) {
      await mockAccessContract.grantRole(
        testCase.roleInfo.role,
        testCase.user.address
      );

      localTestCaseLookup.set(testCase.roleInfo.role, testCase.user);
    }
    // console.log("localTestCaseLookup", localTestCaseLookup);

    //grant banned2 and oligarch2 roles before banning/sanctioning
    await mockAccessContract.grantRole(ADMIN.role, localBannedUser2.address);
    await mockAccessContract.grantRole(
      UNIT_TESTER.role,
      localBannedUser2.address
    );
    await mockAccessContract.grantRole(
      UNIT_TESTER.role,
      localBannedUser2.address
    );
    await mockAccessContract.grantRole(
      MODERATOR.role,
      localBannedUser2.address
    );
    await mockAccessContract.grantRole(
      UNIT_TESTER_ROLE_ADMIN.role,
      localBannedUser2.address
    );
    await mockAccessContract.grantRole(ADMIN.role, oligarch2.address);
    await mockAccessContract.grantRole(UNIT_TESTER.role, oligarch2.address);
    await mockAccessContract.grantRole(UNIT_TESTER.role, oligarch2.address);
    await mockAccessContract.grantRole(MODERATOR.role, oligarch2.address);
    await mockAccessContract.grantRole(
      UNIT_TESTER_ROLE_ADMIN.role,
      oligarch2.address
    );

    await mockAccessContract.grantRole(BANNED.role, localBannedUser2.address);

    sanctionsOracle = await MOCK_CONTRACTS.mockSanctionsList();
    await sanctionsOracle.addToSanctionsList([
      oligarch1.address,
      oligarch2.address,
      oligarch3.address,
    ]);

    await accessServer.setSanctionsList(sanctionsOracle.address);
  });

  after(async function () {
    await sanctionsOracle.removeFromSanctionsList([
      oligarch1.address,
      oligarch2.address,
      oligarch3.address,
    ]);
    for (let role of ALL_ROLES) {
      let members = await accessServer.getGlobalRoleMembers(role.role);
      for (let member of members) {
        await accessServer.connect(serverAdmin).revokeGlobalRole(role.role, member);
      }
    }
    await accessServer.removeAdministrator(serverAdmin.address);
  });

  describe("Local Deployment", () => {
    it("Should automatically set contractOwner as ADMIN_ROLE.role", async function () {
      expect(
        await mockAccessContract.hasRole(ADMIN.role, contractOwner.address)
      ).to.be.true;
    });

    it("Should have set localAdmin as ADMIN_ROLE.role", async function () {
      expect(await mockAccessContract.hasRole(ADMIN.role, localAdmin.address))
        .to.be.true;
    });

    it("Should have set globalAdmin as ADMIN_ROLE.role", async function () {
      expect(await mockAccessContract.hasRole(ADMIN.role, globalAdmin.address))
        .to.be.true;
    });

    it("Should have set localBannedUser1 as BANNED_ROLE.role", async function () {
      expect(
        await mockAccessContract.hasRole(BANNED.role, localBannedUser1.address)
      ).to.be.true;
    });

    it("Should have set localBannedUser2 as BANNED_ROLE.role", async function () {
      expect(
        await mockAccessContract.hasRole(BANNED.role, localBannedUser2.address)
      ).to.be.true;
    });

    it("Should have set globalBannedUser1 as BANNED_ROLE.role", async function () {
      expect(
        await mockAccessContract.hasRole(BANNED.role, globalBannedUser1.address)
      ).to.be.true;
    });

    it("Should have set globalBannedUser2 as BANNED_ROLE.role", async function () {
      expect(
        await mockAccessContract.hasRole(BANNED.role, globalBannedUser2.address)
      ).to.be.true;
    });

    it("Should have set localUnitTester as UNIT_TESTER_ROLE.role", async function () {
      expect(
        await mockAccessContract.hasRole(
          UNIT_TESTER.role,
          localUnitTester.address
        )
      ).to.be.true;
    });

    it("Should have set globalUnitTester as UNIT_TESTER_ROLE.role", async function () {
      expect(
        await mockAccessContract.hasRole(
          UNIT_TESTER.role,
          globalUnitTester.address
        )
      ).to.be.true;
    });

    it("Should have set localModerator as MODERATOR_ROLE.role", async function () {
      expect(
        await mockAccessContract.hasRole(MODERATOR.role, localModerator.address)
      ).to.be.true;
    });

    it("Should have set globalModerator as MODERATOR_ROLE.role", async function () {
      expect(
        await mockAccessContract.hasRole(
          MODERATOR.role,
          globalModerator.address
        )
      ).to.be.true;
    });

    it("Should have set localUnitTesterRoleAdmin as UNIT_TESTER_ADMIN_ROLE.role", async function () {
      expect(
        await mockAccessContract.hasRole(
          UNIT_TESTER_ROLE_ADMIN.role,
          localUnitTesterRoleAdmin.address
        )
      ).to.be.true;
    });

    it("Should have set globalUnitTesterRoleAdmin as UNIT_TESTER_ADMIN_ROLE.role", async function () {
      expect(
        await mockAccessContract.hasRole(
          UNIT_TESTER_ROLE_ADMIN.role,
          globalUnitTesterRoleAdmin.address
        )
      ).to.be.true;
    });

    it("Should have set UNIT_TESTER_ADMIN_ROLE.role as the admin role for UNIT_TESTER_ROLE.role", async function () {
      expect(await mockAccessContract.getRoleAdmin(UNIT_TESTER.role)).to.equal(
        UNIT_TESTER_ROLE_ADMIN.role
      );
    });

    it("Should have set MODERATOR_ROLE.role as the admin role for BANNED_ROLE.role", async function () {
      expect(await mockAccessContract.getRoleAdmin(BANNED.role)).to.equal(
        MODERATOR.role
      );
    });

    it("Should have set ADMIN_ROLE.role as the admin role for other roles", async function () {
      expect(await mockAccessContract.getRoleAdmin(ADMIN.role)).to.equal(
        ADMIN.role
      );
      expect(await mockAccessContract.getRoleAdmin(MODERATOR.role)).to.equal(
        ADMIN.role
      );
    });

    it("Should show the oligarchs as being under OFAC sanctions", async function () {
      expect(await mockAccessContract.isSanctioned(oligarch1.address)).to.be
        .true;
      expect(await mockAccessContract.isSanctioned(oligarch2.address)).to.be
        .true;
      expect(await mockAccessContract.isSanctioned(oligarch3.address)).to.be
        .true;
    });
  }); // deployment

  describe("Granting Roles Locally", function () {
    let expectedRole: string;
    let expectedAccount: string;
    let expectedSender: SignerWithAddress;

    async function _doGrant() {
      tx = await mockAccessContract
        .connect(expectedSender)
        .grantRole(expectedRole, expectedAccount);
      receipt = await tx.wait();
    }

    async function _cleanup() {
      await mockAccessContract
        .connect(contractOwner)
        .revokeRole(expectedRole, expectedAccount);
    }

    function localGrantWasSuccessful() {
      it("emits a RoleGranted event", async function () {
        expectEvent(receipt, "RoleGranted", {
          role: expectedRole,
          account: expectedAccount,
          sender: expectedSender.address,
        });
      });

      it("the account has the new role", async function () {
        expect(await mockAccessContract.hasRole(expectedRole, expectedAccount))
          .to.be.true;
      });
    }

    function expectSuccessfulGrant(roleIsBanned: boolean = false) {
      context("to regular user", function () {
        this.beforeEach(async function () {
          expectedAccount = regularUser1.address;
          await _doGrant();
        });

        this.afterEach(async function () {
          await _cleanup();
        });

        localGrantWasSuccessful();
      });

      if (!roleIsBanned) {
        context("to a locally banned user", function () {
          it("reverts", async function () {
            await expect(
              mockAccessContract
                .connect(expectedSender)
                .grantRole(expectedRole, localBannedUser1.address)
            ).to.be.revertedWith("AccessControl: banned");
          });
        });

        context("to a globally banned user", function () {
          it("reverts", async function () {
            await expect(
              mockAccessContract
                .connect(expectedSender)
                .grantRole(expectedRole, globalBannedUser1.address)
            ).to.be.revertedWith("AccessControl: banned");
          });
        });
      }

      context("to a sanctioned user", function () {
        if (roleIsBanned) {
          this.beforeEach(async function () {
            expectedAccount = oligarch1.address;
            await _doGrant();
          });

          this.afterEach(async function () {
            await _cleanup();
          });

          localGrantWasSuccessful();
        } else {
          it("reverts", async function () {
            await expect(
              mockAccessContract
                .connect(expectedSender)
                .grantRole(expectedRole, oligarch1.address)
            ).to.be.revertedWith("OFAC sanctioned address");
          });
        }
      });
    }

    context("when the contract owner", function () {
      this.beforeEach(async function () {
        expectedSender = contractOwner;
      });

      context("grants unit tester", function () {
        this.beforeEach(async function () {
          expectedRole = UNIT_TESTER.role;
        });

        expectSuccessfulGrant();
      });
    });

    context("when a local unit tester role admin", function () {
      this.beforeEach(async function () {
        expectedSender = localUnitTesterRoleAdmin;
      });

      context("grants unit tester", function () {
        this.beforeEach(async function () {
          expectedRole = UNIT_TESTER.role;
        });

        expectSuccessfulGrant();
      });

      context("grants unit tester role admin", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(expectedSender)
              .grantRole(UNIT_TESTER_ROLE_ADMIN.role, regularUser1.address)
          ).to.be.reverted;
        });
      });
    });

    context("when a global unit tester role admin", function () {
      this.beforeEach(async function () {
        expectedSender = globalUnitTesterRoleAdmin;
      });

      context("grants unit tester", function () {
        this.beforeEach(async function () {
          expectedRole = UNIT_TESTER.role;
        });

        expectSuccessfulGrant();
      });

      context("grants unit tester role admin", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(expectedSender)
              .grantRole(UNIT_TESTER_ROLE_ADMIN.role, regularUser1.address)
          ).to.be.reverted;
        });
      });
    });

    context("when a default admin", function () {
      this.beforeEach(async function () {
        expectedSender = localAdmin;
      });

      context("grants unit tester role admin", function () {
        this.beforeEach(async function () {
          expectedRole = UNIT_TESTER_ROLE_ADMIN.role;
        });

        expectSuccessfulGrant();
      });

      context("grants unit tester", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(expectedSender)
              .grantRole(UNIT_TESTER.role, regularUser1.address)
          ).to.be.reverted;
        });
      });
    });

    context("when a global default admin", function () {
      this.beforeEach(async function () {
        expectedSender = globalAdmin;
      });

      context("grants unit tester role admin", function () {
        this.beforeEach(async function () {
          expectedRole = UNIT_TESTER_ROLE_ADMIN.role;
        });

        expectSuccessfulGrant();
      });

      context("grants unit tester", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(expectedSender)
              .grantRole(UNIT_TESTER.role, regularUser1.address)
          ).to.be.reverted;
        });
      });
    });

    context("when a local moderator grants banned", function () {
      this.beforeEach(async function () {
        expectedSender = localModerator;
        expectedRole = BANNED.role;
      });

      expectSuccessfulGrant(true);

      context("to the contract owner", function () {
        it("The error is 'AccessControl: ban owner'", async function () {
          await expect(
            mockAccessContract
              .connect(localModerator)
              .grantRole(BANNED.role, contractOwner.address)
          ).to.be.revertedWith("AccessControl: ban owner");
        });
      });
    });

    context("when a global moderator grants banned", function () {
      this.beforeEach(async function () {
        expectedSender = globalModerator;
        expectedRole = BANNED.role;
      });

      expectSuccessfulGrant(true);

      context("to the contract owner", function () {
        it("The error is 'AccessControl: ban owner'", async function () {
          await expect(
            mockAccessContract
              .connect(globalModerator)
              .grantRole(BANNED.role, contractOwner.address)
          ).to.be.revertedWith("AccessControl: ban owner");
        });
      });
    });

    context(
      "when a local banned user with all the roles (from before they were banned)",
      function () {
        context("grants unit tester", function () {
          it("reverts", async function () {
            await expect(
              mockAccessContract
                .connect(localBannedUser2)
                .grantRole(UNIT_TESTER.role, regularUser1.address)
            ).to.be.reverted;
          });
        });

        context("bans a moderator", function () {
          it("reverts", async function () {
            await expect(
              mockAccessContract
                .connect(localBannedUser2)
                .grantRole(UNIT_TESTER.role, localModerator.address)
            ).to.be.reverted;
          });
        });
      }
    );

    context(
      "when a global banned user with all the roles (from before they were banned)",
      function () {
        context("grants unit tester", function () {
          it("reverts", async function () {
            await expect(
              mockAccessContract
                .connect(globalBannedUser2)
                .grantRole(UNIT_TESTER.role, regularUser1.address)
            ).to.be.reverted;
          });
        });

        context("bans a moderator", function () {
          it("reverts", async function () {
            await expect(
              mockAccessContract
                .connect(globalBannedUser2)
                .grantRole(UNIT_TESTER.role, localModerator.address)
            ).to.be.reverted;
          });
        });
      }
    );

    context("when a sanctioned user with all the roles locally", function () {
      context("grants unit tester", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(oligarch2)
              .grantRole(UNIT_TESTER.role, regularUser1.address)
          ).to.be.reverted;
        });
      });

      context("bans a moderator", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(oligarch2)
              .grantRole(UNIT_TESTER.role, localModerator.address)
          ).to.be.reverted;
        });
      });
    });

    context("when a sanctioned user with all the roles globally", function () {
      context("grants unit tester", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(oligarch3)
              .grantRole(UNIT_TESTER.role, regularUser1.address)
          ).to.be.reverted;
        });
      });

      context("bans a moderator", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(oligarch3)
              .grantRole(UNIT_TESTER.role, localModerator.address)
          ).to.be.reverted;
        });
      });
    });
  }); // Granting Roles Locally

  describe("Granting Roles Globally", function () {
    let expectedRole: string;
    let expectedAccount: string;
    let expectedSender: SignerWithAddress;

    async function _doGrant() {
      tx = await accessServer
        .connect(expectedSender)
        .grantGlobalRole(expectedRole, expectedAccount);
      receipt = await tx.wait();
    }

    async function _cleanup() {
      await accessServer
        .connect(serverAdmin)
        .revokeGlobalRole(expectedRole, expectedAccount);
    }

    function globalGrantWasSuccessful() {
      it("emits a GlobalRoleGranted event", async function () {
        expectEvent(receipt, "GlobalRoleGranted", {
          role: expectedRole,
          account: expectedAccount,
          sender: expectedSender.address,
        });
      });

      it("the account has the new role", async function () {
        expect(await mockAccessContract.hasRole(expectedRole, expectedAccount))
          .to.be.true;
      });
    }

    function expectSuccessfulGrant(roleIsBanned: boolean = false) {
      context("to regular user", function () {
        this.beforeEach(async function () {
          expectedAccount = regularUser1.address;
          await _doGrant();
        });

        this.afterEach(async function () {
          await _cleanup();
        });

        globalGrantWasSuccessful();
      });

      // being banned locally on one contract doesn't prevent having roles on
      // other managed contracts.
      context("to locally banned user", function () {
        this.beforeEach(async function () {
          expectedAccount = localBannedUser1.address;
          await _doGrant();
        });

        this.afterEach(async function () {
          await _cleanup();
        });

        globalGrantWasSuccessful();
      });

      if (!roleIsBanned) {
        context("to a globally banned user", function () {
          it("reverts", async function () {
            await expect(
              accessServer
                .connect(expectedSender)
                .grantGlobalRole(expectedRole, globalBannedUser1.address)
            ).to.be.revertedWith("AccessControl: banned");
          });
        });
      }

      context("to a sanctioned user", function () {
        if (roleIsBanned) {
          this.beforeEach(async function () {
            expectedAccount = oligarch1.address;
            await _doGrant();
          });

          this.afterEach(async function () {
            await _cleanup();
          });

          globalGrantWasSuccessful();
        } else {
          it("reverts", async function () {
            await expect(
              accessServer
                .connect(expectedSender)
                .grantGlobalRole(expectedRole, oligarch1.address)
            ).to.be.revertedWith("OFAC sanctioned address");
          });
        }
      });
    } // doGrant()

    context("when a server contract administrator", function () {
      this.beforeEach(async function () {
        expectedSender = serverAdmin;
      });

      context("grants unit tester", function () {
        this.beforeEach(async function () {
          expectedRole = UNIT_TESTER.role;
        });

        expectSuccessfulGrant();
      });

      context("grants admin", function () {
        this.beforeEach(async function () {
          expectedRole = ADMIN.role;
        });

        expectSuccessfulGrant();
      });

      context("grants moderator", function () {
        this.beforeEach(async function () {
          expectedRole = MODERATOR.role;
        });

        expectSuccessfulGrant();
      });

      context("grants unit tester role admin", function () {
        this.beforeEach(async function () {
          expectedRole = UNIT_TESTER_ROLE_ADMIN.role;
        });

        expectSuccessfulGrant();
      });

      context("grants banned", function () {
        this.beforeEach(async function () {
          expectedRole = BANNED.role;
        });

        expectSuccessfulGrant(true);
      });
    }); // grant by server contract administrator

    context("when a anyone else attempts to grant a global role", function () {
      it("the error is 'AccessServer: caller is not admin'", async function () {
        await expect(
          accessServer
            .connect(contractOwner)
            .grantGlobalRole(ADMIN.role, regularUser1.address)
        ).to.be.revertedWith("AccessServer: caller is not admin");
      });
    });
  }); // Granting Roles Globally

  describe("Revoking Roles Locally", function () {
    let expectedRole: string;
    let expectedAccount: string;
    let expectedSender: SignerWithAddress;

    function revokeWasSuccessful() {
      it("emits a RoleRevoked event", async function () {
        expectEvent(receipt, "RoleRevoked", {
          role: expectedRole,
          account: expectedAccount,
          sender: expectedSender.address,
        });
      });

      it("the account does not have the role", async function () {
        expect(await mockAccessContract.hasRole(expectedRole, expectedAccount))
          .to.be.false;
      });
    }

    function doRevoke() {
      context("from a user with the role", function () {
        this.beforeEach(async function () {
          tx = await mockAccessContract
            .connect(expectedSender)
            .revokeRole(expectedRole, expectedAccount);
          receipt = await tx.wait();
        });

        this.afterEach(async function () {
          await mockAccessContract
            .connect(contractOwner)
            .grantRole(expectedRole, expectedAccount);

          expect(
            await mockAccessContract.hasRole(expectedRole, expectedAccount)
          ).to.be.true;
        });

        revokeWasSuccessful();
      });
    }

    context("When the contract owner", function () {
      this.beforeEach(async function () {
        expectedSender = contractOwner;
      });

      context("revokes unit tester", function () {
        this.beforeEach(async function () {
          expectedRole = UNIT_TESTER.role;
          expectedAccount = localUnitTester.address;
        });

        doRevoke();
      });

      context("revokes unit tester from contract owner", function () {
        this.beforeEach(async function () {
          expectedRole = UNIT_TESTER.role;
          expectedAccount = contractOwner.address;
        });

        doRevoke();
      });

      context("revokes admin", function () {
        this.beforeEach(async function () {
          expectedRole = ADMIN.role;
          expectedAccount = localAdmin.address;
        });

        doRevoke();
      });

      context("revokes banned", function () {
        this.beforeEach(async function () {
          expectedRole = BANNED.role;
          expectedAccount = localBannedUser1.address;
        });

        doRevoke();
      });

      context("revokes admin from contract owner", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(expectedSender)
              .revokeRole(ADMIN.role, contractOwner.address)
          ).to.be.revertedWith("AccessControl: revoke admin from owner");
        });
      });
    }); // revoke by contract owner

    context("When a default admin", function () {
      this.beforeEach(async function () {
        expectedSender = localAdmin;
      });

      context("revokes unit tester", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(expectedSender)
              .revokeRole(UNIT_TESTER.role, localUnitTester.address)
          ).to.be.reverted;
        });
      });

      context("revokes admin granted locally", function () {
        this.beforeEach(async function () {
          expectedRole = ADMIN.role;
          expectedAccount = localAdmin.address;
        });

        doRevoke();
      });

      context("revokes admin granted globally", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(expectedSender)
              .revokeRole(ADMIN.role, globalAdmin.address)
          ).to.be.revertedWith("AccessServer: role must be removed globally");
        });
      });

      context("revokes banned", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(expectedSender)
              .revokeRole(BANNED.role, localBannedUser1.address)
          ).to.be.reverted;
        });
      });

      context("revokes admin from contract owner", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(expectedSender)
              .revokeRole(ADMIN.role, contractOwner.address)
          ).to.be.revertedWith("AccessControl: revoke admin from owner");
        });
      });
    }); // revoke by default admin

    context("When the unit tester admin", function () {
      this.beforeEach(async function () {
        expectedSender = localUnitTesterRoleAdmin;
      });

      context("revokes unit tester granted globally", function () {
        this.beforeEach(async function () {
          expectedRole = UNIT_TESTER.role;
          expectedAccount = localUnitTester.address;
        });

        doRevoke();
      });

      context("revokes unit tester granted globally", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(expectedSender)
              .revokeRole(UNIT_TESTER.role, globalUnitTester.address)
          ).to.be.revertedWith("AccessServer: role must be removed globally");
        });
      });

      context("revokes unit tester from contract owner", function () {
        this.beforeEach(async function () {
          expectedRole = UNIT_TESTER.role;
          expectedAccount = contractOwner.address;
        });

        doRevoke();
      });

      context("revokes admin", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(expectedSender)
              .revokeRole(ADMIN.role, localAdmin.address)
          ).to.be.reverted;
        });
      });

      context("revokes banned", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(expectedSender)
              .revokeRole(BANNED.role, localBannedUser1.address)
          ).to.be.reverted;
        });
      });
    }); // revoke by unit tester admin admin

    context("When the moderator", function () {
      this.beforeEach(async function () {
        expectedSender = localModerator;
      });

      context("revokes unit tester", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(expectedSender)
              .revokeRole(UNIT_TESTER.role, localUnitTester.address)
          ).to.be.reverted;
        });
      });

      context("revokes admin", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(expectedSender)
              .revokeRole(ADMIN.role, localAdmin.address)
          ).to.be.reverted;
        });
      });

      context("revokes local ban", function () {
        this.beforeEach(async function () {
          expectedRole = BANNED.role;
          expectedAccount = localBannedUser1.address;
        });

        doRevoke();
      });

      context("revokes global ban", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(expectedSender)
              .revokeRole(BANNED.role, globalBannedUser1.address)
          ).to.be.revertedWith("AccessServer: role must be removed globally");
        });
      });
    }); // revoke by moderator

    context(
      "when a banned user with all the roles (from before they were banned)",
      function () {
        context("revokes unit tester", function () {
          it("reverts", async function () {
            await expect(
              mockAccessContract
                .connect(localBannedUser2)
                .revokeRole(UNIT_TESTER.role, localUnitTester.address)
            ).to.be.reverted;
          });
        });

        context("revokes their own banned status", function () {
          it("reverts", async function () {
            await expect(
              mockAccessContract
                .connect(localBannedUser2)
                .revokeRole(BANNED.role, localBannedUser2.address)
            ).to.be.reverted;
          });
        });
      }
    );

    context(
      "when a sanctioned user with all the roles (from before they were sanctioned)",
      function () {
        context("revokes unit tester", function () {
          it("reverts", async function () {
            await expect(
              mockAccessContract
                .connect(oligarch2)
                .revokeRole(UNIT_TESTER.role, localUnitTester.address)
            ).to.be.reverted;
          });
        });

        context("revokes banned", function () {
          it("reverts", async function () {
            await expect(
              mockAccessContract
                .connect(oligarch2)
                .revokeRole(UNIT_TESTER.role, localBannedUser2.address)
            ).to.be.reverted;
          });
        });
      }
    );
  }); // Revoking Roles Locally

  describe("Revoking Roles Globally", function () {
    let expectedRole: string;
    let expectedAccount: string;
    let expectedSender: SignerWithAddress;

    async function doRevoke() {
      tx = await accessServer
        .connect(expectedSender)
        .revokeGlobalRole(expectedRole, expectedAccount);
      receipt = await tx.wait();
    }

    async function cleanup() {
      await accessServer
        .connect(serverAdmin)
        .grantGlobalRole(expectedRole, expectedAccount);
    }

    function revokeWasSuccessful() {
      it("emits a RoleRevoked event", async function () {
        expectEvent(receipt, "GlobalRoleRevoked", {
          role: expectedRole,
          account: expectedAccount,
          sender: expectedSender.address,
        });
      });

      it("the account does not have the role", async function () {
        expect(await mockAccessContract.hasRole(expectedRole, expectedAccount))
          .to.be.false;
      });
    }

    function expectSuccessfulRevoke(roleInfo: RoleInfo) {
      context(
        `revokes ${roleInfo.roleName} from a user with the global role`,
        function () {
          this.beforeEach(async function () {
            expectedRole = roleInfo.role;
            expectedAccount = (
              globalTestCaseLookup.get(roleInfo.role) as SignerWithAddress
            ).address;

            await doRevoke();
          });

          this.afterEach(async function () {
            await cleanup();
          });

          revokeWasSuccessful();
        }
      );
    }

    context("when a server contract administrator", function () {
      this.beforeEach(async function () {
        expectedSender = serverAdmin;
      });

      for (let roleInfo of ALL_ROLES) {
        expectSuccessfulRevoke(roleInfo);
      }
    });
  }); // Revoking Roles Globally

  describe("Renouncing Roles Locally", function () {
    let expectedRole: string;
    let expectedSender: SignerWithAddress;

    async function doRenounce() {
      tx = await mockAccessContract
        .connect(expectedSender)
        ["renounceRole(bytes32)"](expectedRole);
      receipt = await tx.wait();
    }

    async function cleanup() {
      await mockAccessContract
        .connect(contractOwner)
        .grantRole(expectedRole, expectedSender.address);
    }

    function renounceWasSuccessful() {
      it("the account does not have the role", async function () {
        expect(
          await mockAccessContract.hasRole(expectedRole, expectedSender.address)
        ).to.be.false;
      });

      it("emits a RoleRevoked event", async function () {
        expectEvent(receipt, "RoleRevoked", {
          role: expectedRole,
          account: expectedSender.address,
          sender: expectedSender.address,
        });
      });
    }

    for (let roleInfo of ALL_ROLES_EXCEPT_BANNED) {
      context(
        `When a user with local ${roleInfo.roleName} renounces that role`,
        function () {
          this.beforeAll(async function () {
            expectedRole = roleInfo.role;
            expectedSender = localTestCaseLookup.get(
              roleInfo.role
            ) as SignerWithAddress;
            await doRenounce();
          });

          this.afterAll(async function () {
            await cleanup();
          });

          renounceWasSuccessful();
        }
      );
    }

    context(
      "when a banned user renounces the admin role (from before they were banned)",
      function () {
        this.beforeAll(async function () {
          expectedRole = ADMIN.role;
          expectedSender = localBannedUser2;
          await doRenounce();
        });

        this.afterAll(async function () {
          await mockAccessContract
            .connect(localModerator)
            .revokeRole(BANNED.role, localBannedUser2.address);

          await cleanup();

          await mockAccessContract
            .connect(localModerator)
            .grantRole(BANNED.role, localBannedUser2.address);
        });

        renounceWasSuccessful();
      }
    );

    context(
      "when a user user under OFAC sanctions renounces the admin role (from before they were sanctioned)",
      function () {
        this.beforeAll(async function () {
          expectedRole = ADMIN.role;
          expectedSender = oligarch2;
          await doRenounce();
        });

        this.afterAll(async function () {
          await sanctionsOracle.removeFromSanctionsList([oligarch2.address]);
          await cleanup();
          await sanctionsOracle.addToSanctionsList([oligarch2.address]);
        });

        renounceWasSuccessful();
      }
    );

    context("when a user renounces a role they don't have", function () {
      it("reverts", async function () {
        await expect(
          mockAccessContract
            .connect(regularUser1)
            ["renounceRole(bytes32)"](UNIT_TESTER.role)
        ).to.be.reverted;
      });
    });

    context("when the contract owner renounces default admin", function () {
      it("reverts", async function () {
        await expect(
          mockAccessContract
            .connect(contractOwner)
            ["renounceRole(bytes32)"](ADMIN.role)
        ).to.be.revertedWith("AccessControl: owner renounce admin");
      });
    });

    context("when a banned user renounces the banned role", function () {
      it("reverts", async function () {
        await expect(
          mockAccessContract
            .connect(localBannedUser1)
            ["renounceRole(bytes32)"](BANNED.role)
        ).to.be.revertedWith("AccessControl: self unban");
      });
    });
  }); // Renouncing roles Locally

  describe("Renouncing roles Globally", function () {
    let expectedRole: string;
    let expectedSender: SignerWithAddress;

    async function doRenounce() {
      tx = await accessServer
        .connect(expectedSender)
        .renounceRoleGlobally(expectedRole);
      receipt = await tx.wait();
    }

    async function cleanup() {
      await accessServer
        .connect(serverAdmin)
        .grantGlobalRole(expectedRole, expectedSender.address);
    }

    function renounceWasSuccessful() {
      it("the account does not have the role", async function () {
        expect(
          await mockAccessContract.hasRole(expectedRole, expectedSender.address)
        ).to.be.false;
      });

      it("emits a GlobalRoleRevoked event", async function () {
        expectEvent(receipt, "GlobalRoleRevoked", {
          role: expectedRole,
          account: expectedSender.address,
          sender: expectedSender.address,
        });
      });
    }

    for (let roleInfo of ALL_ROLES_EXCEPT_BANNED) {
      context(
        `When a user with global ${roleInfo.roleName} renounces that role`,
        function () {
          this.beforeEach(async function () {
            expectedRole = roleInfo.role;
            expectedSender = globalTestCaseLookup.get(
              roleInfo.role
            ) as SignerWithAddress;

            await doRenounce();
          });

          this.afterEach(async function () {
            await cleanup();
          });

          renounceWasSuccessful();
        }
      );
    }

    context("when a banned user renounces the banned role", function () {
      it("the error is 'AccessControl: self unban'", async function () {
        await expect(
          accessServer
            .connect(localBannedUser1)
            .renounceRoleGlobally(BANNED.role)
        ).to.be.revertedWith("AccessControl: self unban");
      });
    });
  }); // Renouncing roles Globally

  describe("Access Control", function () {
    let sender: SignerWithAddress;

    function tryUpdateCounters(pub: boolean, unit: boolean, own: boolean) {
      context("tries to update the public counter", function () {
        if (pub) {
          it("succeeds", async function () {
            let counter = await mockAccessContract.get_public_counter();
            await mockAccessContract.connect(sender).increment_public_counter();
            expect(await mockAccessContract.get_public_counter()).to.equal(
              counter.toNumber() + 1
            );
          });
        } else {
          it("reverts", async function () {
            await expect(
              mockAccessContract.connect(sender).increment_public_counter()
            ).to.be.reverted;
          });
        }
      });

      context("tries to update the unit test counter", function () {
        if (unit) {
          it("succeeds", async function () {
            let counter = await mockAccessContract.get_unit_tester_counter();
            await mockAccessContract
              .connect(sender)
              .increment_unit_tester_counter();
            expect(await mockAccessContract.get_unit_tester_counter()).to.equal(
              counter.toNumber() + 1
            );
          });
        } else {
          it("reverts", async function () {
            await expect(
              mockAccessContract.connect(sender).increment_unit_tester_counter()
            ).to.be.reverted;
          });
        }
      });

      context("tries to update the owner counter", function () {
        if (own) {
          it("succeeds", async function () {
            let counter = await mockAccessContract.get_owner_counter();
            await mockAccessContract.connect(sender).increment_owner_counter();
            expect(await mockAccessContract.get_owner_counter()).to.equal(
              counter.toNumber() + 1
            );
          });
        } else {
          it("reverts", async function () {
            await expect(
              mockAccessContract.connect(sender).increment_owner_counter()
            ).to.be.reverted;
          });
        }
      });
    }

    context("When the contract owner", function () {
      this.beforeEach(async function () {
        sender = contractOwner;
      });

      tryUpdateCounters(true, true, true);
    });

    context("When a local admin user", function () {
      this.beforeEach(async function () {
        sender = localAdmin;
      });

      tryUpdateCounters(true, false, false);
    });

    context("When a global admin user", function () {
      this.beforeEach(async function () {
        sender = globalAdmin;
      });

      tryUpdateCounters(true, false, false);
    });

    context("When a local moderator", function () {
      this.beforeEach(async function () {
        sender = localModerator;
      });

      tryUpdateCounters(true, false, false);
    });

    context("When a global moderator", function () {
      this.beforeEach(async function () {
        sender = globalModerator;
      });

      tryUpdateCounters(true, false, false);
    });

    context("When a local unit tester", function () {
      this.beforeEach(async function () {
        sender = localUnitTester;
      });

      tryUpdateCounters(true, true, false);
    });

    context("When a global unit tester", function () {
      this.beforeEach(async function () {
        sender = globalUnitTester;
      });

      tryUpdateCounters(true, true, false);
    });

    context("When an local unit tester role admin", function () {
      this.beforeEach(async function () {
        sender = localUnitTesterRoleAdmin;
      });

      tryUpdateCounters(true, false, false);
    });

    context("When an global unit tester role admin", function () {
      this.beforeEach(async function () {
        sender = globalUnitTesterRoleAdmin;
      });

      tryUpdateCounters(true, false, false);
    });

    context("When a regular user", function () {
      this.beforeEach(async function () {
        sender = regularUser1;
      });

      tryUpdateCounters(true, false, false);
    });

    context("When a local banned user", function () {
      this.beforeEach(async function () {
        sender = localBannedUser1;
      });

      tryUpdateCounters(false, false, false);
    });

    context(
      "When a local banned user with previously assigned local roles",
      function () {
        this.beforeEach(async function () {
          sender = localBannedUser2;
        });

        tryUpdateCounters(false, false, false);
      }
    );

    context("When a global banned user", function () {
      this.beforeEach(async function () {
        sender = globalBannedUser1;
      });

      tryUpdateCounters(false, false, false);
    });

    context(
      "When a global banned user with previously assigned global roles",
      function () {
        this.beforeEach(async function () {
          sender = globalBannedUser2;
        });

        tryUpdateCounters(false, false, false);
      }
    );

    context("When a user under OFAC sanctions", function () {
      this.beforeEach(async function () {
        sender = oligarch1;
      });

      tryUpdateCounters(false, false, false);
    });

    context(
      "When a user under OFAC sanctions with previously assigned local roles",
      function () {
        this.beforeEach(async function () {
          sender = oligarch2;
        });

        tryUpdateCounters(false, false, false);
      }
    );

    context(
      "When a user under OFAC sanctions with previously assigned global roles",
      function () {
        this.beforeEach(async function () {
          sender = oligarch3;
        });

        tryUpdateCounters(false, false, false);
      }
    );
  }); //Access Control

  describe("Transfer Ownership", function () {
    let oldOwner: SignerWithAddress;
    let newOwner: SignerWithAddress;

    function itTransfers() {
      context("to an eligible new owner", function () {
        this.beforeEach(async function () {
          newOwner = regularUser1;
          tx = await mockAccessContract
            .connect(oldOwner)
            .transferOwnership(newOwner.address);
          receipt = await tx.wait();
        });

        this.afterEach(async function () {
          await mockAccessContract
            .connect(newOwner)
            .transferOwnership(oldOwner.address);
        });

        it("emits an OwnershipTransferred event", async function () {
          expectEvent(receipt, "OwnershipTransferred", {
            previousOwner: oldOwner.address,
            newOwner: newOwner.address,
          });
        });

        it("transfers the ownership", async function () {
          expect(await mockAccessContract.owner()).to.equal(newOwner.address);
        });

        it("grants admin role to the new owner", async function () {
          expect(
            await mockAccessContract.hasRole(ADMIN.role, newOwner.address)
          ).to.be.true;
        });

        it("previous owner retains admin role", async function () {
          expect(
            await mockAccessContract.hasRole(ADMIN.role, oldOwner.address)
          ).to.be.true;
        });

        it("previous owner is now allowed to renounce admin role", async function () {
          await mockAccessContract
            .connect(oldOwner)
            ["renounceRole(bytes32)"](ADMIN.role);
          expect(
            await mockAccessContract.hasRole(ADMIN.role, oldOwner.address)
          ).to.be.false;
        });

        it("admin role can be revoked from previous owner", async function () {
          await mockAccessContract
            .connect(localAdmin)
            .revokeRole(ADMIN.role, oldOwner.address);
          expect(
            await mockAccessContract.hasRole(ADMIN.role, oldOwner.address)
          ).to.be.false;
        });

        it("previous owner can be banned", async function () {
          await mockAccessContract
            .connect(localModerator)
            .grantRole(BANNED.role, oldOwner.address);

          expect(
            await mockAccessContract.isBanned(oldOwner.address)
          ).to.be.true;

          await mockAccessContract
            .connect(localModerator)
            .revokeRole(BANNED.role, oldOwner.address);
        });
      });
    }

    context("When the current contract owner transfers ownership", function () {
      this.beforeEach(async function () {
        oldOwner = contractOwner;
      });

      itTransfers();

      context("to themselves", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(contractOwner)
              .transferOwnership(contractOwner.address)
          ).to.be.revertedWith("AccessControl: already owner");
        });
      });

      context("to a locally banned user", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(contractOwner)
              .transferOwnership(localBannedUser1.address)
          ).to.be.revertedWith("AccessControl: banned");
        });
      });

      context("to a user under OFAC sanctions", function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(contractOwner)
              .transferOwnership(oligarch1.address)
          ).to.be.revertedWith("OFAC sanctioned address");
        });
      });
    });

    context(
      "When someone who is not the owner transfers ownership",
      function () {
        it("reverts", async function () {
          await expect(
            mockAccessContract
              .connect(localAdmin)
              .transferOwnership(regularUser1.address)
          ).to.be.revertedWith("AccessControl: not owner");
        });
      }
    );
  }); // Transfer Ownership
});
