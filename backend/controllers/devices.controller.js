const db = require("../models/mysql.models");
const tuyaService = require("../services/tuya.service");
const logger = require("../utils/logger");

/**
 * Get all devices
 */
exports.getAllDevices = async (req, res) => {
  try {
    const [devices] = await db.query(
      "SELECT * FROM devices ORDER BY device_name"
    );

    res.json({
      success: true,
      data: devices.map((device) => ({
        id: device.id.toString(),
        deviceName: device.device_name,
        type: device.type,
        status: device.status,
        lastChecked: device.last_checked,
        location: device.location,
        tuyaDeviceId: device.tuya_device_id,
      })),
    });
  } catch (error) {
    logger.error("Error fetching devices:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch devices",
    });
  }
};

/**
 * Get a single device by ID
 */
exports.getDeviceById = async (req, res) => {
  try {
    const { deviceId } = req.params;

    const [devices] = await db.query(
      "SELECT * FROM devices WHERE id = ?",
      [deviceId]
    );

    if (devices.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Device not found",
      });
    }

    const device = devices[0];
    res.json({
      success: true,
      data: {
        id: device.id.toString(),
        deviceName: device.device_name,
        type: device.type,
        status: device.status,
        lastChecked: device.last_checked,
        location: device.location,
        tuyaDeviceId: device.tuya_device_id,
      },
    });
  } catch (error) {
    logger.error("Error fetching device:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch device",
    });
  }
};

/**
 * Create a new device
 */
exports.createDevice = async (req, res) => {
  try {
    const { deviceName, type, location, tuyaDeviceId } = req.body;

    const [result] = await db.query(
      `INSERT INTO devices (device_name, type, status, location, tuya_device_id, last_checked, created_at)
       VALUES (?, ?, 'offline', ?, ?, NOW(), NOW())`,
      [deviceName, type, location, tuyaDeviceId || null]
    );

    logger.info("Device created", { deviceId: result.insertId });

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId.toString(),
        deviceName,
        type,
        status: "offline",
        location,
        tuyaDeviceId,
        lastChecked: new Date(),
      },
    });
  } catch (error) {
    logger.error("Error creating device:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create device",
    });
  }
};

/**
 * Update a device
 */
exports.updateDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { deviceName, type, status, location, tuyaDeviceId } = req.body;

    const updates = [];
    const params = [];

    if (deviceName) {
      updates.push("device_name = ?");
      params.push(deviceName);
    }
    if (type) {
      updates.push("type = ?");
      params.push(type);
    }
    if (status) {
      updates.push("status = ?");
      params.push(status);
    }
    if (location) {
      updates.push("location = ?");
      params.push(location);
    }
    if (tuyaDeviceId !== undefined) {
      updates.push("tuya_device_id = ?");
      params.push(tuyaDeviceId);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No fields to update",
      });
    }

    updates.push("updated_at = NOW()");
    params.push(deviceId);

    await db.query(`UPDATE devices SET ${updates.join(", ")} WHERE id = ?`, params);

    logger.info("Device updated", { deviceId });

    res.json({
      success: true,
      message: "Device updated successfully",
    });
  } catch (error) {
    logger.error("Error updating device:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update device",
    });
  }
};

/**
 * Check device health/status
 */
exports.checkDeviceHealth = async (req, res) => {
  try {
    const { deviceId } = req.params;

    const [devices] = await db.query(
      "SELECT * FROM devices WHERE id = ?",
      [deviceId]
    );

    if (devices.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Device not found",
      });
    }

    const device = devices[0];
    let newStatus = "offline";

    // Try to check device status via Tuya if it has a Tuya device ID
    if (device.tuya_device_id) {
      try {
        const tuyaStatus = await tuyaService.getDeviceStatusById(device.tuya_device_id);
        // Check if device is online - status response format may vary
        if (Array.isArray(tuyaStatus)) {
          // If status is an array, check for online status
          const onlineStatus = tuyaStatus.find(s => s.code === "online" || s.code === "switch");
          newStatus = onlineStatus && onlineStatus.value === true ? "online" : "offline";
        } else if (tuyaStatus.online !== undefined) {
          newStatus = tuyaStatus.online ? "online" : "offline";
        } else {
          // If we got a response, assume online
          newStatus = "online";
        }
      } catch (tuyaError) {
        logger.warn("Failed to check Tuya device status:", tuyaError);
        newStatus = "error";
      }
    } else {
      // For non-Tuya devices, just mark as online (simulated)
      newStatus = "online";
    }

    // Check if status changed to error and notify
    if (newStatus === "error" && device.status !== "error") {
      const notificationService = require("../services/notification.service");
      await notificationService.notifyAdminsAndTechSupport(
        notificationService.NOTIFICATION_TYPES.DEVICE_ERROR,
        "Device Error Detected",
        `Device "${device.device_name}" at ${device.location || "Unknown location"} has encountered an error.`
      );
    }

    // Update device status
    await db.query(
      "UPDATE devices SET status = ?, last_checked = NOW() WHERE id = ?",
      [newStatus, deviceId]
    );

    res.json({
      success: true,
      data: {
        id: deviceId,
        status: newStatus,
        lastChecked: new Date(),
      },
    });
  } catch (error) {
    logger.error("Error checking device health:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check device health",
    });
  }
};

/**
 * Refresh all devices status
 */
exports.refreshAllDevices = async (req, res) => {
  try {
    const [devices] = await db.query("SELECT * FROM devices");

    const results = [];

    for (const device of devices) {
      let newStatus = "online"; // Default to online for simulation

      if (device.tuya_device_id) {
        try {
          const tuyaStatus = await tuyaService.getDeviceStatusById(device.tuya_device_id);
          // Check if device is online - status response format may vary
          if (Array.isArray(tuyaStatus)) {
            const onlineStatus = tuyaStatus.find(s => s.code === "online" || s.code === "switch");
            newStatus = onlineStatus && onlineStatus.value === true ? "online" : "offline";
          } else if (tuyaStatus.online !== undefined) {
            newStatus = tuyaStatus.online ? "online" : "offline";
          } else {
            newStatus = "online";
          }
        } catch (tuyaError) {
          newStatus = "error";
        }
      }

      // Check if status changed to error and notify
      if (newStatus === "error" && device.status !== "error") {
        const notificationService = require("../services/notification.service");
        await notificationService.notifyAdminsAndTechSupport(
          notificationService.NOTIFICATION_TYPES.DEVICE_ERROR,
          "Device Error Detected",
          `Device "${device.device_name}" at ${device.location || "Unknown location"} has encountered an error.`
        );
      }

      await db.query(
        "UPDATE devices SET status = ?, last_checked = NOW() WHERE id = ?",
        [newStatus, device.id]
      );

      results.push({
        id: device.id.toString(),
        deviceName: device.device_name,
        status: newStatus,
        lastChecked: new Date(),
      });
    }

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger.error("Error refreshing devices:", error);
    res.status(500).json({
      success: false,
      error: "Failed to refresh devices",
    });
  }
};

/**
 * Get device status with Tuya details
 * Fetches device status from Tuya API for devices with Tuya device IDs
 */
exports.getDeviceStatusWithTuya = async (req, res) => {
  try {
    // Get all devices from database that have Tuya device IDs
    const [devices] = await db.query(
      "SELECT * FROM devices WHERE tuya_device_id IS NOT NULL AND tuya_device_id != ''"
    );

    const devicesWithStatus = [];

    // Check each device's status via Tuya API
    for (const device of devices) {
      try {
        // Get device status from Tuya
        const tuyaStatus = await tuyaService.getDeviceStatusById(device.tuya_device_id);
        
        // Get device details from Tuya
        let tuyaDetails = null;
        try {
          tuyaDetails = await tuyaService.getDeviceDetailsById(device.tuya_device_id);
        } catch (detailError) {
          logger.warn(`Failed to get device details for ${device.tuya_device_id}:`, detailError);
        }

        // Get device info (legacy endpoint for additional info)
        let tuyaInfo = null;
        try {
          tuyaInfo = await tuyaService.getDeviceInfoById(device.tuya_device_id);
        } catch (infoError) {
          logger.warn(`Failed to get device info for ${device.tuya_device_id}:`, infoError);
        }

        // Determine online status
        let isOnline = false;
        if (Array.isArray(tuyaStatus)) {
          const onlineStatus = tuyaStatus.find(
            (s) => s.code === "online" || s.code === "switch" || s.code === "door_lock_state"
          );
          isOnline = onlineStatus && (onlineStatus.value === true || onlineStatus.value === "online");
        } else if (tuyaStatus.online !== undefined) {
          isOnline = tuyaStatus.online === true;
        } else if (tuyaStatus.state) {
          isOnline = tuyaStatus.state.online === true;
        } else {
          // If we got a response without error, assume online
          isOnline = true;
        }

        // Extract device information
        const deviceData = {
          id: device.id.toString(),
          deviceName: device.device_name,
          type: device.type,
          location: device.location,
          tuyaDeviceId: device.tuya_device_id,
          status: isOnline ? "online" : "offline",
          lastChecked: device.last_checked || new Date(),
          // Tuya-specific information
          tuyaDetails: {
            productName: tuyaDetails?.result?.product_name || tuyaInfo?.name || null,
            productId: tuyaDetails?.result?.product_id || tuyaInfo?.product_id || null,
            deviceName: tuyaDetails?.result?.name || tuyaInfo?.name || null,
            online: isOnline,
            activeTime: tuyaInfo?.active_time || tuyaDetails?.result?.active_time || null,
            timeZone: tuyaInfo?.timezone || tuyaDetails?.result?.timezone || null,
            ip: tuyaInfo?.ip || tuyaDetails?.result?.ip || null,
            localKey: tuyaInfo?.local_key || null,
            category: tuyaInfo?.category || tuyaDetails?.result?.category || null,
            model: tuyaInfo?.model || tuyaDetails?.result?.model || null,
            uuid: tuyaInfo?.uuid || tuyaDetails?.result?.uuid || null,
          },
          // Device status details
          statusDetails: Array.isArray(tuyaStatus) ? tuyaStatus : [],
        };

        devicesWithStatus.push(deviceData);
      } catch (tuyaError) {
        // Include device even if Tuya check fails
        logger.warn(`Failed to check Tuya device ${device.tuya_device_id}:`, tuyaError);
        devicesWithStatus.push({
          id: device.id.toString(),
          deviceName: device.device_name,
          type: device.type,
          location: device.location,
          tuyaDeviceId: device.tuya_device_id,
          status: "error",
          lastChecked: device.last_checked || new Date(),
          tuyaDetails: null,
          statusDetails: [],
          error: tuyaError.message,
        });
      }
    }

    res.json({
      success: true,
      data: devicesWithStatus,
    });
  } catch (error) {
    logger.error("Error fetching device status with Tuya:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch device status",
    });
  }
};

/**
 * Get online smart door locks from Tuya
 * Fetches devices from database, checks their status via Tuya API,
 * and returns only online door locks
 */
exports.getOnlineSmartDoorLocks = async (req, res) => {
  try {
    // Get all devices from database that are door locks and have Tuya device ID
    const [devices] = await db.query(
      "SELECT * FROM devices WHERE type = 'lock' AND tuya_device_id IS NOT NULL AND tuya_device_id != ''"
    );

    const onlineDevices = [];

    // Check each device's status via Tuya API
    for (const device of devices) {
      try {
        // Get device status from Tuya
        const tuyaStatus = await tuyaService.getDeviceStatusById(device.tuya_device_id);
        
        // Get device details to verify it's a door lock
        let deviceDetails = null;
        try {
          deviceDetails = await tuyaService.getDeviceDetailsById(device.tuya_device_id);
        } catch (detailError) {
          logger.warn(`Failed to get device details for ${device.tuya_device_id}:`, detailError);
        }

        // Check if device is online
        let isOnline = false;
        if (Array.isArray(tuyaStatus)) {
          // Status is an array of status objects
          const onlineStatus = tuyaStatus.find(
            (s) => s.code === "online" || s.code === "switch" || s.code === "door_lock_state"
          );
          isOnline = onlineStatus && (onlineStatus.value === true || onlineStatus.value === "online");
        } else if (tuyaStatus.online !== undefined) {
          isOnline = tuyaStatus.online === true;
        } else if (tuyaStatus.state) {
          // Check state object
          isOnline = tuyaStatus.state.online === true;
        } else {
          // If we got a response without error, assume online
          isOnline = true;
        }

        // Only include online devices
        if (isOnline) {
          onlineDevices.push({
            id: device.id.toString(),
            deviceName: device.device_name,
            tuyaDeviceId: device.tuya_device_id,
            location: device.location,
            status: "online",
            lastChecked: device.last_checked || new Date(),
            // Include device details if available
            deviceDetails: deviceDetails || null,
          });
        }
      } catch (tuyaError) {
        // Skip devices that fail Tuya API check
        logger.warn(`Failed to check Tuya device ${device.tuya_device_id}:`, tuyaError);
        continue;
      }
    }

    res.json({
      success: true,
      data: onlineDevices,
    });
  } catch (error) {
    logger.error("Error fetching online smart door locks:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch online smart door locks",
    });
  }
};

/**
 * Troubleshoot device (Tech Support)
 */
exports.troubleshootDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;

    const [devices] = await db.query(
      "SELECT * FROM devices WHERE id = ?",
      [deviceId]
    );

    if (devices.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Device not found",
      });
    }

    const device = devices[0];
    const diagnostics = {
      deviceId: device.id,
      deviceName: device.device_name,
      type: device.type,
      location: device.location,
      currentStatus: device.status,
      lastChecked: device.last_checked,
      checks: [],
    };

    // Perform various diagnostic checks
    // 1. Check device connectivity
    diagnostics.checks.push({
      check: "Device Connectivity",
      status: device.status === "online" ? "PASS" : "FAIL",
      details: device.status === "online" 
        ? "Device is responding" 
        : "Device is not responding",
    });

    // 2. Check Tuya integration
    if (device.tuya_device_id) {
      try {
        const tuyaInfo = await tuyaService.getDeviceInfo();
        diagnostics.checks.push({
          check: "Tuya Integration",
          status: "PASS",
          details: "Tuya API connection successful",
        });
      } catch (tuyaError) {
        diagnostics.checks.push({
          check: "Tuya Integration",
          status: "FAIL",
          details: `Tuya API error: ${tuyaError.message}`,
        });
      }
    } else {
      diagnostics.checks.push({
        check: "Tuya Integration",
        status: "WARNING",
        details: "No Tuya device ID configured",
      });
    }

    // 3. Check last activity
    const [recentLogs] = await db.query(
      `SELECT COUNT(*) as count FROM access_logs 
       WHERE timestamp > DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );
    diagnostics.checks.push({
      check: "Recent Activity",
      status: recentLogs[0].count > 0 ? "PASS" : "WARNING",
      details: `${recentLogs[0].count} access events in last 24 hours`,
    });

    // Log the troubleshooting action
    await db.query(
      `INSERT INTO system_logs (event_type, user_id, details, timestamp)
       VALUES ('device_troubleshoot', ?, ?, NOW())`,
      [req.user.id, JSON.stringify({ deviceId, diagnostics: diagnostics.checks })]
    );

    logger.info("Device troubleshooted", { deviceId, userId: req.user.id });

    res.json({
      success: true,
      data: diagnostics,
    });
  } catch (error) {
    logger.error("Error troubleshooting device:", error);
    res.status(500).json({
      success: false,
      error: "Failed to troubleshoot device",
    });
  }
};

/**
 * Delete a device
 */
exports.deleteDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;

    await db.query("DELETE FROM devices WHERE id = ?", [deviceId]);

    logger.info("Device deleted", { deviceId });

    res.json({
      success: true,
      message: "Device deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting device:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete device",
    });
  }
};

/**
 * Get device logs from Tuya API
 */
exports.getDeviceLogs = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const {
      codes,
      type,
      start_time,
      end_time,
      query_type,
      start_row_key,
      last_row_key,
      last_event_time,
      size,
    } = req.query;

    // Get device from database to find tuya_device_id
    const [devices] = await db.query(
      "SELECT tuya_device_id FROM devices WHERE id = ?",
      [deviceId]
    );

    if (devices.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Device not found",
      });
    }

    const tuyaDeviceId = devices[0].tuya_device_id;

    if (!tuyaDeviceId) {
      return res.status(400).json({
        success: false,
        error: "Device does not have a Tuya device ID",
      });
    }

    // Prepare parameters for Tuya API
    const params = {};
    if (codes) params.codes = codes;
    if (type) params.type = type;
    if (start_time) params.start_time = parseInt(start_time);
    if (end_time) params.end_time = parseInt(end_time);
    if (query_type) params.query_type = parseInt(query_type);
    if (start_row_key) params.start_row_key = start_row_key;
    if (last_row_key) params.last_row_key = last_row_key;
    if (last_event_time) params.last_event_time = parseInt(last_event_time);
    if (size) params.size = parseInt(size);

    // Call Tuya service
    const logs = await tuyaService.getDeviceLogsV1(tuyaDeviceId, params);

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    logger.error("Error fetching device logs:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch device logs",
    });
  }
};

/**
 * Get Tuya device logs using environment variable device ID
 */
exports.getTuyaDeviceLogs = async (req, res) => {
  try {
    const {
      codes,
      type,
      start_time,
      end_time,
      query_type,
      start_row_key,
      last_row_key,
      last_event_time,
      size,
    } = req.query;

    const tuyaDeviceId = process.env.TUYA_DEVICE_ID;

    if (!tuyaDeviceId) {
      return res.status(400).json({
        success: false,
        error: "TUYA_DEVICE_ID not configured",
      });
    }

    // Prepare parameters for Tuya API
    const params = {};
    if (codes) params.codes = codes;
    if (type) params.type = type;
    if (start_time) params.start_time = parseInt(start_time);
    if (end_time) params.end_time = parseInt(end_time);
    if (query_type) params.query_type = parseInt(query_type);
    if (start_row_key) params.start_row_key = start_row_key;
    if (last_row_key) params.last_row_key = last_row_key;
    if (last_event_time) params.last_event_time = parseInt(last_event_time);
    if (size) params.size = parseInt(size);

    // Call Tuya service
    const logs = await tuyaService.getDeviceLogsV1(tuyaDeviceId, params);

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    logger.error("Error fetching Tuya device logs:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch device logs",
    });
  }
};

/**
 * Get Tuya gateway logs using environment variable gateway ID
 */
exports.getTuyaGatewayLogs = async (req, res) => {
  try {
    const {
      codes,
      type,
      start_time,
      end_time,
      query_type,
      start_row_key,
      last_row_key,
      last_event_time,
      size,
    } = req.query;

    const tuyaGatewayId = process.env.TUYA_GATEWAY_ID;

    if (!tuyaGatewayId) {
      return res.status(400).json({
        success: false,
        error: "TUYA_GATEWAY_ID not configured",
      });
    }

    // Prepare parameters for Tuya API
    const params = {};
    if (codes) params.codes = codes;
    if (type) params.type = type;
    if (start_time) params.start_time = parseInt(start_time);
    if (end_time) params.end_time = parseInt(end_time);
    if (query_type) params.query_type = parseInt(query_type);
    if (start_row_key) params.start_row_key = start_row_key;
    if (last_row_key) params.last_row_key = last_row_key;
    if (last_event_time) params.last_event_time = parseInt(last_event_time);
    if (size) params.size = parseInt(size);

    // Call Tuya service
    const logs = await tuyaService.getDeviceLogsV1(tuyaGatewayId, params);

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    logger.error("Error fetching Tuya gateway logs:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch gateway logs",
    });
  }
};

/**
 * Get device status for smart door lock and gateway using GET /v1.0/devices/{device_id}
 * Returns status for both TUYA_DEVICE_ID and TUYA_GATEWAY_ID
 */
exports.getLockAndGatewayStatus = async (req, res) => {
  try {
    const tuyaDeviceId = process.env.TUYA_DEVICE_ID;
    const tuyaGatewayId = process.env.TUYA_GATEWAY_ID;

    const results = {
      smartDoorLock: null,
      gateway: null,
    };

    // Fetch smart door lock status
    if (tuyaDeviceId) {
      try {
        const deviceInfo = await tuyaService.getDeviceInfoById(tuyaDeviceId);
        
        // Log the response properly
        if (deviceInfo && typeof deviceInfo === 'object') {
          logger.info(`Device info response for ${tuyaDeviceId}:`, JSON.stringify(deviceInfo, null, 2));
        } else {
          logger.info(`Device info response for ${tuyaDeviceId}:`, deviceInfo);
        }
        
        if (deviceInfo && deviceInfo.success && deviceInfo.result) {
          const device = deviceInfo.result;
          results.smartDoorLock = {
            id: device.id,
            uuid: device.uuid,
            uid: device.uid,
            bizType: device.biz_type,
            name: device.name,
            timeZone: device.time_zone,
            ip: device.ip,
            localKey: device.local_key,
            sub: device.sub,
            model: device.model,
            createTime: device.create_time,
            updateTime: device.update_time,
            activeTime: device.active_time,
            status: device.status || [],
            ownerId: device.owner_id,
            productId: device.product_id,
            productName: device.product_name,
            category: device.category,
            icon: device.icon,
            online: device.online || false,
            nodeId: device.node_id,
            lat: device.lat,
            lon: device.lon,
          };
        } else if (deviceInfo && !deviceInfo.success) {
          // API returned an error response
          results.smartDoorLock = {
            error: deviceInfo.msg || deviceInfo.error || "API returned an error",
            online: false,
          };
        } else {
          logger.warn(`Unexpected response structure for device ${tuyaDeviceId}:`, deviceInfo);
          results.smartDoorLock = {
            error: "Unexpected response structure from API",
            online: false,
            rawResponse: deviceInfo,
          };
        }
      } catch (deviceError) {
        logger.error(`Error fetching smart door lock status for ${tuyaDeviceId}:`, deviceError);
        results.smartDoorLock = {
          error: deviceError.message || deviceError.toString() || "Failed to fetch device status",
          online: false,
        };
      }
    } else {
      results.smartDoorLock = {
        error: "TUYA_DEVICE_ID not configured",
        online: false,
      };
    }

    // Fetch gateway status
    if (tuyaGatewayId) {
      try {
        const gatewayInfo = await tuyaService.getDeviceInfoById(tuyaGatewayId);
        
        // Log the response properly
        if (gatewayInfo && typeof gatewayInfo === 'object') {
          logger.info(`Gateway info response for ${tuyaGatewayId}:`, JSON.stringify(gatewayInfo, null, 2));
        } else {
          logger.info(`Gateway info response for ${tuyaGatewayId}:`, gatewayInfo);
        }
        
        if (gatewayInfo && gatewayInfo.success && gatewayInfo.result) {
          const gateway = gatewayInfo.result;
          results.gateway = {
            id: gateway.id,
            uuid: gateway.uuid,
            uid: gateway.uid,
            bizType: gateway.biz_type,
            name: gateway.name,
            timeZone: gateway.time_zone,
            ip: gateway.ip,
            localKey: gateway.local_key,
            sub: gateway.sub,
            model: gateway.model,
            createTime: gateway.create_time,
            updateTime: gateway.update_time,
            activeTime: gateway.active_time,
            status: gateway.status || [],
            ownerId: gateway.owner_id,
            productId: gateway.product_id,
            productName: gateway.product_name,
            category: gateway.category,
            icon: gateway.icon,
            online: gateway.online || false,
            nodeId: gateway.node_id,
            lat: gateway.lat,
            lon: gateway.lon,
          };
        } else if (gatewayInfo && !gatewayInfo.success) {
          // API returned an error response
          results.gateway = {
            error: gatewayInfo.msg || gatewayInfo.error || "API returned an error",
            online: false,
          };
        } else {
          logger.warn(`Unexpected response structure for gateway ${tuyaGatewayId}:`, gatewayInfo);
          results.gateway = {
            error: "Unexpected response structure from API",
            online: false,
            rawResponse: gatewayInfo,
          };
        }
      } catch (gatewayError) {
        logger.error(`Error fetching gateway status for ${tuyaGatewayId}:`, gatewayError);
        results.gateway = {
          error: gatewayError.message || gatewayError.toString() || "Failed to fetch gateway status",
          online: false,
        };
      }
    } else {
      results.gateway = {
        error: "TUYA_GATEWAY_ID not configured",
        online: false,
      };
    }

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger.error("Error fetching lock and gateway status:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch device status",
    });
  }
};

