import "dotenv/config";
import "@nomiclabs/hardhat-ethers";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-etherscan-abi";
import "@openzeppelin/hardhat-upgrades";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
  },
};

if (process.env.JENKINS) {
  config.mocha = {
    reporter: "mocha-junit-reporter",
    reporterOptions: {
      mochaFile: "./junit-results.xml",
      jenkinsMode: true,
      outputs: true,
    },
  };
}

export default config;
