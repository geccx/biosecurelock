module.exports = {
  channelName: process.env.FABRIC_CHANNEL_NAME || "doorchannel",
  chaincodeName: process.env.FABRIC_CHAINCODE_NAME || "doorlockcc",
  mspId: process.env.FABRIC_MSP_ID || "Org1MSP",
  walletPath: process.env.FABRIC_WALLET_PATH || "./fabric/wallet",
  connectionProfilePath:
    process.env.FABRIC_CONNECTION_PROFILE || "./fabric/connection-profile.json",

  // Chaincode functions
  functions: {
    registerUser: "registerUser",
    requestEnrollment: "requestEnrollment",
    approveEnrollment: "approveEnrollment",
    rejectEnrollment: "rejectEnrollment",
    checkAccessPermission: "checkAccessPermission",
    logAccess: "logAccess",
    getUser: "getUser",
    getEnrollment: "getEnrollment",
    getPendingEnrollments: "getPendingEnrollments",
    getAccessLogs: "getAccessLogs",
    updateUserPermissions: "updateUserPermissions",
    deactivateUser: "deactivateUser",
  },
};
