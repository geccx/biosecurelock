const tuyaService = require("./tuya.service");
const db = require("../models/mysql.models");
const logger = require("../utils/logger");

/**
 * Tuya Integration Service
 * Handles integration between our system and Tuya Smart Lock APIs
 *
 * References:
 * - Smart Door Lock: https://developer.tuya.com/en/docs/cloud/smart-door-lock?id=K9jgsgd4cgysr
 * - User Package: https://developer.tuya.com/en/docs/iot/authentication-user-package?id=Kdjhfzvkrkkm3
 */
class TuyaIntegrationService {
  /**
   * Sync user enrollment with Tuya device
   * Maps our enrollment to Tuya unlock methods
   */
  async syncUserEnrollment(userId, enrollmentType, enrollmentData) {
    try {
      const [users] = await db.query("SELECT * FROM users WHERE id = ?", [
        userId,
      ]);
      if (users.length === 0) {
        throw new Error("User not found");
      }

      const user = users[0];

      switch (enrollmentType) {
        case "fingerprint":
          return await this._syncFingerprintEnrollment(userId, enrollmentData);
        case "rfid":
          return await this._syncRFIDEnrollment(userId, enrollmentData);
        case "pin":
          return await this._syncPINEnrollment(userId, enrollmentData);
        default:
          throw new Error(`Unsupported enrollment type: ${enrollmentType}`);
      }
    } catch (error) {
      logger.error("Error syncing enrollment with Tuya:", error);
      throw error;
    }
  }

  /**
   * Sync fingerprint enrollment
   * After physical enrollment at device, sync with Tuya
   */
  async _syncFingerprintEnrollment(userId, enrollmentData) {
    try {
      // Get unassigned fingerprint keys from Tuya
      const unassignedKeys = await tuyaService.getUnassignedKeys();

      // Find fingerprint keys
      const fingerprintKeys = unassignedKeys.filter(
        (key) => key.unlock_type === "fingerprint" || key.type === "fingerprint"
      );

      if (fingerprintKeys.length === 0) {
        throw new Error("No unassigned fingerprint slots available");
      }

      // Assign first available fingerprint to user
      const fingerprintKey = fingerprintKeys[0];
      const result = await tuyaService.assignUnlockingMethod(
        userId.toString(),
        "fingerprint",
        fingerprintKey.unlock_sn ||
          fingerprintKey.unlock_id ||
          fingerprintKey.id
      );

      // Update enrollment with Tuya unlock ID
      await db.query(
        `UPDATE enrollments 
         SET tuya_unlock_id = ?, status = 'synced' 
         WHERE user_id = ? AND enrollment_type = 'fingerprint' AND status = 'approved'`,
        [fingerprintKey.unlock_id || fingerprintKey.id, userId]
      );

      logger.info("Fingerprint enrollment synced with Tuya", {
        userId,
        tuyaUnlockId: fingerprintKey.unlock_id || fingerprintKey.id,
      });

      return {
        success: true,
        tuyaUnlockId: fingerprintKey.unlock_id || fingerprintKey.id,
        unlockType: "fingerprint",
      };
    } catch (error) {
      logger.error("Error syncing fingerprint:", error);
      throw error;
    }
  }

  /**
   * Sync RFID enrollment
   */
  async _syncRFIDEnrollment(userId, enrollmentData) {
    try {
      const unassignedKeys = await tuyaService.getUnassignedKeys();
      const rfidKeys = unassignedKeys.filter(
        (key) =>
          key.unlock_type === "rfid" ||
          key.type === "rfid" ||
          key.unlock_type === "card"
      );

      if (rfidKeys.length === 0) {
        throw new Error("No unassigned RFID slots available");
      }

      const rfidKey = rfidKeys[0];
      const result = await tuyaService.assignUnlockingMethod(
        userId.toString(),
        "rfid",
        rfidKey.unlock_sn || rfidKey.unlock_id || rfidKey.id
      );

      await db.query(
        `UPDATE enrollments 
         SET tuya_unlock_id = ?, status = 'synced' 
         WHERE user_id = ? AND enrollment_type = 'rfid' AND status = 'approved'`,
        [rfidKey.unlock_id || rfidKey.id, userId]
      );

      logger.info("RFID enrollment synced with Tuya", {
        userId,
        tuyaUnlockId: rfidKey.unlock_id || rfidKey.id,
      });

      return {
        success: true,
        tuyaUnlockId: rfidKey.unlock_id || rfidKey.id,
        unlockType: "rfid",
      };
    } catch (error) {
      logger.error("Error syncing RFID:", error);
      throw error;
    }
  }

  /**
   * Sync PIN enrollment
   * Creates permanent PIN in Tuya
   */
  async _syncPINEnrollment(userId, enrollmentData) {
    try {
      const pin = enrollmentData.pin || enrollmentData.value;
      if (!pin) {
        throw new Error("PIN not provided in enrollment data");
      }

      // Create permanent PIN in Tuya
      const result = await tuyaService.createTempPassword({
        password: pin,
        name: `User_${userId}_PIN`,
        type: "permanent", // Permanent PIN
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year
      });

      await db.query(
        `UPDATE enrollments 
         SET tuya_unlock_id = ?, status = 'synced' 
         WHERE user_id = ? AND enrollment_type = 'pin' AND status = 'approved'`,
        [result.password_id || result.id, userId]
      );

      logger.info("PIN enrollment synced with Tuya", {
        userId,
        tuyaPasswordId: result.password_id || result.id,
      });

      return {
        success: true,
        tuyaPasswordId: result.password_id || result.id,
        unlockType: "pin",
      };
    } catch (error) {
      logger.error("Error syncing PIN:", error);
      throw error;
    }
  }

  /**
   * Handle access attempt (fingerprint/RFID/PIN)
   * Called when user attempts to unlock via physical device
   */
  async handleAccessAttempt(userId, accessMethod, success, metadata = {}) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Get user's enrollment for this method
      const [enrollments] = await connection.query(
        `SELECT * FROM enrollments 
         WHERE user_id = ? AND enrollment_type = ? AND status = 'synced'`,
        [userId, accessMethod]
      );

      if (enrollments.length === 0 && accessMethod !== "remote") {
        logger.warn("Access attempt with no enrollment", {
          userId,
          accessMethod,
        });
      }

      // Log access attempt
      const reasonForDenial = !success 
        ? (metadata.reason || metadata.reasonForDenial || "Access denied by device")
        : null;
      
      const [logResult] = await connection.query(
        `INSERT INTO access_logs 
         (user_id, access_method, access_type, success, reason_for_denial, ip_address, details, timestamp) 
         VALUES (?, ?, 'unlock', ?, ?, ?, ?, NOW())`,
        [
          userId,
          accessMethod,
          success ? 1 : 0,
          reasonForDenial,
          metadata.ipAddress || null,
          JSON.stringify(metadata),
        ]
      );

      await connection.commit();

      return {
        success: true,
        logId: logResult.insertId,
      };
    } catch (error) {
      await connection.rollback();
      logger.error("Error handling access attempt:", error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Sync unlock records from Tuya to local database
   * Called periodically to sync physical unlock events
   */
  async syncUnlockRecords(startTime, endTime) {
    try {
      const records = await tuyaService.getUnlockRecords({
        startTime: Math.floor(startTime / 1000),
        endTime: Math.floor(endTime / 1000),
        limit: 100,
      });

      if (!records || !records.list || records.list.length === 0) {
        return { synced: 0, records: [] };
      }

      const connection = await db.getConnection();
      const syncedRecords = [];

      try {
        await connection.beginTransaction();

        for (const record of records.list) {
          // Check if already synced
          const [existing] = await connection.query(
            `SELECT id FROM access_logs 
             WHERE tuya_unlock_id = ? AND timestamp = FROM_UNIXTIME(?)`,
            [
              record.unlock_id || record.id,
              record.unlock_time || record.timestamp,
            ]
          );

          if (existing.length > 0) {
            continue; // Already synced
          }

          // Map Tuya unlock method to our system
          const accessMethod = this._mapTuyaUnlockMethod(
            record.unlock_mode || record.method
          );

          // Try to find user by unlock ID
          const [enrollments] = await connection.query(
            `SELECT user_id FROM enrollments 
             WHERE tuya_unlock_id = ? AND status = 'synced'`,
            [record.unlock_id || record.unlock_name_value]
          );

          const userId = enrollments.length > 0 ? enrollments[0].user_id : null;

          // Insert log
          await connection.query(
            `INSERT INTO access_logs 
             (user_id, access_method, access_type, success, timestamp, details, tuya_unlock_id) 
             VALUES (?, ?, 'unlock', ?, FROM_UNIXTIME(?), ?, ?)`,
            [
              userId,
              accessMethod,
              record.success !== false ? 1 : 0,
              record.unlock_time || record.timestamp,
              JSON.stringify(record),
              record.unlock_id || record.id,
            ]
          );

          syncedRecords.push({
            tuyaUnlockId: record.unlock_id || record.id,
            userId,
            accessMethod,
            timestamp: record.unlock_time || record.timestamp,
          });
        }

        await connection.commit();

        logger.info(`Synced ${syncedRecords.length} unlock records from Tuya`);

        return {
          synced: syncedRecords.length,
          records: syncedRecords,
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error("Error syncing unlock records:", error);
      throw error;
    }
  }

  /**
   * Map Tuya unlock method to our system
   */
  _mapTuyaUnlockMethod(tuyaMethod) {
    const methodMap = {
      1: "fingerprint",
      2: "pin",
      3: "rfid",
      4: "key",
      5: "remote",
      6: "temporary_password",
      7: "dynamic_password",
      fingerprint: "fingerprint",
      password: "pin",
      pin: "pin",
      card: "rfid",
      rfid: "rfid",
      key: "key",
      app: "remote",
      remote: "remote",
    };

    return methodMap[tuyaMethod] || "unknown";
  }

  /**
   * Get user's unlock methods from Tuya
   */
  async getUserUnlockMethods(userId) {
    try {
      const [enrollments] = await db.query(
        `SELECT enrollment_type, tuya_unlock_id, status 
         FROM enrollments 
         WHERE user_id = ? AND status = 'synced'`,
        [userId]
      );

      const unlockMethods = [];

      for (const enrollment of enrollments) {
        if (enrollment.tuya_unlock_id) {
          unlockMethods.push({
            type: enrollment.enrollment_type,
            tuyaUnlockId: enrollment.tuya_unlock_id,
            status: enrollment.status,
          });
        }
      }

      return unlockMethods;
    } catch (error) {
      logger.error("Error getting user unlock methods:", error);
      throw error;
    }
  }

  /**
   * Delete user enrollment from Tuya
   */
  async deleteUserEnrollment(userId, enrollmentType) {
    try {
      const [enrollments] = await db.query(
        `SELECT tuya_unlock_id FROM enrollments 
         WHERE user_id = ? AND enrollment_type = ? AND status = 'synced'`,
        [userId, enrollmentType]
      );

      if (enrollments.length === 0) {
        return { success: true, message: "No enrollment to delete" };
      }

      const enrollment = enrollments[0];

      if (enrollmentType === "pin") {
        // Delete temporary password
        await tuyaService.deleteTempPassword(enrollment.tuya_unlock_id);
      } else {
        // Delete unlock method
        await tuyaService.deleteUnlockMethod(
          enrollmentType,
          enrollment.tuya_unlock_id,
          "home_user",
          userId.toString()
        );
      }

      // Update enrollment status
      await db.query(
        `UPDATE enrollments SET status = 'deleted' WHERE user_id = ? AND enrollment_type = ?`,
        [userId, enrollmentType]
      );

      logger.info("User enrollment deleted from Tuya", {
        userId,
        enrollmentType,
      });

      return { success: true };
    } catch (error) {
      logger.error("Error deleting user enrollment:", error);
      throw error;
    }
  }

  /**
   * Verify user has valid schedule before allowing access
   */
  async verifyScheduleAccess(userId, labName) {
    try {
      const now = new Date();
      const currentDay = now.toLocaleDateString("en-US", { weekday: "long" });
      const currentTime = now.toTimeString().split(" ")[0].substring(0, 5); // HH:MM

      // Check lab schedules
      const [schedules] = await db.query(
        `SELECT * FROM lab_schedules 
         WHERE teacher_id = ? 
         AND lab_name = ? 
         AND status = 'scheduled'
         AND start_time <= ? 
         AND end_time >= ?`,
        [userId, labName, now, now]
      );

      if (schedules.length > 0) {
        return {
          allowed: true,
          schedule: schedules[0],
          reason: "Valid schedule found",
        };
      }

      // Check access schedules (recurring)
      const [accessSchedules] = await db.query(
        `SELECT * FROM access_schedules 
         WHERE user_id = ? 
         AND is_active = true
         AND JSON_CONTAINS(days_of_week, ?)
         AND start_time <= ? 
         AND end_time >= ?`,
        [userId, JSON.stringify(currentDay), currentTime, currentTime]
      );

      if (accessSchedules.length > 0) {
        return {
          allowed: true,
          schedule: accessSchedules[0],
          reason: "Valid recurring schedule found",
        };
      }

      return {
        allowed: false,
        reason: "No valid schedule found for current time",
      };
    } catch (error) {
      logger.error("Error verifying schedule access:", error);
      return {
        allowed: false,
        reason: "Error checking schedule",
      };
    }
  }

  /**
   * Process physical unlock event from Tuya webhook
   */
  async processUnlockEvent(eventData) {
    try {
      const parsedEvent = tuyaService.parseUnlockEvent(eventData);

      // Find user by unlock ID
      const [enrollments] = await db.query(
        `SELECT user_id FROM enrollments 
         WHERE tuya_unlock_id = ? AND status = 'synced'`,
        [parsedEvent.unlockId]
      );

      if (enrollments.length === 0) {
        logger.warn("Unlock event for unknown user", {
          unlockId: parsedEvent.unlockId,
        });
        return { success: false, reason: "User not found" };
      }

      const userId = enrollments[0].user_id;

      // Verify schedule (for teachers)
      const [users] = await db.query("SELECT role FROM users WHERE id = ?", [
        userId,
      ]);
      if (users.length > 0 && users[0].role === "teacher") {
        const scheduleCheck = await this.verifyScheduleAccess(
          userId,
          "Laboratory"
        );
        if (!scheduleCheck.allowed) {
          // Log denied access
          await this.handleAccessAttempt(
            userId,
            parsedEvent.unlockMethod,
            false,
            {
              reason: scheduleCheck.reason,
              timestamp: new Date(parsedEvent.timestamp),
            }
          );
          return { success: false, reason: scheduleCheck.reason };
        }
      }

      // Log successful access
      await this.handleAccessAttempt(userId, parsedEvent.unlockMethod, true, {
        timestamp: new Date(parsedEvent.timestamp),
        deviceId: parsedEvent.deviceId,
      });

      return {
        success: true,
        userId,
        unlockMethod: parsedEvent.unlockMethod,
      };
    } catch (error) {
      logger.error("Error processing unlock event:", error);
      throw error;
    }
  }
}

module.exports = new TuyaIntegrationService();
