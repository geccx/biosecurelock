const cron = require("node-cron");
const tuyaService = require("./tuya.service");
const fabricService = require("./fabric.service");
const notificationService = require("./notification.service");
const tuyaSync = require("./tuyaSync.service");
const logRetrieval = require("./logRetrieval.service");
const reconciliation = require("./reconciliation.service");
const deviceStatusMonitor = require("./deviceStatusMonitor.service");
const db = require("../models/mysql.models");
const logger = require("../utils/logger");

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
    this.lastDeviceStatus = null;
  }

  // Initialize scheduler
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    logger.info("Initializing scheduler service...");

    // Check schedules every minute
    this.jobs.set(
      "schedule_checker",
      cron.schedule("* * * * *", async () => {
        await this.checkSchedules();
      }),
    );

    // Sync unlock logs every 5 minutes
    this.jobs.set(
      "log_sync",
      cron.schedule("*/5 * * * *", async () => {
        await this.syncUnlockLogs();
      }),
    );

    // Retry pending user creations every 2 minutes
    this.jobs.set(
      "retry_user_creation",
      cron.schedule("*/2 * * * *", async () => {
        await this.retryPendingUserCreations();
      }),
    );

    // Monitor device health and resync users every 3 minutes
    this.jobs.set(
      "device_monitor",
      cron.schedule("*/3 * * * *", async () => {
        await this.monitorDeviceAndResync();
      }),
    );

    // Sync retention: device status every 2 minutes
    this.jobs.set(
      "sync_device_status",
      cron.schedule("*/2 * * * *", async () => {
        try {
          await deviceStatusMonitor.checkAllDevices();
        } catch (err) {
          logger.warn("Sync device status job failed", { error: err.message });
        }
      }),
    );

    // Sync retention: log retrieval from TUYA every 5 minutes
    this.jobs.set(
      "sync_log_retrieval",
      cron.schedule("*/5 * * * *", async () => {
        try {
          await logRetrieval.pollAllDevices();
        } catch (err) {
          logger.warn("Sync log retrieval job failed", { error: err.message });
        }
      }),
    );

    // Sync retention: process sync queue every 10 minutes
    this.jobs.set(
      "sync_queue_process",
      cron.schedule("*/10 * * * *", async () => {
        try {
          await tuyaSync.processSyncQueue();
        } catch (err) {
          logger.warn("Sync queue process job failed", { error: err.message });
        }
      }),
    );

    // Sync retention: reconciliation (gaps + missed events) every 15 minutes
    this.jobs.set(
      "sync_reconciliation",
      cron.schedule("*/15 * * * *", async () => {
        try {
          await reconciliation.runReconciliation();
        } catch (err) {
          logger.warn("Sync reconciliation job failed", { error: err.message });
        }
      }),
    );

    // Sync retention: extended offline alert every 30 minutes
    this.jobs.set(
      "sync_offline_alert",
      cron.schedule("*/30 * * * *", async () => {
        try {
          await deviceStatusMonitor.detectExtendedOfflineAndAlert();
        } catch (err) {
          logger.warn("Sync offline alert job failed", { error: err.message });
        }
      }),
    );

    this.isInitialized = true;
    logger.info("Scheduler service initialized");
  }

  // Check active schedules and auto-unlock if needed
  async checkSchedules() {
    try {
      const now = new Date();
      const currentDay = now.toLocaleDateString("en-US", { weekday: "long" });
      const currentTime = now.toTimeString().split(" ")[0].substring(0, 5); // HH:MM

      // Get active schedules for current day and time
      const [schedules] = await db.query(
        `SELECT s.*, u.username, u.fabric_identity
                FROM access_schedules s
                JOIN users u ON s.user_id = u.id
                WHERE s.is_active = true
                AND JSON_CONTAINS(s.days_of_week, '"${currentDay}"')
                AND s.start_time <= ? 
                AND s.end_time >= ?`,
        [currentTime, currentTime],
      );

      for (const schedule of schedules) {
        // Check if user has permission via Fabric
        const permission = await fabricService.checkAccessPermission(
          schedule.user_id,
          "unlock",
        );

        if (!permission.allowed) {
          logger.warn("User does not have unlock permission", {
            userId: schedule.user_id,
            scheduleId: schedule.id,
          });
          continue;
        }

        // Check if already unlocked in the last minute (prevent duplicates)
        const [recentLogs] = await db.query(
          `SELECT * FROM access_logs 
                    WHERE user_id = ? 
                    AND access_method = 'auto_schedule'
                    AND accessed_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)`,
          [schedule.user_id],
        );

        if (recentLogs.length > 0) {
          continue; // Already processed
        }

        // Auto-unlock if enabled
        if (schedule.auto_unlock) {
          await this.performAutoUnlock(schedule);
        }
      }
    } catch (error) {
      logger.error("Error checking schedules:", error);
    }
  }

  // Perform automatic unlock based on schedule
  async performAutoUnlock(schedule) {
    // Skip if Tuya credentials not configured
    if (
      !process.env.TUYA_CLIENT_ID ||
      !process.env.TUYA_CLIENT_SECRET ||
      !process.env.TUYA_DEVICE_ID
    ) {
      logger.warn("Tuya credentials not configured, skipping auto-unlock");
      return;
    }

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      logger.info("Performing auto-unlock", {
        scheduleId: schedule.id,
        userId: schedule.user_id,
      });

      // Get user's enrollment for unlocking
      const [enrollments] = await connection.query(
        `SELECT * FROM enrollment_requests 
                WHERE user_id = ? 
                AND status = 'approved' 
                AND tuya_unlock_id IS NOT NULL
                LIMIT 1`,
        [schedule.user_id],
      );

      let tuyaResult;
      let unlockMethod = "auto_schedule";

      if (enrollments.length > 0 && enrollments[0].enrollment_type === "pin") {
        // Use PIN to unlock
        const enrollmentData = JSON.parse(enrollments[0].enrollment_data);
        tuyaResult = await tuyaService.remoteUnlock(enrollmentData.pin);
      } else {
        // Use password-free unlock (if supported)
        tuyaResult = await tuyaService.remoteUnlockNoPassword();
      }

      // Log on Fabric
      const fabricResult = await fabricService.logAccess(
        Date.now(),
        schedule.user_id,
        unlockMethod,
        "unlock",
        true,
        {
          scheduleId: schedule.id,
          scheduleName: schedule.schedule_name,
          autoUnlock: true,
        },
      );

      // Log in MySQL
      await connection.query(
        `INSERT INTO access_logs 
                (user_id, access_method, access_type, success, fabric_tx_id, device_response) 
                VALUES (?, ?, 'unlock', true, ?, ?)`,
        [
          schedule.user_id,
          unlockMethod,
          fabricResult?.txId || null,
          JSON.stringify(tuyaResult),
        ],
      );

      // Log system activity
      await connection.query(
        `INSERT INTO system_logs 
                (event_type, event_description, user_id, metadata, fabric_tx_id) 
                VALUES (?, ?, ?, ?, ?)`,
        [
          "auto_unlock",
          `Automatic unlock for schedule: ${schedule.schedule_name}`,
          schedule.user_id,
          JSON.stringify({
            scheduleId: schedule.id,
            scheduleName: schedule.schedule_name,
          }),
          fabricResult?.txId || null,
        ],
      );

      await connection.commit();

      logger.info("Auto-unlock successful", {
        scheduleId: schedule.id,
        userId: schedule.user_id,
      });
    } catch (error) {
      await connection.rollback();
      logger.error("Error performing auto-unlock:", error);

      // Log failed attempt
      try {
        await connection.query(
          `INSERT INTO access_logs 
                    (user_id, access_method, access_type, success, device_response) 
                    VALUES (?, 'auto_schedule', 'unlock', false, ?)`,
          [schedule.user_id, JSON.stringify({ error: error.message })],
        );
        await connection.commit();
      } catch (logError) {
        logger.error("Error logging failed auto-unlock:", logError);
      }
    } finally {
      connection.release();
    }
  }

  // Sync unlock logs from Tuya to local database
  async syncUnlockLogs() {
    // Skip if Tuya credentials not configured
    if (
      !process.env.TUYA_CLIENT_ID ||
      !process.env.TUYA_CLIENT_SECRET ||
      !process.env.TUYA_DEVICE_ID
    ) {
      logger.debug("Tuya credentials not configured, skipping log sync");
      return;
    }

    try {
      logger.info("Syncing unlock logs from Tuya...");

      // Get logs from the last hour
      const endTime = Date.now();
      const startTime = endTime - 60 * 60 * 1000; // 1 hour ago

      const records = await tuyaService.getUnlockRecords({
        startTime: Math.floor(startTime / 1000),
        endTime: Math.floor(endTime / 1000),
        limit: 100,
      });

      if (!records || !records.list || records.list.length === 0) {
        logger.info("No new unlock logs to sync");
        return;
      }

      const connection = await db.getConnection();

      try {
        await connection.beginTransaction();

        for (const record of records.list) {
          // Check if already logged
          const [existing] = await connection.query(
            `SELECT id FROM access_logs 
                        WHERE tuya_unlock_id = ? 
                        AND accessed_at = FROM_UNIXTIME(?)`,
            [record.unlock_id || record.id, record.unlock_time],
          );

          if (existing.length > 0) {
            continue; // Already logged
          }

          // Map unlock method
          const accessMethod = this._mapUnlockMethod(record.unlock_mode);

          // Try to find user by unlock ID
          const [enrollments] = await connection.query(
            `SELECT user_id FROM enrollment_requests 
                        WHERE tuya_unlock_id = ? 
                        AND status = 'approved'`,
            [record.unlock_id || record.unlock_name_value],
          );

          const userId = enrollments.length > 0 ? enrollments[0].user_id : null;

          // Insert log
          await connection.query(
            `INSERT INTO access_logs 
                        (user_id, access_method, access_type, tuya_unlock_id, success, accessed_at, device_response) 
                        VALUES (?, ?, 'unlock', ?, true, FROM_UNIXTIME(?), ?)`,
            [
              userId,
              accessMethod,
              record.unlock_id || record.id,
              record.unlock_time,
              JSON.stringify(record),
            ],
          );

          // Log on Fabric if user identified
          if (userId) {
            try {
              await fabricService.logAccess(
                Date.now(),
                userId,
                accessMethod,
                "unlock",
                true,
                {
                  tuyaUnlockId: record.unlock_id,
                  synced: true,
                },
              );
            } catch (fabricError) {
              logger.error("Error logging to Fabric:", fabricError);
            }
          }
        }

        await connection.commit();
        logger.info(`Synced ${records.list.length} unlock logs`);
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error("Error syncing unlock logs:", error);
    }
  }

  // Map Tuya unlock method to our system
  _mapUnlockMethod(tuyaMethod) {
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
      card: "rfid",
      key: "key",
      app: "remote",
    };

    return methodMap[tuyaMethod] || "unknown";
  }

  // Create or update schedule
  async createSchedule(scheduleData) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `INSERT INTO access_schedules 
                (user_id, schedule_name, days_of_week, start_time, end_time, is_active, auto_unlock) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          scheduleData.userId,
          scheduleData.name,
          JSON.stringify(scheduleData.daysOfWeek),
          scheduleData.startTime,
          scheduleData.endTime,
          scheduleData.isActive !== false,
          scheduleData.autoUnlock || false,
        ],
      );

      const scheduleId = result.insertId;

      // Log activity
      await connection.query(
        `INSERT INTO system_logs 
                (event_type, event_description, user_id, metadata) 
                VALUES (?, ?, ?, ?)`,
        [
          "schedule_created",
          `Schedule ${scheduleData.name} created`,
          scheduleData.userId,
          JSON.stringify({ scheduleId, ...scheduleData }),
        ],
      );

      await connection.commit();

      logger.info("Schedule created", {
        scheduleId,
        userId: scheduleData.userId,
      });

      return { scheduleId, ...scheduleData };
    } catch (error) {
      await connection.rollback();
      logger.error("Error creating schedule:", error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Update schedule
  async updateSchedule(scheduleId, scheduleData) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const updates = [];
      const values = [];

      if (scheduleData.name !== undefined) {
        updates.push("schedule_name = ?");
        values.push(scheduleData.name);
      }
      if (scheduleData.daysOfWeek !== undefined) {
        updates.push("days_of_week = ?");
        values.push(JSON.stringify(scheduleData.daysOfWeek));
      }
      if (scheduleData.startTime !== undefined) {
        updates.push("start_time = ?");
        values.push(scheduleData.startTime);
      }
      if (scheduleData.endTime !== undefined) {
        updates.push("end_time = ?");
        values.push(scheduleData.endTime);
      }
      if (scheduleData.isActive !== undefined) {
        updates.push("is_active = ?");
        values.push(scheduleData.isActive);
      }
      if (scheduleData.autoUnlock !== undefined) {
        updates.push("auto_unlock = ?");
        values.push(scheduleData.autoUnlock);
      }

      values.push(scheduleId);

      await connection.query(
        `UPDATE access_schedules SET ${updates.join(", ")} WHERE id = ?`,
        values,
      );

      await connection.commit();

      logger.info("Schedule updated", { scheduleId, ...scheduleData });

      return { scheduleId, ...scheduleData };
    } catch (error) {
      await connection.rollback();
      logger.error("Error updating schedule:", error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Delete schedule
  async deleteSchedule(scheduleId) {
    await db.query("DELETE FROM access_schedules WHERE id = ?", [scheduleId]);
    logger.info("Schedule deleted", { scheduleId });
  }

  // Get user schedules
  async getUserSchedules(userId) {
    const [schedules] = await db.query(
      "SELECT * FROM access_schedules WHERE user_id = ? ORDER BY created_at DESC",
      [userId],
    );
    return schedules;
  }

  /**
   * Retry pending user creations when device comes back online
   * This function checks for users that were created while device was offline
   * and retries adding them to the device when it comes back online
   */
  async retryPendingUserCreations() {
    // Skip if Tuya credentials not configured
    if (
      !process.env.TUYA_CLIENT_ID ||
      !process.env.TUYA_CLIENT_SECRET ||
      !process.env.TUYA_DEVICE_ID
    ) {
      return;
    }

    try {
      const deviceId = process.env.TUYA_DEVICE_ID;

      // Check device status first
      let isDeviceOnline = false;
      try {
        const deviceInfo = await tuyaService.getDeviceInfoById(deviceId);
        if (deviceInfo && deviceInfo.result) {
          isDeviceOnline = deviceInfo.result.online === true;
        } else if (deviceInfo && deviceInfo.online !== undefined) {
          isDeviceOnline = deviceInfo.online === true;
        }
      } catch (statusError) {
        logger.debug(
          "Failed to check device status for user creation retry:",
          statusError.message,
        );
        return; // Skip if we can't check device status
      }

      // Only proceed if device is online
      if (!isDeviceOnline) {
        return;
      }

      // Get pending user creations (max 10 at a time to avoid overwhelming the API)
      const [pendingCreations] = await db.query(
        `SELECT * FROM user_creation_backup 
         WHERE sync_status = 'pending' 
         AND retry_count < 10
         ORDER BY created_at ASC
         LIMIT 10`,
      );

      if (pendingCreations.length === 0) {
        return; // No pending creations
      }

      logger.info(
        `Retrying ${pendingCreations.length} pending user creation(s)`,
      );

      for (const backup of pendingCreations) {
        const connection = await db.getConnection();
        try {
          await connection.beginTransaction();

          const apiParams = JSON.parse(backup.api_params);
          const { deviceUserData, deviceId: backupDeviceId } = apiParams;

          // Verify device ID matches
          if (backupDeviceId !== deviceId) {
            logger.warn(`Device ID mismatch for backup ${backup.id}, skipping`);
            await connection.rollback();
            continue;
          }

          // Check if user still exists
          const [users] = await connection.query(
            "SELECT id, email, tuya_user_id FROM users WHERE id = ?",
            [backup.user_id],
          );

          if (users.length === 0) {
            // User was deleted, mark backup as failed
            await connection.query(
              `UPDATE user_creation_backup 
               SET sync_status = 'failed', 
                   error_message = 'User was deleted',
                   retry_count = retry_count + 1,
                   last_retry_at = NOW()
               WHERE id = ?`,
              [backup.id],
            );
            await connection.commit();
            continue;
          }

          const user = users[0];

          // Check if user already exists in device (to avoid duplicates)
          let userAlreadyInDevice = false;
          try {
            const deviceUsers = await tuyaService.getDeviceUsersById(deviceId, {
              keyword: user.email || "",
              role: "",
              page_no: 1,
              page_size: 100,
            });

            const usersList =
              deviceUsers?.records ||
              deviceUsers?.list ||
              (Array.isArray(deviceUsers) ? deviceUsers : []);

            userAlreadyInDevice = usersList.some(
              (du) =>
                du.uid === user.tuya_user_id || du.user_contact === user.email,
            );
          } catch (checkError) {
            logger.warn(
              `Failed to check if user exists in device: ${checkError.message}`,
            );
          }

          if (userAlreadyInDevice) {
            // User already exists in device, mark as synced
            await connection.query(
              `UPDATE user_creation_backup 
               SET sync_status = 'synced', 
                   error_message = NULL,
                   retry_count = retry_count + 1,
                   last_retry_at = NOW()
               WHERE id = ?`,
              [backup.id],
            );
            await connection.commit();
            logger.info(
              `User ${user.email} already exists in device, marked as synced`,
            );
            continue;
          }

          // Retry adding user to device
          try {
            const tuyaDeviceUser = await tuyaService.addDeviceUser(
              deviceId,
              deviceUserData,
            );

            // Success - mark as synced
            await connection.query(
              `UPDATE user_creation_backup 
               SET sync_status = 'synced', 
                   device_status = 'online',
                   error_message = NULL,
                   retry_count = retry_count + 1,
                   last_retry_at = NOW()
               WHERE id = ?`,
              [backup.id],
            );

            await connection.commit();

            logger.info(
              `Successfully synced user ${user.email} to device (backup ID: ${backup.id})`,
            );

            // Log the successful sync
            await db.query(
              `INSERT INTO system_logs (event_type, user_id, details, timestamp)
               VALUES ('user_synced_to_device', ?, ?, NOW())`,
              [
                backup.created_by,
                JSON.stringify({
                  userId: backup.user_id,
                  email: user.email,
                  backupId: backup.id,
                  retryCount: backup.retry_count + 1,
                }),
              ],
            );
          } catch (addError) {
            // Failed to add user - increment retry count
            const newRetryCount = backup.retry_count + 1;
            const errorMessage = addError.message || "Unknown error";

            await connection.query(
              `UPDATE user_creation_backup 
               SET sync_status = ?,
                   error_message = ?,
                   retry_count = ?,
                   last_retry_at = NOW()
               WHERE id = ?`,
              [
                newRetryCount >= 10 ? "failed" : "pending", // Mark as failed after 10 retries
                errorMessage,
                newRetryCount,
                backup.id,
              ],
            );

            await connection.commit();

            logger.warn(
              `Failed to sync user ${user.email} to device (retry ${newRetryCount}/10): ${errorMessage}`,
            );
          }
        } catch (error) {
          await connection.rollback();
          logger.error(
            `Error processing user creation backup ${backup.id}:`,
            error,
          );
        } finally {
          connection.release();
        }
      }
    } catch (error) {
      logger.error("Error in retryPendingUserCreations:", error);
    }
  }

  /**
   * Monitor device status; on offline notify admins/techsupport.
   * When device comes back online, ensure all local users (except owner)
   * are present on the Tuya device by re-enrolling missing users.
   */
  async monitorDeviceAndResync() {
    if (
      !process.env.TUYA_CLIENT_ID ||
      !process.env.TUYA_CLIENT_SECRET ||
      !process.env.TUYA_DEVICE_ID
    ) {
      return;
    }

    const deviceId = process.env.TUYA_DEVICE_ID;

    let isOnline = false;
    try {
      const deviceInfo = await tuyaService.getDeviceInfoById(deviceId);
      if (deviceInfo && deviceInfo.result) {
        isOnline = deviceInfo.result.online === true;
      } else if (deviceInfo && deviceInfo.online !== undefined) {
        isOnline = deviceInfo.online === true;
      }
    } catch (error) {
      logger.warn(
        "Failed to check device status in monitorDeviceAndResync:",
        error.message,
      );
      return;
    }

    // On offline: notify once per transition
    if (!isOnline && this.lastDeviceStatus !== "offline") {
      this.lastDeviceStatus = "offline";
      await notificationService.notifyAdminsAndTechSupport(
        notificationService.NOTIFICATION_TYPES.DEVICE_ERROR,
        "Door lock device offline",
        "The Tuya door lock device is offline. User enrollments will be retried when it comes back online.",
      );
      logger.warn("Device is offline; admins/techsupport notified");
      return;
    }

    // If back online after being offline, notify and attempt resync
    if (isOnline && this.lastDeviceStatus === "offline") {
      await notificationService.notifyAdminsAndTechSupport(
        notificationService.NOTIFICATION_TYPES.DEVICE_ERROR,
        "Door lock device back online",
        "The Tuya door lock device is back online. Pending user enrollments will now be synced.",
      );
      logger.info("Device came online; starting resync of local users");
      await this.resyncMissingDeviceUsers(deviceId);
    }

    this.lastDeviceStatus = isOnline ? "online" : "offline";
  }

  /**
   * Ensure all local users (excluding owner) exist on the Tuya device.
   * Uses backed up API params when available; falls back to minimal data.
   */
  async resyncMissingDeviceUsers(deviceId) {
    try {
      const tuyaUsersResult = await tuyaService.getAllDeviceUsers(deviceId, {
        page_no: 1,
        page_size: 200,
      });

      const deviceUsers =
        tuyaUsersResult?.data ||
        tuyaUsersResult?.records ||
        tuyaUsersResult?.list ||
        [];

      const deviceUserSet = new Set(
        deviceUsers.map(
          (u) => u.uid || u.user_contact || u.user_id || u.lock_user_id,
        ),
      );

      const [localUsers] = await db.query(
        `SELECT id, username, email, role, tuya_user_id 
         FROM users 
         WHERE status = 'active' AND role != 'owner'`,
      );

      for (const user of localUsers) {
        const identifier = user.tuya_user_id || user.email;
        if (!identifier) {
          continue;
        }

        if (deviceUserSet.has(identifier)) {
          continue; // Already present
        }

        // Try to find the last backup params for this user
        const [backups] = await db.query(
          `SELECT * FROM user_creation_backup 
           WHERE user_id = ? 
           ORDER BY created_at DESC 
           LIMIT 1`,
          [user.id],
        );

        let deviceUserData = null;
        if (backups.length > 0) {
          try {
            const apiParams = JSON.parse(backups[0].api_params || "{}");
            deviceUserData = apiParams.deviceUserData || null;
          } catch (parseErr) {
            logger.warn(
              `Failed to parse api_params for user ${user.id}:`,
              parseErr.message,
            );
          }
        }

        // Fallback minimal payload
        if (!deviceUserData) {
          const tuyaUserType = tuyaService.mapRoleToUserType(user.role);
          deviceUserData = {
            uid: user.tuya_user_id || "",
            nick_name: user.username,
            user_contact: user.email,
            user_type: tuyaUserType,
            back_home_notify_attr: 1,
          };
        }

        try {
          await tuyaService.addDeviceUser(deviceId, deviceUserData);

          // If there is a backup, mark it synced
          if (backups.length > 0) {
            await db.query(
              `UPDATE user_creation_backup 
               SET sync_status = 'synced', 
                   device_status = 'online', 
                   error_message = NULL, 
                   retry_count = retry_count + 1, 
                   last_retry_at = NOW() 
               WHERE id = ?`,
              [backups[0].id],
            );
          }

          logger.info(`Resynced user ${user.email || user.id} to device`);
        } catch (addErr) {
          logger.warn(
            `Failed to resync user ${user.email || user.id} to device: ${addErr.message}`,
          );
        }
      }
    } catch (error) {
      logger.error("Error during resyncMissingDeviceUsers:", error);
    }
  }

  // Stop all scheduled jobs
  stop() {
    this.jobs.forEach((job, name) => {
      job.stop();
      logger.info(`Stopped scheduled job: ${name}`);
    });
    this.jobs.clear();
    this.isInitialized = false;
  }
}

module.exports = new SchedulerService();
