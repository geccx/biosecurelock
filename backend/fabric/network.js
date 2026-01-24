const { Gateway, Wallets } = require("fabric-network");
const path = require("path");
const fs = require("fs");
const logger = require("../utils/logger");

class FabricNetwork {
  constructor() {
    this.gateway = null;
    this.network = null;
    this.contract = null;
    this.wallet = null;
    this.connectionProfile = null;
    this.channelName = process.env.FABRIC_CHANNEL_NAME || "doorchannel";
    this.chaincodeName = process.env.FABRIC_CHAINCODE_NAME || "doorlockcc";
    this.walletPath = path.resolve(
      __dirname,
      process.env.FABRIC_WALLET_PATH || "./wallet"
    );
    this.connectionProfilePath = path.resolve(
      __dirname,
      process.env.FABRIC_CONNECTION_PROFILE || "./connection-profile.json"
    );
  }

  // Initialize network connection
  async initialize() {
    try {
      logger.info("Initializing Fabric network...");

      // Load connection profile
      if (!fs.existsSync(this.connectionProfilePath)) {
        throw new Error(
          `Connection profile not found at ${this.connectionProfilePath}`
        );
      }

      this.connectionProfile = JSON.parse(
        fs.readFileSync(this.connectionProfilePath, "utf8")
      );

      // Create or load wallet
      this.wallet = await Wallets.newFileSystemWallet(this.walletPath);
      logger.info(`Wallet path: ${this.walletPath}`);

      // Check if admin identity exists
      const adminIdentity = await this.wallet.get("admin");
      if (!adminIdentity) {
        logger.warn(
          "Admin identity not found in wallet. Please enroll admin first."
        );
        throw new Error(
          "Admin identity not found. Run enrollment script first."
        );
      }

      // Create a new gateway for connecting to peer node
      this.gateway = new Gateway();
      await this.gateway.connect(this.connectionProfile, {
        wallet: this.wallet,
        identity: "admin",
        discovery: {
          enabled: true,
          asLocalhost: process.env.NODE_ENV === "development",
        },
      });

      // Get the network (channel) contract
      this.network = await this.gateway.getNetwork(this.channelName);
      this.contract = this.network.getContract(this.chaincodeName);

      logger.info("✓ Fabric network initialized successfully");
      logger.info(`  Channel: ${this.channelName}`);
      logger.info(`  Chaincode: ${this.chaincodeName}`);

      return true;
    } catch (error) {
      logger.error("Failed to initialize Fabric network:", error);
      throw error;
    }
  }

  // Get contract instance
  getContract() {
    if (!this.contract) {
      throw new Error("Network not initialized. Call initialize() first.");
    }
    return this.contract;
  }

  // Get network instance
  getNetwork() {
    if (!this.network) {
      throw new Error("Network not initialized. Call initialize() first.");
    }
    return this.network;
  }

  // Get gateway instance
  getGateway() {
    if (!this.gateway) {
      throw new Error("Gateway not initialized. Call initialize() first.");
    }
    return this.gateway;
  }

  // Get wallet instance
  getWallet() {
    if (!this.wallet) {
      throw new Error("Wallet not initialized. Call initialize() first.");
    }
    return this.wallet;
  }

  // Submit transaction (writes to ledger)
  async submitTransaction(functionName, ...args) {
    try {
      if (!this.contract) {
        await this.initialize();
      }

      logger.info(`Submitting transaction: ${functionName}`, { args });

      const result = await this.contract.submitTransaction(
        functionName,
        ...args
      );
      const txId = this.contract.getTransactionID();

      logger.info(`Transaction ${functionName} submitted successfully`, {
        txId: txId ? txId.toString() : "unknown",
      });

      return {
        result: result.toString() ? JSON.parse(result.toString()) : null,
        txId: txId ? txId.toString() : null,
      };
    } catch (error) {
      logger.error(`Error submitting transaction ${functionName}:`, error);
      throw error;
    }
  }

  // Evaluate transaction (reads from ledger, no state change)
  async evaluateTransaction(functionName, ...args) {
    try {
      if (!this.contract) {
        await this.initialize();
      }

      logger.info(`Evaluating transaction: ${functionName}`, { args });

      const result = await this.contract.evaluateTransaction(
        functionName,
        ...args
      );

      logger.info(`Transaction ${functionName} evaluated successfully`);

      return result.toString() ? JSON.parse(result.toString()) : null;
    } catch (error) {
      logger.error(`Error evaluating transaction ${functionName}:`, error);
      throw error;
    }
  }

  // Listen to contract events
  async addContractListener(eventName, callback) {
    try {
      if (!this.contract) {
        await this.initialize();
      }

      await this.contract.addContractListener(
        eventName,
        "all-events",
        callback,
        {
          type: "full",
          startBlock: "newest",
        }
      );

      logger.info(`Added contract listener for event: ${eventName}`);
    } catch (error) {
      logger.error(`Error adding contract listener for ${eventName}:`, error);
      throw error;
    }
  }

  // Remove contract listener
  removeContractListener(eventName) {
    try {
      if (this.contract) {
        this.contract.removeContractListener(eventName);
        logger.info(`Removed contract listener for event: ${eventName}`);
      }
    } catch (error) {
      logger.error(`Error removing contract listener for ${eventName}:`, error);
    }
  }

  // Check if network is connected
  isConnected() {
    return this.gateway !== null && this.contract !== null;
  }

  // Disconnect from network
  async disconnect() {
    try {
      if (this.gateway) {
        await this.gateway.disconnect();
        this.gateway = null;
        this.network = null;
        this.contract = null;
        logger.info("Fabric gateway disconnected");
      }
    } catch (error) {
      logger.error("Error disconnecting gateway:", error);
      throw error;
    }
  }

  // Reconnect to network
  async reconnect() {
    try {
      logger.info("Reconnecting to Fabric network...");
      await this.disconnect();
      await this.initialize();
      logger.info("Reconnected to Fabric network");
    } catch (error) {
      logger.error("Error reconnecting to network:", error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new FabricNetwork();
