const { Wallets } = require("fabric-network");
const FabricCAServices = require("fabric-ca-client");
const path = require("path");
const fs = require("fs");
const logger = require("../utils/logger");

class WalletManager {
  constructor() {
    this.wallet = null;
    this.walletPath = path.resolve(
      __dirname,
      process.env.FABRIC_WALLET_PATH || "./wallet"
    );
    this.connectionProfilePath = path.resolve(
      __dirname,
      process.env.FABRIC_CONNECTION_PROFILE || "./connection-profile.json"
    );
    this.mspId = process.env.FABRIC_MSP_ID || "Org1MSP";
  }

  // Initialize wallet
  async initialize() {
    try {
      // Create wallet directory if it doesn't exist
      if (!fs.existsSync(this.walletPath)) {
        fs.mkdirSync(this.walletPath, { recursive: true });
        logger.info(`Created wallet directory: ${this.walletPath}`);
      }

      // Create or load wallet
      this.wallet = await Wallets.newFileSystemWallet(this.walletPath);
      logger.info("Wallet initialized");

      return this.wallet;
    } catch (error) {
      logger.error("Error initializing wallet:", error);
      throw error;
    }
  }

  // Get wallet instance
  async getWallet() {
    if (!this.wallet) {
      await this.initialize();
    }
    return this.wallet;
  }

  // Enroll admin user
  async enrollAdmin(enrollmentID = "admin", enrollmentSecret = "adminpw") {
    try {
      const wallet = await this.getWallet();

      // Check if admin already exists
      const adminIdentity = await wallet.get(enrollmentID);
      if (adminIdentity) {
        logger.info(`Admin identity ${enrollmentID} already exists in wallet`);
        return adminIdentity;
      }

      // Load connection profile
      const connectionProfile = JSON.parse(
        fs.readFileSync(this.connectionProfilePath, "utf8")
      );

      // Get CA info from connection profile
      const caInfo =
        connectionProfile.certificateAuthorities["ca.org1.example.com"];
      if (!caInfo) {
        throw new Error("CA information not found in connection profile");
      }

      const caTLSCACerts = caInfo.tlsCACerts.pem;
      const ca = new FabricCAServices(
        caInfo.url,
        { trustedRoots: caTLSCACerts, verify: false },
        caInfo.caName
      );

      // Enroll admin
      logger.info(`Enrolling admin ${enrollmentID}...`);
      const enrollment = await ca.enroll({
        enrollmentID: enrollmentID,
        enrollmentSecret: enrollmentSecret,
      });

      const x509Identity = {
        credentials: {
          certificate: enrollment.certificate,
          privateKey: enrollment.key.toBytes(),
        },
        mspId: this.mspId,
        type: "X.509",
      };

      await wallet.put(enrollmentID, x509Identity);
      logger.info(`Admin ${enrollmentID} enrolled and imported to wallet`);

      return x509Identity;
    } catch (error) {
      logger.error("Error enrolling admin:", error);
      throw error;
    }
  }

  // Register and enroll a new user
  async registerUser(
    username,
    role = "client",
    affiliation = "org1.department1"
  ) {
    try {
      const wallet = await this.getWallet();

      // Check if user already exists
      const userIdentity = await wallet.get(username);
      if (userIdentity) {
        logger.info(`User ${username} already exists in wallet`);
        return {
          success: true,
          message: "User already enrolled",
          identity: userIdentity,
        };
      }

      // Get admin identity
      const adminIdentity = await wallet.get("admin");
      if (!adminIdentity) {
        throw new Error("Admin identity not found. Please enroll admin first.");
      }

      // Load connection profile
      const connectionProfile = JSON.parse(
        fs.readFileSync(this.connectionProfilePath, "utf8")
      );

      // Build CA client
      const caInfo =
        connectionProfile.certificateAuthorities["ca.org1.example.com"];
      const caTLSCACerts = caInfo.tlsCACerts.pem;
      const ca = new FabricCAServices(
        caInfo.url,
        { trustedRoots: caTLSCACerts, verify: false },
        caInfo.caName
      );

      // Build admin user object for authentication
      const provider = wallet
        .getProviderRegistry()
        .getProvider(adminIdentity.type);
      const adminUser = await provider.getUserContext(adminIdentity, "admin");

      // Register the user with CA
      logger.info(`Registering user ${username}...`);
      const secret = await ca.register(
        {
          affiliation: affiliation,
          enrollmentID: username,
          role: role,
          attrs: [
            { name: "role", value: role, ecert: true },
            { name: "username", value: username, ecert: true },
          ],
        },
        adminUser
      );

      // Enroll the user
      logger.info(`Enrolling user ${username}...`);
      const enrollment = await ca.enroll({
        enrollmentID: username,
        enrollmentSecret: secret,
      });

      const x509Identity = {
        credentials: {
          certificate: enrollment.certificate,
          privateKey: enrollment.key.toBytes(),
        },
        mspId: this.mspId,
        type: "X.509",
      };

      await wallet.put(username, x509Identity);
      logger.info(`User ${username} enrolled and imported to wallet`);

      return {
        success: true,
        message: "User registered and enrolled successfully",
        username: username,
        fabricIdentity: x509Identity.credentials.certificate,
      };
    } catch (error) {
      logger.error(`Error registering user ${username}:`, error);
      throw error;
    }
  }

  // Get identity from wallet
  async getIdentity(username) {
    try {
      const wallet = await this.getWallet();
      const identity = await wallet.get(username);

      if (!identity) {
        throw new Error(`Identity ${username} not found in wallet`);
      }

      return identity;
    } catch (error) {
      logger.error(`Error getting identity ${username}:`, error);
      throw error;
    }
  }

  // Check if identity exists
  async identityExists(username) {
    try {
      const wallet = await this.getWallet();
      const identity = await wallet.get(username);
      return !!identity;
    } catch (error) {
      logger.error(`Error checking identity ${username}:`, error);
      return false;
    }
  }

  // Remove identity from wallet
  async removeIdentity(username) {
    try {
      const wallet = await this.getWallet();
      await wallet.remove(username);
      logger.info(`Identity ${username} removed from wallet`);
      return true;
    } catch (error) {
      logger.error(`Error removing identity ${username}:`, error);
      throw error;
    }
  }

  // List all identities in wallet
  async listIdentities() {
    try {
      const wallet = await this.getWallet();
      const identities = await wallet.list();
      return identities;
    } catch (error) {
      logger.error("Error listing identities:", error);
      throw error;
    }
  }

  // Export identity
  async exportIdentity(username) {
    try {
      const identity = await this.getIdentity(username);

      return {
        username: username,
        mspId: identity.mspId,
        type: identity.type,
        certificate: identity.credentials.certificate,
        // Note: privateKey should be handled securely
        hasPrivateKey: !!identity.credentials.privateKey,
      };
    } catch (error) {
      logger.error(`Error exporting identity ${username}:`, error);
      throw error;
    }
  }

  // Import identity
  async importIdentity(username, certificate, privateKey, mspId = null) {
    try {
      const wallet = await this.getWallet();

      const x509Identity = {
        credentials: {
          certificate: certificate,
          privateKey: privateKey,
        },
        mspId: mspId || this.mspId,
        type: "X.509",
      };

      await wallet.put(username, x509Identity);
      logger.info(`Identity ${username} imported to wallet`);

      return true;
    } catch (error) {
      logger.error(`Error importing identity ${username}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new WalletManager();
