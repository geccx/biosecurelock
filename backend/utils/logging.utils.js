/**
 * Logging utility functions for Hyperledger Fabric best practices
 * Includes user identity, role, and transaction information
 */

const db = require("../models/mysql.models");
const logger = require("./logger");

/**
 * Get user level information for logging
 * @param {Object} user - User object from req.user
 * @returns {Object} User level information
 */
function getUserLevelInfo(user) {
  if (!user) {
    return {
      userId: null,
      username: null,
      role: null,
      email: null,
      userLevel: "anonymous",
    };
  }

  return {
    userId: user.id,
    username: user.username || null,
    role: user.role || null,
    email: user.email || null,
    userLevel: user.role || "unknown",
  };
}

/**
 * Create system log entry with user level information
 * @param {String} eventType - Type of event
 * @param {Object} user - User object from req.user
 * @param {Object} options - Additional options
 * @param {Object} options.details - Additional details to log (will be merged with user info)
 * @param {String} options.eventDescription - Optional event description
 * @param {String} options.fabricTxId - Optional Fabric transaction ID
 * @param {Object} options.connection - Optional database connection for transactions
 * @returns {Promise} Database insert result
 */
async function createSystemLog(eventType, user, options = {}) {
  try {
    const { details = {}, eventDescription = null, fabricTxId = null, connection = null } = options;
    const userInfo = getUserLevelInfo(user);
    
    // Merge user level information into details
    // Include eventDescription and fabricTxId in the details JSON since those columns don't exist in the schema
    const logDetails = {
      ...details,
      userLevel: userInfo.userLevel,
      userId: userInfo.userId,
      username: userInfo.username,
      role: userInfo.role,
      email: userInfo.email,
      timestamp: new Date().toISOString(),
    };

    // Add eventDescription to details if provided
    if (eventDescription !== null) {
      logDetails.eventDescription = eventDescription;
    }

    // Add fabricTxId to details if provided
    if (fabricTxId !== null) {
      logDetails.fabricTxId = fabricTxId;
    }

    // Use provided connection or default db
    const dbConnection = connection || db;

    // Always use standard format with details column (matches the actual database schema)
    const query = `INSERT INTO system_logs (event_type, user_id, details, timestamp)
                   VALUES (?, ?, ?, NOW())`;
    const params = [
      eventType,
      userInfo.userId,
      JSON.stringify(logDetails),
    ];

    const [result] = await dbConnection.query(query, params);

    logger.info("System log created", {
      eventType,
      userId: userInfo.userId,
      userLevel: userInfo.userLevel,
      username: userInfo.username,
      role: userInfo.role,
      logId: result.insertId,
    });

    return result;
  } catch (error) {
    logger.error("Error creating system log:", error);
    throw error;
  }
}

/**
 * Create access log entry with user level information
 * @param {Object} logData - Access log data
 * @param {Object} user - User object from req.user
 * @returns {Promise} Database insert result
 */
async function createAccessLog(logData, user) {
  try {
    const userInfo = getUserLevelInfo(user);
    
    // Add user level info to details if it's a JSON field
    const details = typeof logData.details === 'object' 
      ? {
          ...logData.details,
          userLevel: userInfo.userLevel,
          username: userInfo.username,
          role: userInfo.role,
        }
      : logData.details;

    const [result] = await db.query(
      `INSERT INTO access_logs 
       (user_id, laboratory_id, timestamp, access_method, access_type, success, reason_for_denial,
        blockchain_hash, fabric_tx_id, ip_address, details, device_response, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        userInfo.userId || logData.userId,
        logData.laboratoryId || null,
        logData.timestamp || new Date(),
        logData.accessMethod,
        logData.accessType || 'unlock',
        logData.success !== undefined ? logData.success : true,
        logData.reasonForDenial || logData.reason_for_denial || null,
        logData.blockchainHash || null,
        logData.fabricTxId || null,
        logData.ipAddress || null,
        typeof details === 'object' ? JSON.stringify(details) : details,
        logData.deviceResponse ? JSON.stringify(logData.deviceResponse) : null,
      ]
    );

    logger.info("Access log created", {
      userId: userInfo.userId,
      userLevel: userInfo.userLevel,
      accessMethod: logData.accessMethod,
      success: logData.success,
      logId: result.insertId,
    });

    return result;
  } catch (error) {
    logger.error("Error creating access log:", error);
    throw error;
  }
}

module.exports = {
  getUserLevelInfo,
  createSystemLog,
  createAccessLog,
};

