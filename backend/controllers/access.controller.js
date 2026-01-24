const tuyaService = require("../services/tuya.service");
const tuyaIntegration = require("../services/tuya-integration.service");
const fabricService = require("../services/fabric.service");
const schedulerService = require("../services/scheduler.service");
const db = require("../models/mysql.models");
const logger = require("../utils/logger");
const { createSystemLog } = require("../utils/logging.utils");

class AccessController {
  /**
   * Remote unlock door
   * Admin/TechSupport can unlock remotely
   */
  async unlockDoor(req, res) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const { password, method, labName = "Laboratory" } = req.body;
      const userId = req.user.id;

      // Check permission via Hyperledger Fabric
      const permission = await fabricService.checkAccessPermission(
        userId,
        "remote_unlock"
      );

      if (!permission.allowed) {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions for remote unlock",
          fabricCheck: permission,
        });
      }

      // For teachers, verify schedule
      const [users] = await db.query("SELECT role FROM users WHERE id = ?", [
        userId,
      ]);
      if (users.length > 0 && users[0].role === "teacher") {
        const scheduleCheck = await tuyaIntegration.verifyScheduleAccess(
          userId,
          labName
        );
        if (!scheduleCheck.allowed) {
          return res.status(403).json({
            success: false,
            error: scheduleCheck.reason || "No valid schedule for current time",
          });
        }
      }

      // Perform unlock via Tuya
      let tuyaResult;
      if (method === "passwordFree") {
        tuyaResult = await tuyaService.remoteUnlockNoPassword();
      } else {
        if (!password) {
          return res.status(400).json({
            success: false,
            error: "Password required for PIN unlock",
          });
        }
        tuyaResult = await tuyaService.remoteUnlock(password);
      }

      // Log access on Fabric blockchain
      const fabricResult = await fabricService.logAccess(
        Date.now(),
        userId,
        "remote",
        "unlock",
        true,
        {
          method: method || "pin",
          timestamp: new Date().toISOString(),
          labName,
        }
      );

      // Log in MySQL
      await connection.query(
        `INSERT INTO access_logs 
         (user_id, access_method, access_type, success, ip_address, fabric_tx_id, device_response, timestamp) 
         VALUES (?, 'remote', 'unlock', true, ?, ?, ?, NOW())`,
        [userId, req.ip, fabricResult?.txId || null, JSON.stringify(tuyaResult)]
      );

      // Log system activity with user level information
      await createSystemLog("remote_unlock", req.user, {
        eventDescription: `User ${userId} performed remote unlock`,
        details: { method, ipAddress: req.ip, labName },
        fabricTxId: fabricResult?.txId || null,
        connection: connection,
      });

      await connection.commit();

      logger.info("Remote unlock successful", {
        userId,
        method,
        fabricTxId: fabricResult?.txId,
      });

      res.json({
        success: true,
        message: "Door unlocked successfully",
        data: {
          timestamp: new Date().toISOString(),
          fabricTxId: fabricResult?.txId,
          tuyaResponse: tuyaResult,
        },
      });
    } catch (error) {
      await connection.rollback();
      logger.error("Error unlocking door:", error);

      // Log failed attempt
      try {
        await connection.query(
          `INSERT INTO access_logs 
           (user_id, access_method, access_type, success, reason_for_denial, ip_address, device_response, timestamp) 
           VALUES (?, 'remote', 'unlock', false, ?, ?, ?, NOW())`,
          [
            req.user.id, 
            req.ip, 
            error.message || "Remote unlock failed",
            JSON.stringify({ error: error.message })
          ]
        );
        await connection.commit();
      } catch (logError) {
        logger.error("Error logging failed unlock:", logError);
      }

      res.status(500).json({
        success: false,
        error: "Failed to unlock door",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Handle physical access attempt (fingerprint/RFID/PIN at device)
   * This is called by the Tuya webhook when user unlocks at device
   */
  async handlePhysicalAccess(req, res) {
    try {
      const { userId, accessMethod, labName = "Laboratory" } = req.body;

      // Verify user exists
      const [users] = await db.query(
        "SELECT role, status FROM users WHERE id = ?",
        [userId]
      );
      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      const user = users[0];

      // Check if user is active
      if (user.status !== "active") {
        await tuyaIntegration.handleAccessAttempt(userId, accessMethod, false, {
          reason: "User account is inactive",
        });
        return res.status(403).json({
          success: false,
          error: "User account is inactive",
        });
      }

      // Verify schedule for teachers
      if (user.role === "teacher") {
        const scheduleCheck = await tuyaIntegration.verifyScheduleAccess(
          userId,
          labName
        );
        if (!scheduleCheck.allowed) {
          await tuyaIntegration.handleAccessAttempt(
            userId,
            accessMethod,
            false,
            {
              reason: scheduleCheck.reason,
            }
          );
          return res.status(403).json({
            success: false,
            error: scheduleCheck.reason || "No valid schedule for current time",
          });
        }
      }

      // Log successful access
      const result = await tuyaIntegration.handleAccessAttempt(
        userId,
        accessMethod,
        true,
        {
          labName,
          ipAddress: req.ip,
        }
      );

      // Log to blockchain
      try {
        await fabricService.logAccess(
          Date.now(),
          userId,
          accessMethod,
          "unlock",
          true,
          {
            labName,
            source: "physical_device",
          }
        );
      } catch (fabricError) {
        logger.error("Error logging to blockchain:", fabricError);
      }

      res.json({
        success: true,
        message: "Access granted",
        data: {
          userId,
          accessMethod,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Error handling physical access:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process access attempt",
      });
    }
  }

  /**
   * Get dynamic password (valid for 5 minutes)
   * All authorized users can generate
   */
  async getDynamicPassword(req, res) {
    try {
      const userId = req.user.id;

      // Check permission
      const permission = await fabricService.checkAccessPermission(
        userId,
        "unlock"
      );

      if (!permission.allowed) {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions",
        });
      }

      // For teachers, verify schedule
      const [users] = await db.query("SELECT role FROM users WHERE id = ?", [
        userId,
      ]);
      if (users.length > 0 && users[0].role === "teacher") {
        const scheduleCheck = await tuyaIntegration.verifyScheduleAccess(
          userId,
          "Laboratory"
        );
        if (!scheduleCheck.allowed) {
          return res.status(403).json({
            success: false,
            error: scheduleCheck.reason || "No valid schedule for current time",
          });
        }
      }

      const result = await tuyaService.getDynamicPassword();

      // Log the generation
      await db.query(
        // Log with user level information
        await createSystemLog("dynamic_password_generated", req.user, {
          eventDescription: `Dynamic password generated for user ${userId}`,
          details: { passwordId: result.password_id },
        })
      );

      logger.info("Dynamic password generated", { userId });

      res.json({
        success: true,
        message: "Dynamic password generated (valid for 5 minutes)",
        data: result,
      });
    } catch (error) {
      logger.error("Error generating dynamic password:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate dynamic password",
      });
    }
  }

  /**
   * Create temporary password
   * Admin only
   */
  async createTempPassword(req, res) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const {
        name,
        password,
        validFrom,
        validUntil,
        maxUsage = 1,
        targetUserId,
      } = req.body;

      const creatorId = req.user.id;

      // Create in Tuya
      // The createTempPassword service method automatically:
      // 1. Gets a password ticket (ticket_id and encrypted ticket_key)
      // 2. Decrypts ticket_key using Access Secret (AES-256-ECB)
      // 3. Encrypts the plain password using decrypted ticket_key (AES-128-ECB with PKCS7Padding)
      // 4. Creates the temporary password with ticket_id and encrypted password
      // Prepare request data for logging
      const requestData = {
        name,
        password: password, // Plain password (6-7 digits) - will be encrypted automatically
        password_type: "ticket", // Uses ticket-based encryption
        effective_time: Math.floor(new Date(validFrom).getTime() / 1000),
        invalid_time: Math.floor(new Date(validUntil).getTime() / 1000),
        type: maxUsage === 1 ? 1 : 0, // 1 = once, 0 = multiple uses
      };

      const tuyaResult = await tuyaService.createTempPassword(requestData);

      // Log the response from Tuya API
      logger.info("Tuya createTempPassword response received", {
        tuyaResult: tuyaResult,
        fullResponse: JSON.stringify(tuyaResult, null, 2),
      });
      console.log("\n[Access Controller] Tuya createTempPassword Response:");
      console.log(JSON.stringify(tuyaResult, null, 2));

      // Store in MySQL
      const [result] = await connection.query(
        `INSERT INTO temporary_passwords 
         (name, password_hash, tuya_password_id, valid_from, valid_until, max_usage, current_usage, target_user_id, created_by, is_active, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, true, NOW())`,
        [
          name,
          password, // In production, hash this
          tuyaResult.password_id || tuyaResult.id,
          validFrom,
          validUntil,
          maxUsage,
          targetUserId || creatorId,
          creatorId,
        ]
      );

      // Log activity
      // Log with user level information
      await createSystemLog("temp_password_created", req.user, {
        eventDescription: `Temporary password "${name}" created`,
        details: {
          passwordId: result.insertId,
          tuyaPasswordId: tuyaResult.password_id || tuyaResult.id,
          validFrom,
          validUntil,
        },
        connection: connection,
      });

      await connection.commit();

      logger.info("Temporary password created", {
        passwordId: result.insertId,
        creatorId,
      });

      // Extract debug info if present
      const debugInfo = tuyaResult._debug || {};
      const cleanResult = { ...tuyaResult };
      delete cleanResult._debug;

      // Build response with all debug information
      const responseData = {
        success: true,
        message: "Temporary password created successfully",
        data: {
          id: result.insertId, // Changed from passwordId to id to match frontend expectation
          passwordId: result.insertId, // Keep for backward compatibility
          tuyaPasswordId: tuyaResult.password_id || tuyaResult.id,
          name,
          validFrom,
          validUntil,
        },
        // Include full Tuya API response for debugging
        tuyaResponse: {
          success: true,
          t: Date.now(),
          result: cleanResult,
        },
        // Include request payload for debugging
        debug: {
          requestPayload: debugInfo.requestPayload || null,
          deviceId: debugInfo.deviceId || null,
          requestData: {
            name: requestData.name,
            password_type: requestData.password_type,
            effective_time: requestData.effective_time,
            invalid_time: requestData.invalid_time,
            type: requestData.type,
            // Don't include plain password in response for security
            password: "***REDACTED***",
          },
        },
      };

      // Log the response being sent to frontend
      console.log("\n[Access Controller] Response being sent to frontend:");
      console.log(JSON.stringify(responseData, null, 2));

      res.json(responseData);
    } catch (error) {
      await connection.rollback();
      logger.error("Error creating temporary password:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create temporary password",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Get access logs (with filters)
   * Admin/TechSupport: All logs
   * Teacher: Own logs only
   */
  async getAccessLogs(req, res) {
    try {
      let {
        userId,
        startDate,
        endDate,
        accessMethod,
        success,
        limit = 50,
        offset = 0,
      } = req.query;

      const requesterId = req.user.id;

      // Teachers can only see their own logs
      if (req.user.role === "teacher") {
        userId = requesterId.toString();
      }

      // Check permission - users can see their own logs, admins/techsupport can see all
      if (
        userId &&
        parseInt(userId) !== requesterId &&
        req.user.role !== "admin" &&
        req.user.role !== "techsupport"
      ) {
        return res.status(403).json({
          success: false,
          error: "Unauthorized to view these logs",
        });
      }

      // Build query
      let query = `
        SELECT al.*, u.username, u.email, l.name as lab_name
        FROM access_logs al
        LEFT JOIN users u ON al.user_id = u.id
        LEFT JOIN laboratories l ON al.laboratory_id = l.id
        WHERE 1=1
      `;
      const params = [];

      if (userId) {
        query += " AND al.user_id = ?";
        params.push(userId);
      }

      if (startDate) {
        query += " AND al.timestamp >= ?";
        params.push(startDate);
      }

      if (endDate) {
        query += " AND al.timestamp <= ?";
        params.push(endDate);
      }

      if (accessMethod) {
        query += " AND al.access_method = ?";
        params.push(accessMethod);
      }

      if (success !== undefined) {
        query += " AND al.success = ?";
        params.push(success === "true" || success === true);
      }

      query += " ORDER BY al.timestamp DESC LIMIT ? OFFSET ?";
      params.push(parseInt(limit), parseInt(offset));

      const [logs] = await db.query(query, params);

      // Get total count
      let countQuery = "SELECT COUNT(*) as total FROM access_logs al WHERE 1=1";
      const countParams = [];

      if (userId) {
        countQuery += " AND al.user_id = ?";
        countParams.push(userId);
      }

      const [countResult] = await db.query(countQuery, countParams);

      res.json({
        success: true,
        data: logs.map((log) => ({
          id: log.id.toString(),
          userId: log.user_id?.toString(),
          username: log.username,
          labName: log.lab_name || "Laboratory",
          timestamp: log.timestamp,
          method: log.access_method,
          status: log.success ? "granted" : "denied",
          blockchainHash: log.blockchain_hash,
          ipAddress: log.ip_address,
        })),
        pagination: {
          total: countResult[0].total,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      logger.error("Error fetching access logs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch access logs",
      });
    }
  }

  /**
   * Get system activity logs
   * Admin/TechSupport only
   */
  async getSystemLogs(req, res) {
    try {
      const {
        eventType,
        startDate,
        endDate,
        userId,
        limit = 50,
        offset = 0,
      } = req.query;

      let query = "SELECT * FROM system_logs WHERE 1=1";
      const params = [];

      if (eventType) {
        query += " AND event_type = ?";
        params.push(eventType);
      }

      if (userId) {
        query += " AND user_id = ?";
        params.push(userId);
      }

      if (startDate) {
        query += " AND timestamp >= ?";
        params.push(startDate);
      }

      if (endDate) {
        query += " AND timestamp <= ?";
        params.push(endDate);
      }

      query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
      params.push(parseInt(limit), parseInt(offset));

      const [logs] = await db.query(query, params);

      res.json({
        success: true,
        data: logs,
      });
    } catch (error) {
      logger.error("Error fetching system logs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch system logs",
      });
    }
  }

  /**
   * Get access statistics
   * Admin/TechSupport: All stats
   * Teacher: Own stats only
   */
  async getAccessStats(req, res) {
    try {
      let { userId, period = "7days" } = req.query;
      const requesterId = req.user.id;

      // Teachers can only view their own stats
      if (req.user.role === "teacher") {
        userId = requesterId.toString();
      }

      // Check permission
      if (
        userId &&
        parseInt(userId) !== requesterId &&
        req.user.role !== "admin" &&
        req.user.role !== "techsupport"
      ) {
        return res.status(403).json({
          success: false,
          error: "Unauthorized",
        });
      }

      const periodMap = {
        "24hours": "DATE_SUB(NOW(), INTERVAL 1 DAY)",
        "7days": "DATE_SUB(NOW(), INTERVAL 7 DAY)",
        "30days": "DATE_SUB(NOW(), INTERVAL 30 DAY)",
        "90days": "DATE_SUB(NOW(), INTERVAL 90 DAY)",
      };

      const dateFilter = periodMap[period] || periodMap["7days"];
      const userFilter = userId ? "AND user_id = ?" : "";
      const params = userId ? [userId, userId, userId] : [];

      // Total accesses
      const [totalAccess] = await db.query(
        `SELECT COUNT(*) as total, 
         SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
         SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
         FROM access_logs 
         WHERE timestamp >= ${dateFilter} ${userFilter}`,
        params[0] ? [params[0]] : []
      );

      // Access by method
      const [byMethod] = await db.query(
        `SELECT access_method, COUNT(*) as count 
         FROM access_logs 
         WHERE timestamp >= ${dateFilter} ${userFilter}
         GROUP BY access_method`,
        params[1] ? [params[1]] : []
      );

      // Access by day
      const [byDay] = await db.query(
        `SELECT DATE(timestamp) as date, 
         COUNT(*) as count,
         SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful
         FROM access_logs 
         WHERE timestamp >= ${dateFilter} ${userFilter}
         GROUP BY DATE(timestamp)
         ORDER BY date DESC`,
        params[2] ? [params[2]] : []
      );

      res.json({
        success: true,
        data: {
          period,
          summary: totalAccess[0],
          byMethod,
          byDay,
        },
      });
    } catch (error) {
      logger.error("Error fetching access stats:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch statistics",
      });
    }
  }

  /**
   * Create access schedule
   * Admin only
   */
  async createSchedule(req, res) {
    try {
      const { name, daysOfWeek, startTime, endTime, autoUnlock } = req.body;
      const userId = req.user.id;

      // Validate time format (HH:MM)
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        return res.status(400).json({
          success: false,
          error: "Invalid time format. Use HH:MM",
        });
      }

      const schedule = await schedulerService.createSchedule({
        userId,
        name,
        daysOfWeek,
        startTime,
        endTime,
        autoUnlock: autoUnlock || false,
      });

      logger.info("Schedule created", {
        scheduleId: schedule.scheduleId,
        userId,
      });

      res.status(201).json({
        success: true,
        message: "Schedule created successfully",
        data: schedule,
      });
    } catch (error) {
      logger.error("Error creating schedule:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create schedule",
      });
    }
  }

  /**
   * Get user schedules
   * Admin: All schedules
   * Teacher: Own schedules only
   */
  async getUserSchedules(req, res) {
    try {
      const userId = req.params.userId || req.user.id;
      const requesterId = req.user.id;

      // Check permission
      if (
        parseInt(userId) !== requesterId &&
        req.user.role !== "admin" &&
        req.user.role !== "techsupport"
      ) {
        return res.status(403).json({
          success: false,
          error: "Unauthorized",
        });
      }

      const schedules = await schedulerService.getUserSchedules(userId);

      res.json({
        success: true,
        data: schedules,
      });
    } catch (error) {
      logger.error("Error fetching schedules:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch schedules",
      });
    }
  }

  /**
   * Update schedule
   * Admin only
   */
  async updateSchedule(req, res) {
    try {
      const { scheduleId } = req.params;
      const updateData = req.body;
      const userId = req.user.id;

      // Only admins can update schedules
      if (req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Only admins can update schedules",
        });
      }

      const schedule = await schedulerService.updateSchedule(
        scheduleId,
        updateData
      );

      res.json({
        success: true,
        message: "Schedule updated successfully",
        data: schedule,
      });
    } catch (error) {
      logger.error("Error updating schedule:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update schedule",
      });
    }
  }

  /**
   * Delete schedule
   * Admin only
   */
  async deleteSchedule(req, res) {
    try {
      const { scheduleId } = req.params;

      // Only admins can delete schedules
      if (req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Only admins can delete schedules",
        });
      }

      await schedulerService.deleteSchedule(scheduleId);

      res.json({
        success: true,
        message: "Schedule deleted successfully",
      });
    } catch (error) {
      logger.error("Error deleting schedule:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete schedule",
      });
    }
  }

  /**
   * Emergency unlock door (Admin/TechSupport override)
   * This bypasses all schedule checks and access rules
   * Must require authentication and EMERGENCY_OVERRIDE permission
   * Must be logged with reason and timestamp
   * Does not permanently alter scheduled access rules
   */
  async emergencyUnlock(req, res) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const { reason, deviceId, labName = "Laboratory" } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;

      // Validate reason is provided
      if (!reason || reason.trim().length === 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: "Reason is required for emergency unlock",
        });
      }

      // Get device ID (from body or use default from env)
      const targetDeviceId = deviceId || process.env.TUYA_DEVICE_ID;
      if (!targetDeviceId) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: "Device ID is required",
        });
      }

      // Perform emergency unlock via Tuya API (bypasses all schedule checks)
      let tuyaResult;
      try {
        tuyaResult = await tuyaService.remoteUnlockNoPassword(targetDeviceId);
        logger.info("Emergency unlock successful", {
          deviceId: targetDeviceId,
          unlockedBy: userId,
          userRole: userRole,
          reason: reason,
        });
      } catch (tuyaError) {
        await connection.rollback();
        logger.error("Failed to perform emergency unlock via Tuya API:", tuyaError);
        return res.status(500).json({
          success: false,
          error: "Failed to perform emergency unlock",
          details: tuyaError.message,
        });
      }

      // Log access on Fabric blockchain with emergency override flag
      let fabricResult = null;
      try {
        fabricResult = await fabricService.logAccess(
          Date.now(),
          userId,
          "emergency_override",
          "unlock",
          true,
          {
            method: "emergency_override",
            timestamp: new Date().toISOString(),
            deviceId: targetDeviceId,
            labName: labName,
            reason: reason,
            overrideType: "emergency_unlock",
          }
        );
      } catch (fabricError) {
        logger.warn("Failed to log emergency unlock on Fabric blockchain:", fabricError);
        // Continue even if blockchain logging fails
      }

      // Log in MySQL with emergency override details
      await connection.query(
        `INSERT INTO access_logs 
         (user_id, access_method, access_type, success, ip_address, fabric_tx_id, device_response, details, timestamp) 
         VALUES (?, 'emergency_override', 'unlock', true, ?, ?, ?, ?, NOW())`,
        [
          userId,
          req.ip,
          fabricResult?.txId || null,
          JSON.stringify(tuyaResult),
          JSON.stringify({
            reason: reason,
            overrideType: "emergency_unlock",
            userRole: userRole,
            deviceId: targetDeviceId,
            labName: labName,
            timestamp: new Date().toISOString(),
          }),
        ]
      );

      // Log system activity with user level information
      await createSystemLog("emergency_unlock", req.user, {
        eventDescription: `Emergency unlock performed by user ${userId} (${userRole})`,
        details: {
          reason: reason,
          deviceId: targetDeviceId,
          labName: labName,
          ipAddress: req.ip,
          overrideType: "emergency_unlock",
        },
        fabricTxId: fabricResult?.txId || null,
        connection: connection,
      });

      await connection.commit();

      logger.info("Emergency unlock successful", {
        userId,
        userRole,
        reason,
        deviceId: targetDeviceId,
        fabricTxId: fabricResult?.txId,
      });

      res.json({
        success: true,
        message: "Emergency unlock performed successfully",
        data: {
          timestamp: new Date().toISOString(),
          reason: reason,
          deviceId: targetDeviceId,
          fabricTxId: fabricResult?.txId,
          tuyaResponse: tuyaResult,
        },
      });
    } catch (error) {
      await connection.rollback();
      logger.error("Error performing emergency unlock:", error);

      // Log failed attempt
      try {
        await connection.query(
          `INSERT INTO access_logs 
           (user_id, access_method, access_type, success, reason_for_denial, ip_address, device_response, details, timestamp) 
           VALUES (?, 'emergency_override', 'unlock', false, ?, ?, ?, ?, NOW())`,
          [
            req.user.id,
            req.ip,
            error.message || "Emergency unlock failed",
            JSON.stringify({ error: error.message }),
            JSON.stringify({
              reason: req.body.reason || "Unknown",
              overrideType: "emergency_unlock",
              userRole: req.user.role,
              timestamp: new Date().toISOString(),
            }),
          ]
        );
        await connection.commit();
      } catch (logError) {
        logger.error("Error logging failed emergency unlock:", logError);
      }

      res.status(500).json({
        success: false,
        error: "Failed to perform emergency unlock",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }
}

module.exports = new AccessController();
