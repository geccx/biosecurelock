const db = require("../models/mysql.models");
const logger = require("../utils/logger");
const tuyaService = require("../services/tuya.service");
const fabricService = require("../services/fabric.service");

/**
 * Get system configuration
 */
exports.getConfig = async (req, res) => {
  try {
    const [configs] = await db.query("SELECT * FROM system_config LIMIT 1");

    if (configs.length === 0) {
      // Return default config if none exists
      return res.json({
        success: true,
        data: {
          lockStatus: "locked",
          autoLockEnabled: true,
          maxAccessAttempts: 3,
          sessionTimeout: 30,
          notificationsEnabled: true,
          blockchainEnabled: true,
        },
      });
    }

    const config = configs[0];
    res.json({
      success: true,
      data: {
        lockStatus: config.lock_status,
        autoLockEnabled: config.auto_lock_enabled === 1,
        maxAccessAttempts: config.max_access_attempts,
        sessionTimeout: config.session_timeout,
        notificationsEnabled: config.notifications_enabled === 1,
        blockchainEnabled: config.blockchain_enabled === 1,
      },
    });
  } catch (error) {
    logger.error("Error fetching system config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch system configuration",
    });
  }
};

/**
 * Update system configuration
 */
exports.updateConfig = async (req, res) => {
  try {
    const {
      lockStatus,
      autoLockEnabled,
      maxAccessAttempts,
      sessionTimeout,
      notificationsEnabled,
      blockchainEnabled,
    } = req.body;

    // Check if config exists
    const [existing] = await db.query("SELECT id FROM system_config LIMIT 1");

    if (existing.length === 0) {
      // Create new config
      await db.query(
        `INSERT INTO system_config 
         (lock_status, auto_lock_enabled, max_access_attempts, session_timeout, 
          notifications_enabled, blockchain_enabled, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          lockStatus || "locked",
          autoLockEnabled !== undefined ? autoLockEnabled : true,
          maxAccessAttempts || 3,
          sessionTimeout || 30,
          notificationsEnabled !== undefined ? notificationsEnabled : true,
          blockchainEnabled !== undefined ? blockchainEnabled : true,
        ]
      );
    } else {
      // Update existing config
      const updates = [];
      const params = [];

      if (lockStatus !== undefined) {
        updates.push("lock_status = ?");
        params.push(lockStatus);
      }
      if (autoLockEnabled !== undefined) {
        updates.push("auto_lock_enabled = ?");
        params.push(autoLockEnabled);
      }
      if (maxAccessAttempts !== undefined) {
        updates.push("max_access_attempts = ?");
        params.push(maxAccessAttempts);
      }
      if (sessionTimeout !== undefined) {
        updates.push("session_timeout = ?");
        params.push(sessionTimeout);
      }
      if (notificationsEnabled !== undefined) {
        updates.push("notifications_enabled = ?");
        params.push(notificationsEnabled);
      }
      if (blockchainEnabled !== undefined) {
        updates.push("blockchain_enabled = ?");
        params.push(blockchainEnabled);
      }

      if (updates.length > 0) {
        updates.push("updated_at = NOW()");
        params.push(existing[0].id);

        await db.query(
          `UPDATE system_config SET ${updates.join(", ")} WHERE id = ?`,
          params
        );
      }
    }

    logger.info("System configuration updated", { updatedBy: req.user.id });

    res.json({
      success: true,
      message: "System configuration updated successfully",
    });
  } catch (error) {
    logger.error("Error updating system config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update system configuration",
    });
  }
};

/**
 * Get blockchain statistics
 */
exports.getBlockchainStats = async (req, res) => {
  try {
    // Get total access logs (blocks)
    const [totalResult] = await db.query(
      "SELECT COUNT(*) as count FROM access_logs WHERE blockchain_hash IS NOT NULL"
    );

    // Get last block timestamp
    const [lastBlock] = await db.query(
      "SELECT timestamp FROM access_logs WHERE blockchain_hash IS NOT NULL ORDER BY timestamp DESC LIMIT 1"
    );

    res.json({
      success: true,
      data: {
        totalBlocks: totalResult[0].count,
        networkStatus: "active",
        lastBlockTime: lastBlock[0]?.timestamp || null,
      },
    });
  } catch (error) {
    logger.error("Error fetching blockchain stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch blockchain statistics",
    });
  }
};

/**
 * Get device status (online/offline)
 * GET /config/device/:deviceId/status
 */
exports.getDeviceStatus = async (req, res) => {
  try {
    const { deviceId } = req.params;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: "Device ID is required",
      });
    }

    // Get device from database
    const [devices] = await db.query(
      "SELECT * FROM devices WHERE tuya_device_id = ? OR id = ? LIMIT 1",
      [deviceId, deviceId]
    );

    if (devices.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Device not found",
      });
    }

    const device = devices[0];
    const tuyaDeviceId = device.tuya_device_id || deviceId;

    // Get device details from Tuya API (includes online property)
    let status = "offline";
    let deviceDetails = null;

    try {
      const tuyaResponse = await tuyaService.getDeviceInfoById(tuyaDeviceId);

      // Extract device details from response
      if (tuyaResponse && tuyaResponse.result) {
        deviceDetails = tuyaResponse.result;
        // Use the online property from the device details response
        status = deviceDetails.online === true ? "online" : "offline";
      } else {
        deviceDetails = tuyaResponse;
        // Fallback: if response structure is different, try to extract online
        if (tuyaResponse && tuyaResponse.online !== undefined) {
          status = tuyaResponse.online === true ? "online" : "offline";
        }
      }
    } catch (tuyaError) {
      logger.warn(
        `Failed to get device details for ${tuyaDeviceId}:`,
        tuyaError
      );
      status = "error";
    }

    res.json({
      success: true,
      data: {
        deviceId: device.id.toString(),
        tuyaDeviceId: tuyaDeviceId,
        deviceName: device.device_name,
        location: device.location,
        status: status,
        deviceDetails: deviceDetails,
        lastChecked: new Date(),
      },
    });
  } catch (error) {
    logger.error("Error fetching device status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch device status",
      details: error.message,
    });
  }
};

/**
 * Get device from .env file
 * GET /config/device/env
 */
exports.getDeviceFromEnv = async (req, res) => {
  try {
    const tuyaDeviceId = process.env.TUYA_DEVICE_ID;

    if (!tuyaDeviceId) {
      return res.status(404).json({
        success: false,
        error: "No device ID found in environment variables",
      });
    }

    // Try to get device from database first
    const [devices] = await db.query(
      "SELECT * FROM devices WHERE tuya_device_id = ? LIMIT 1",
      [tuyaDeviceId]
    );

    let device = null;
    if (devices.length > 0) {
      device = devices[0];
    } else {
      // Create a default device object if not in database
      device = {
        id: null,
        device_name: "Smart Door Lock",
        location: "Main Entrance",
        tuya_device_id: tuyaDeviceId,
        type: "lock",
      };
    }

    // Get device details from Tuya API (includes online property)
    let deviceDetails = null;
    let status = "offline";

    try {
      const tuyaResponse = await tuyaService.getDeviceInfoById(tuyaDeviceId);

      // Extract device details from response
      if (tuyaResponse && tuyaResponse.result) {
        deviceDetails = tuyaResponse.result;
        // Use the online property from the device details response
        status = deviceDetails.online === true ? "online" : "offline";
      } else {
        deviceDetails = tuyaResponse;
        // Fallback: if response structure is different, try to extract online
        if (tuyaResponse && tuyaResponse.online !== undefined) {
          status = tuyaResponse.online === true ? "online" : "offline";
        }
      }
    } catch (tuyaError) {
      logger.warn(
        `Failed to get device details from Tuya for ${tuyaDeviceId}:`,
        tuyaError
      );
      status = "error";
    }

    res.json({
      success: true,
      data: {
        id: device.id ? device.id.toString() : tuyaDeviceId,
        deviceId: device.id ? device.id.toString() : tuyaDeviceId,
        tuyaDeviceId: tuyaDeviceId,
        deviceName: device.device_name || "Smart Door Lock",
        location: device.location || "Main Entrance",
        type: device.type || "lock",
        status: status,
        deviceDetails: deviceDetails,
        lastChecked: new Date(),
      },
    });
  } catch (error) {
    logger.error("Error fetching device from env:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch device from environment",
      details: error.message,
    });
  }
};

/**
 * Get device details using GET /v1.0/devices/{device_id}
 * GET /config/device/:deviceId/details
 */
exports.getDeviceDetails = async (req, res) => {
  try {
    const { deviceId } = req.params;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: "Device ID is required",
      });
    }

    // Get device from database
    const [devices] = await db.query(
      "SELECT * FROM devices WHERE tuya_device_id = ? OR id = ? LIMIT 1",
      [deviceId, deviceId]
    );

    let device = null;
    let tuyaDeviceId = deviceId;

    if (devices.length > 0) {
      device = devices[0];
      tuyaDeviceId = device.tuya_device_id || deviceId;
    } else {
      // If device not in database, use the deviceId directly (from .env)
      // Create a mock device object for response
      device = {
        id: null,
        device_name: "Smart Door Lock",
        location: "Main Entrance",
        tuya_device_id: deviceId,
      };
      tuyaDeviceId = deviceId;
    }

    // Get device details from Tuya API using GET /v1.0/devices/{device_id}
    let deviceDetails = null;
    try {
      const tuyaResponse = await tuyaService.getDeviceInfoById(tuyaDeviceId);

      // The response should have a result object with device details
      if (tuyaResponse && tuyaResponse.result) {
        deviceDetails = tuyaResponse.result;
      } else {
        deviceDetails = tuyaResponse;
      }
    } catch (tuyaError) {
      logger.warn(
        `Failed to get device details for ${tuyaDeviceId}:`,
        tuyaError
      );
      return res.status(500).json({
        success: false,
        error: "Failed to fetch device details from Tuya",
        details: tuyaError.message,
      });
    }

    res.json({
      success: true,
      data: {
        deviceId: device.id ? device.id.toString() : tuyaDeviceId,
        tuyaDeviceId: tuyaDeviceId,
        deviceName: device.device_name || "Smart Door Lock",
        location: device.location || "Main Entrance",
        deviceDetails: deviceDetails,
        lastChecked: new Date(),
      },
    });
  } catch (error) {
    logger.error("Error fetching device details:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch device details",
      details: error.message,
    });
  }
};

/**
 * Unlock device without password (Admin and TechSupport only)
 * POST /config/device/:deviceId/unlock
 */
exports.unlockDevice = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { deviceId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!deviceId) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: "Device ID is required",
      });
    }

    // Use deviceId directly to unlock device via Tuya API
    // POST /v1.0/smart-lock/devices/{device_id}/password-free/door-operate
    let tuyaResult;
    try {
      tuyaResult = await tuyaService.remoteUnlockNoPassword(deviceId);
      logger.info("Device unlocked successfully via password-free unlock", {
        deviceId: deviceId,
        unlockedBy: userId,
        userRole: userRole,
      });
    } catch (tuyaError) {
      await connection.rollback();
      logger.error("Failed to unlock device via Tuya API:", tuyaError);
      return res.status(500).json({
        success: false,
        error: "Failed to unlock device",
        details: tuyaError.message,
      });
    }

    // Log access on Fabric blockchain
    let fabricResult = null;
    try {
      fabricResult = await fabricService.logAccess(
        Date.now(),
        userId,
        "remote",
        "unlock",
        true,
        {
          method: "password_free",
          timestamp: new Date().toISOString(),
          deviceId: deviceId,
        }
      );
    } catch (fabricError) {
      logger.warn("Failed to log access on Fabric blockchain:", fabricError);
      // Continue even if blockchain logging fails
    }

    // Log in MySQL
    await connection.query(
      `INSERT INTO access_logs 
       (user_id, access_method, access_type, success, ip_address, fabric_tx_id, device_response, timestamp) 
       VALUES (?, 'remote', 'unlock', true, ?, ?, ?, NOW())`,
      [userId, req.ip, fabricResult?.txId || null, JSON.stringify(tuyaResult)]
    );

    // Log system activity
    await connection.query(
      `INSERT INTO system_logs (event_type, user_id, details, timestamp)
       VALUES ('device_unlocked', ?, ?, NOW())`,
      [
        userId,
        JSON.stringify({
          deviceId: deviceId,
          method: "password_free",
          unlockedBy: userRole,
          fabricTxId: fabricResult?.txId || null,
        }),
      ]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Device unlocked successfully",
      data: {
        deviceId: deviceId,
        timestamp: new Date().toISOString(),
        fabricTxId: fabricResult?.txId || null,
        tuyaResponse: tuyaResult,
      },
    });
  } catch (error) {
    await connection.rollback();
    logger.error("Error unlocking device:", error);
    res.status(500).json({
      success: false,
      error: "Failed to unlock device",
      details: error.message,
    });
  } finally {
    connection.release();
  }
};

/**
 * Lock device (Admin and TechSupport only)
 * POST /config/device/:deviceId/lock
 */
exports.lockDevice = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { deviceId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!deviceId) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: "Device ID is required",
      });
    }

    // Use deviceId directly to lock device via Tuya API
    // POST /v1.0/smart-lock/devices/{device_id}/password-free/door-operate
    let tuyaResult;
    try {
      tuyaResult = await tuyaService.remoteLock(deviceId);
      logger.info("Device locked successfully via password-free lock", {
        deviceId: deviceId,
        lockedBy: userId,
        userRole: userRole,
      });
    } catch (tuyaError) {
      await connection.rollback();
      logger.error("Failed to lock device via Tuya API:", tuyaError);
      return res.status(500).json({
        success: false,
        error: "Failed to lock device",
        details: tuyaError.message,
      });
    }

    // Log access on Fabric blockchain
    let fabricResult = null;
    try {
      fabricResult = await fabricService.logAccess(
        Date.now(),
        userId,
        "remote",
        "lock",
        true,
        {
          method: "remote_lock",
          timestamp: new Date().toISOString(),
          deviceId: deviceId,
        }
      );
    } catch (fabricError) {
      logger.warn("Failed to log access on Fabric blockchain:", fabricError);
    }

    // Log in MySQL
    await connection.query(
      `INSERT INTO access_logs 
       (user_id, access_method, access_type, success, ip_address, fabric_tx_id, device_response, timestamp) 
       VALUES (?, 'remote', 'lock', true, ?, ?, ?, NOW())`,
      [userId, req.ip, fabricResult?.txId || null, JSON.stringify(tuyaResult)]
    );

    // Log system activity
    await connection.query(
      `INSERT INTO system_logs (event_type, user_id, details, timestamp)
       VALUES ('device_locked', ?, ?, NOW())`,
      [
        userId,
        JSON.stringify({
          deviceId: deviceId,
          method: "remote_lock",
          lockedBy: userRole,
          fabricTxId: fabricResult?.txId || null,
        }),
      ]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Device lock command sent successfully",
      data: {
        deviceId: deviceId,
        timestamp: new Date().toISOString(),
        fabricTxId: fabricResult?.txId || null,
        tuyaResponse: tuyaResult,
      },
    });
  } catch (error) {
    await connection.rollback();
    logger.error("Error locking device:", error);
    res.status(500).json({
      success: false,
      error: "Failed to lock device",
      details: error.message,
    });
  } finally {
    connection.release();
  }
};
