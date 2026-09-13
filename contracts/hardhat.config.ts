import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatKeystorePlugin from "@nomicfoundation/hardhat-keystore";
import hardhatVerifyPlugin from "@nomicfoundation/hardhat-verify";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin, hardhatKeystorePlugin, hardhatVerifyPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    // Local Hardhat node used for dev + integration tests. Started with
    // `npx hardhat node --port 8545` from this directory.
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    // Sepolia is deployed to by the orchestrator only, never from here.
    // `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` are read from the
    // encrypted hardhat-keystore (`npx hardhat keystore set SEPOLIA_RPC_URL`
    // / `SEPOLIA_PRIVATE_KEY`), never from a plaintext .env file.
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
  },
});
