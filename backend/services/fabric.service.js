const { Gateway, Wallets } = require("fabric-network");
const FabricCAServices = require("fabric-ca-client");
const path = require("path");
const fs = require("fs");

class FabricService {
  constructor() {
    this.channelName = process.env.FABRIC_CHANNEL_NAME || "mychannel";
    this.chaincodeName = process.env.FABRIC_CHAINCODE_NAME || "doorlockcc";
    this.mspId = process.env.FABRIC_MSP_ID || "Org1MSP";
    this.walletPath = path.resolve(
      __dirname,
      process.env.FABRIC_WALLET_PATH || "./fabric/wallet"
    );
    this.connectionProfilePath = path.resolve(
      __dirname,
      process.env.FABRIC_CONNECTION_PROFILE || "./fabric/connection-profile.json"
    );
    this.gateway = null;
    this.wallet = null;
    this.contract = null;
  }

  // Resolve certificate paths in connection profile to absolute paths
  resolveConnectionProfilePaths(connectionProfile) {
    const profileDir = path.dirname(this.connectionProfilePath);
    const resolvedProfile = JSON.parse(JSON.stringify(connectionProfile));

    // Resolve peer certificate paths
    if (resolvedProfile.peers) {
      Object.keys(resolvedProfile.peers).forEach((peerName) => {
        const peer = resolvedProfile.peers[peerName];
        if (peer.tlsCACerts && peer.tlsCACerts.path) {
          peer.tlsCACerts.path = path.resolve(profileDir, peer.tlsCACerts.path);
        }
      });
    }

    // Resolve orderer certificate paths
    if (resolvedProfile.orderers) {
      Object.keys(resolvedProfile.orderers).forEach((ordererName) => {
        const orderer = resolvedProfile.orderers[ordererName];
        if (orderer.tlsCACerts && orderer.tlsCACerts.path) {
          orderer.tlsCACerts.path = path.resolve(profileDir, orderer.tlsCACerts.path);
        }
      });
    }

    // Resolve certificate authority paths
    if (resolvedProfile.certificateAuthorities) {
      Object.keys(resolvedProfile.certificateAuthorities).forEach((caName) => {
        const ca = resolvedProfile.certificateAuthorities[caName];
        if (ca.tlsCACerts && ca.tlsCACerts.path) {
          ca.tlsCACerts.path = path.resolve(profileDir, ca.tlsCACerts.path);
        }
      });
    }

    return resolvedProfile;
  }

  // Initialize Fabric connection
  async initialize() {
    try {
      // Create wallet
      this.wallet = await Wallets.newFileSystemWallet(this.walletPath);

      // Load connection profile
      const connectionProfile = JSON.parse(
        fs.readFileSync(this.connectionProfilePath, "utf8")
      );

      // Resolve certificate paths to absolute paths
      const resolvedConnectionProfile =
        this.resolveConnectionProfilePaths(connectionProfile);

      // Check if admin identity exists
      const adminIdentity = await this.wallet.get("admin");
      if (!adminIdentity) {
        console.log("Admin identity not found. Please enroll admin first.");
        await this.enrollAdmin(resolvedConnectionProfile);
      }

      // Connect to gateway
      // Disable discovery to avoid access denied errors, but this means event services won't work
      this.gateway = new Gateway();
      await this.gateway.connect(resolvedConnectionProfile, {
        wallet: this.wallet,
        identity: "admin",
        discovery: { enabled: false, asLocalhost: false },
      });
      console.log("Connected to gateway (discovery disabled, using explicit peer configuration)");

      // Get network and contract
      try {
        console.log(`Attempting to access channel: ${this.channelName}`);
        const network = await this.gateway.getNetwork(this.channelName);
        this.contract = network.getContract(this.chaincodeName);
        console.log(`✓ Fabric service initialized successfully on channel: ${this.channelName}`);
        console.log(`  Note: Event services may show warnings when discovery is disabled (non-critical)`);
      } catch (networkError) {
        console.error(`✗ Failed to access channel "${this.channelName}":`, networkError.message);
        console.error("\nTroubleshooting steps:");
        console.error("  1. Verify the channel exists on your AWS instance:");
        console.error("     SSH to AWS and run: peer channel list");
        console.error("  2. Check if peer is joined to the channel:");
        console.error("     peer channel getinfo -c " + this.channelName);
        console.error("  3. Verify channel name matches (current: " + this.channelName + ")");
        console.error("     Update FABRIC_CHANNEL_NAME in .env if different");
        console.error("  4. Ensure admin identity has proper MSP permissions");
        console.error("  5. Check if the channel was created and peer joined during network setup");
        throw new Error(`Cannot access channel "${this.channelName}": ${networkError.message}`);
      }
    } catch (error) {
      console.error("Error initializing Fabric service:", error);
      throw error;
    }
  }

  // Enroll admin
  async enrollAdmin(connectionProfile) {
    try {
      const caInfo =
        connectionProfile.certificateAuthorities["ca.org1.example.com"];
      const ca = new FabricCAServices(caInfo.url);

      const enrollment = await ca.enroll({
        enrollmentID: "admin",
        enrollmentSecret: "adminpw",
      });

      const x509Identity = {
        credentials: {
          certificate: enrollment.certificate,
          privateKey: enrollment.key.toBytes(),
        },
        mspId: this.mspId,
        type: "X.509",
      };

      await this.wallet.put("admin", x509Identity);
      console.log("Admin enrolled successfully");
    } catch (error) {
      console.error("Error enrolling admin:", error);
      throw error;
    }
  }

  // Register and enroll user
  async registerUser(username, role = "client") {
    try {
      // Check if user already exists
      const userIdentity = await this.wallet.get(username);
      if (userIdentity) {
        return { success: true, message: "User already enrolled" };
      }

      // Get admin identity
      const adminIdentity = await this.wallet.get("admin");
      if (!adminIdentity) {
        throw new Error("Admin identity not found");
      }

      // Connect as admin
      const provider = this.wallet
        .getProviderRegistry()
        .getProvider(adminIdentity.type);
      const adminUser = await provider.getUserContext(adminIdentity, "admin");

      // Get CA
      const connectionProfile = JSON.parse(
        fs.readFileSync(this.connectionProfilePath, "utf8")
      );
      const resolvedConnectionProfile =
        this.resolveConnectionProfilePaths(connectionProfile);
      const caInfo =
        resolvedConnectionProfile.certificateAuthorities["ca.org1.example.com"];
      const ca = new FabricCAServices(caInfo.url);

      // Register user
      const secret = await ca.register(
        {
          affiliation: "org1.department1",
          enrollmentID: username,
          role: role,
          attrs: [{ name: "role", value: role, ecert: true }],
        },
        adminUser
      );

      // Enroll user
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

      await this.wallet.put(username, x509Identity);

      return {
        success: true,
        message: "User registered and enrolled successfully",
        username,
        fabricIdentity: x509Identity.credentials.certificate,
      };
    } catch (error) {
      console.error("Error registering user:", error);
      throw error;
    }
  }

  // Execute transaction with identity
  async executeTransaction(identityName, functionName, ...args) {
    try {
      // Get user identity
      const identity = await this.wallet.get(identityName);
      if (!identity) {
        throw new Error(`Identity ${identityName} not found`);
      }

      // Connect with user identity
      const gateway = new Gateway();
      const connectionProfile = JSON.parse(
        fs.readFileSync(this.connectionProfilePath, "utf8")
      );
      const resolvedConnectionProfile =
        this.resolveConnectionProfilePaths(connectionProfile);

      // Try with discovery, fallback to no discovery if it fails
      try {
        await gateway.connect(resolvedConnectionProfile, {
          wallet: this.wallet,
          identity: identityName,
          discovery: { enabled: true, asLocalhost: false },
        });
      } catch (discoveryError) {
        console.warn(`Discovery failed for ${identityName}, trying without discovery`);
        await gateway.connect(resolvedConnectionProfile, {
          wallet: this.wallet,
          identity: identityName,
          discovery: { enabled: false, asLocalhost: false },
        });
      }

      const network = await gateway.getNetwork(this.channelName);
      const contract = network.getContract(this.chaincodeName);

      // Submit transaction
      const result = await contract.submitTransaction(functionName, ...args);

      await gateway.disconnect();

      return result.toString() ? JSON.parse(result.toString()) : null;
    } catch (error) {
      console.error("Error executing transaction:", error);
      throw error;
    }
  }

  // Query ledger
  async queryLedger(functionName, ...args) {
    try {
      if (!this.contract) {
        await this.initialize();
      }

      const result = await this.contract.evaluateTransaction(
        functionName,
        ...args
      );
      
      // Return the raw string result, let the caller parse it
      return result.toString();
    } catch (error) {
      console.error(`Error querying ledger function '${functionName}':`, error);
      throw error;
    }
  }

  // Submit transaction
  async submitTransaction(functionName, ...args) {
    try {
      if (!this.contract) {
        await this.initialize();
      }

      const result = await this.contract.submitTransaction(
        functionName,
        ...args
      );
      return result.toString() ? JSON.parse(result.toString()) : null;
    } catch (error) {
      console.error("Error submitting transaction:", error);
      throw error;
    }
  }

  // Register user on blockchain
  async registerUserOnChain(userId, username, email, role, fabricIdentity) {
    return await this.submitTransaction(
      "registerUser",
      userId.toString(),
      username,
      email,
      role,
      fabricIdentity
    );
  }

  // Request enrollment approval
  async requestEnrollment(
    enrollmentId,
    userId,
    enrollmentType,
    enrollmentData
  ) {
    return await this.submitTransaction(
      "requestEnrollment",
      enrollmentId.toString(),
      userId.toString(),
      enrollmentType,
      JSON.stringify(enrollmentData)
    );
  }

  // Approve enrollment
  async approveEnrollment(enrollmentId, approverId) {
    return await this.submitTransaction(
      "approveEnrollment",
      enrollmentId.toString(),
      approverId.toString()
    );
  }

  // Reject enrollment
  async rejectEnrollment(enrollmentId, rejecterId, reason) {
    return await this.submitTransaction(
      "rejectEnrollment",
      enrollmentId.toString(),
      rejecterId.toString(),
      reason
    );
  }

  // Check access permission
  async checkAccessPermission(userId, accessType) {
    return await this.queryLedger(
      "checkAccessPermission",
      userId.toString(),
      accessType
    );
  }

  // Log access attempt
  async logAccess(
    accessLogId,
    userId,
    accessMethod,
    accessType,
    success,
    metadata
  ) {
    return await this.submitTransaction(
      "logAccess",
      accessLogId.toString(),
      userId.toString(),
      accessMethod,
      accessType,
      success.toString(),
      JSON.stringify(metadata || {})
    );
  }

  // Get user from blockchain
  async getUser(userId) {
    return await this.queryLedger("getUser", userId.toString());
  }

  // Get enrollment details
  async getEnrollment(enrollmentId) {
    return await this.queryLedger("getEnrollment", enrollmentId.toString());
  }

  // Get pending enrollments
  async getPendingEnrollments() {
    return await this.queryLedger("getPendingEnrollments");
  }

  // Get access logs
  async getAccessLogs(userId, startDate, endDate) {
    const args = [userId.toString()];
    if (startDate) args.push(startDate);
    if (endDate) args.push(endDate);

    return await this.queryLedger("getAccessLogs", ...args);
  }

  // Update user permissions
  async updateUserPermissions(userId, permissions, updaterId) {
    return await this.submitTransaction(
      "updateUserPermissions",
      userId.toString(),
      JSON.stringify(permissions),
      updaterId.toString()
    );
  }

  // Deactivate user
  async deactivateUser(userId, deactivatorId) {
    return await this.submitTransaction(
      "deactivateUser",
      userId.toString(),
      deactivatorId.toString()
    );
  }

  // Get all blockchain activities
  async getAllActivities(startDate, endDate, limit) {
    const args = [];
    if (startDate) args.push(startDate);
    if (endDate) args.push(endDate);
    if (limit) args.push(limit.toString());

    return await this.queryLedger("getAllActivities", ...args);
  }

  // Listen to chaincode events
  async addContractListener(eventName, callback) {
    try {
      if (!this.contract) {
        await this.initialize();
      }

      await this.contract.addContractListener(eventName, callback);
      console.log(`Listening to event: ${eventName}`);
    } catch (error) {
      // Event listeners may fail when discovery is disabled (No targets provided)
      // This is not critical for basic operations, so we log but don't throw
      console.warn(`Warning: Could not add event listener for ${eventName}:`, error.message);
      console.warn("Event listeners are disabled when discovery is off. This is non-critical.");
    }
  }

  // Remove contract listener
  async removeContractListener(eventName) {
    try {
      if (this.contract) {
        this.contract.removeContractListener(eventName);
      }
    } catch (error) {
      console.error("Error removing contract listener:", error);
    }
  }

  // Disconnect
  async disconnect() {
    if (this.gateway) {
      await this.gateway.disconnect();
      console.log("Fabric gateway disconnected");
    }
  }
}

module.exports = new FabricService();
