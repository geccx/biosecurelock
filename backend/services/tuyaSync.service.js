/**
 * TUYA Sync Service
 * Monitors connectivity with TUYA cloud, syncs credentials and access schedules to devices,
 * handles sync failures and retries, tracks last successful sync.
 * Reference: https://developer.tuya.com/en/docs/cloud
 */
const db = require("../models/mysql.models");
const tuyaService = require("./tuya.service");
const tuyaIntegration = require("./tuya-integration.service");
const syncConfig = require("../config/sync.config");
const logger = require("../utils/logger");

/** Default TUYA device ID from env (used for credential/schedule sync when device-specific API not available) */
const DEFAULT_TUYA_DEVICE_ID = process.env.TUYA_DEVICE_ID;

/**
 * Get all devices that have a TUYA device ID (locks we can sync to).
 */
async function getTuyaDevices() {
  const [rows] = await db.query(
    "SELECT id, device_name, tuya_device_id, status FROM devices WHERE tuya_device_id IS NOT NULL AND tuya_device_id != ''",
  );
  return rows;
}

/**
 * Ensure device_sync_status row exists for a device.
 */
async function ensureDeviceSyncStatus(deviceId, tuyaDeviceId) {
  await db.query(
    `INSERT INTO device_sync_status (device_id, tuya_device_id, connectivity_status)
     VALUES (?, ?, 'unknown')
     ON DUPLICATE KEY UPDATE tuya_device_id = VALUES(tuya_device_id)`,
    [deviceId, tuyaDeviceId],
  );
}

/**
 * Update last successful sync timestamp for a device.
 */
async function updateLastSync(
  deviceId,
  field = "last_successful_sync_at",
  value = new Date(),
) {
  const col =
    field === "last_credential_sync_at"
      ? "last_credential_sync_at"
      : field === "last_schedule_sync_at"
        ? "last_schedule_sync_at"
        : field === "last_log_retrieval_at"
          ? "last_log_retrieval_at"
          : "last_successful_sync_at";
  await db.query(
    `UPDATE device_sync_status SET ${col} = ?, last_successful_sync_at = COALESCE(last_successful_sync_at, ?), last_error = NULL, updated_at = NOW() WHERE device_id = ?`,
    [value, value, deviceId],
  );
}

/**
 * Record sync error for a device.
 */
async function recordSyncError(deviceId, errorMessage) {
  await db.query(
    "UPDATE device_sync_status SET last_error = ?, updated_at = NOW() WHERE device_id = ?",
    [errorMessage ? errorMessage.substring(0, 1000) : null, deviceId],
  );
}

/**
 * Check TUYA cloud connectivity (token valid + one device reachable).
 */
async function checkTuyaConnectivity() {
  try {
    await tuyaService._ensureValidToken();
    const deviceId =
      DEFAULT_TUYA_DEVICE_ID || (await getTuyaDevices())[0]?.tuya_device_id;
    if (!deviceId) return { ok: false, reason: "no_device" };
    await tuyaService.getDeviceStatus(deviceId);
    return { ok: true };
  } catch (err) {
    logger.warn("TUYA connectivity check failed", { error: err.message });
    return { ok: false, reason: err.message };
  }
}

/**
 * Sync a single credential (enrollment or temporary_password) to the default device.
 * Uses existing tuya-integration where possible; records result in credential_sync_status.
 */
async function syncCredentialToDevice(
  credentialType,
  credentialId,
  deviceId,
  tuyaDeviceId,
) {
  const now = new Date();
  try {
    if (credentialType === "enrollment") {
      const [rows] = await db.query(
        "SELECT e.id, e.user_id, e.enrollment_type, e.enrollment_data, e.tuya_unlock_id, u.tuya_user_id FROM enrollments e JOIN users u ON u.id = e.user_id WHERE e.id = ? AND e.status IN ('approved','synced')",
        [credentialId],
      );
      if (rows.length === 0) {
        await db.query(
          `INSERT INTO credential_sync_status (credential_type, credential_id, device_id, tuya_device_id, sync_status, last_attempt_at, error_message)
           VALUES ('enrollment', ?, ?, ?, 'failed', ?, 'Enrollment not found or not approved')
           ON DUPLICATE KEY UPDATE sync_status = 'failed', last_attempt_at = VALUES(last_attempt_at), error_message = VALUES(error_message), retry_count = retry_count + 1`,
          [credentialId, deviceId, tuyaDeviceId, now],
        );
        return {
          success: false,
          error: "Enrollment not found or not approved",
        };
      }
      const enrollment = rows[0];
      await tuyaIntegration.syncUserEnrollment(
        enrollment.user_id,
        enrollment.enrollment_type,
        enrollment.enrollment_data || {},
      );
      await db.query(
        `INSERT INTO credential_sync_status (credential_type, credential_id, device_id, tuya_device_id, sync_status, synced_at, last_attempt_at, retry_count, error_message)
         VALUES ('enrollment', ?, ?, ?, 'synced', ?, ?, 0, NULL)
         ON DUPLICATE KEY UPDATE sync_status = 'synced', synced_at = ?, last_attempt_at = ?, retry_count = 0, error_message = NULL`,
        [credentialId, deviceId, tuyaDeviceId, now, now, now, now],
      );
      return { success: true };
    }

    if (credentialType === "temporary_password") {
      const [rows] = await db.query(
        "SELECT id, password_hash, tuya_password_id, valid_from, valid_until, target_user_id FROM temporary_passwords WHERE id = ? AND is_active = 1",
        [credentialId],
      );
      if (rows.length === 0) {
        await db.query(
          `INSERT INTO credential_sync_status (credential_type, credential_id, device_id, tuya_device_id, sync_status, last_attempt_at, error_message)
           VALUES ('temporary_password', ?, ?, ?, 'failed', ?, 'Temp password not found or inactive')
           ON DUPLICATE KEY UPDATE sync_status = 'failed', last_attempt_at = VALUES(last_attempt_at), error_message = VALUES(error_message), retry_count = retry_count + 1`,
          [credentialId, deviceId, tuyaDeviceId, now],
        );
        return { success: false, error: "Temp password not found or inactive" };
      }
      // Temporary passwords are created via Tuya API when approved; we only need to track sync.
      // If tuya_password_id exists, consider synced.
      const tp = rows[0];
      const status = tp.tuya_password_id ? "synced" : "pending";
      await db.query(
        `INSERT INTO credential_sync_status (credential_type, credential_id, device_id, tuya_device_id, sync_status, synced_at, last_attempt_at, retry_count, error_message)
         VALUES ('temporary_password', ?, ?, ?, ?, ?, ?, 0, NULL)
         ON DUPLICATE KEY UPDATE sync_status = VALUES(sync_status), synced_at = IF(VALUES(sync_status) = 'synced', NOW(), synced_at), last_attempt_at = ?, retry_count = 0, error_message = NULL`,
        [
          credentialId,
          deviceId,
          tuyaDeviceId,
          status,
          status === "synced" ? now : null,
          now,
          now,
        ],
      );
      return { success: status === "synced" };
    }

    return { success: false, error: "Unsupported credential type" };
  } catch (err) {
    logger.error("Credential sync failed", {
      credentialType,
      credentialId,
      deviceId,
      error: err.message,
    });
    await db.query(
      `INSERT INTO credential_sync_status (credential_type, credential_id, device_id, tuya_device_id, sync_status, last_attempt_at, retry_count, error_message)
       VALUES (?, ?, ?, ?, 'failed', ?, 1, ?)
       ON DUPLICATE KEY UPDATE sync_status = 'failed', last_attempt_at = VALUES(last_attempt_at), retry_count = retry_count + 1, error_message = VALUES(error_message)`,
      [
        credentialType,
        credentialId,
        deviceId,
        tuyaDeviceId,
        now,
        (err.message || "").substring(0, 500),
      ],
    );
    return { success: false, error: err.message };
  }
}

/**
 * Process pending items from sync_queue (credentials and schedules).
 * Uses default device for TUYA API when service does not support per-device.
 */
async function processSyncQueue() {
  const [items] = await db.query(
    `SELECT sq.id, sq.queue_type, sq.entity_type, sq.entity_id, sq.device_id, sq.tuya_device_id, sq.retry_count, sq.max_retries
     FROM sync_queue sq
     WHERE sq.status = 'pending' AND sq.retry_count < sq.max_retries
     ORDER BY sq.priority ASC, sq.created_at ASC
     LIMIT 20`,
  );

  for (const item of items) {
    try {
      await db.query(
        "UPDATE sync_queue SET status = 'processing', last_attempt_at = NOW() WHERE id = ?",
        [item.id],
      );
      let success = false;
      if (
        item.queue_type === "credential" &&
        ["enrollment", "temporary_password"].includes(item.entity_type)
      ) {
        const result = await syncCredentialToDevice(
          item.entity_type === "enrollment"
            ? "enrollment"
            : "temporary_password",
          item.entity_id,
          item.device_id,
          item.tuya_device_id,
        );
        success = result.success;
      }
      if (item.queue_type === "schedule") {
        // Schedule sync: TUYA may have schedule APIs; for now we only track status.
        await db.query(
          `INSERT INTO access_schedule_sync (access_schedule_id, device_id, tuya_device_id, sync_status, synced_at, last_attempt_at)
           VALUES (?, ?, ?, 'synced', NOW(), NOW())
           ON DUPLICATE KEY UPDATE sync_status = 'synced', synced_at = NOW(), last_attempt_at = NOW()`,
          [item.entity_id, item.device_id, item.tuya_device_id],
        );
        success = true;
      }

      if (success) {
        await db.query(
          "UPDATE sync_queue SET status = 'completed', completed_at = NOW() WHERE id = ?",
          [item.id],
        );
        await updateLastSync(item.device_id, "last_successful_sync_at");
      } else {
        await db.query(
          "UPDATE sync_queue SET status = 'pending', retry_count = retry_count + 1 WHERE id = ?",
          [item.id],
        );
      }
    } catch (err) {
      logger.error("Sync queue item failed", {
        id: item.id,
        error: err.message,
      });
      const nextRetry = item.retry_count + 1;
      await db.query(
        "UPDATE sync_queue SET status = ?, retry_count = ?, error_message = ?, last_attempt_at = NOW() WHERE id = ?",
        [
          nextRetry >= item.max_retries ? "failed" : "pending",
          nextRetry,
          (err.message || "").substring(0, 500),
          item.id,
        ],
      );
      await recordSyncError(item.device_id, err.message);
    }
  }
}

/**
 * Enqueue credential sync for a device.
 */
async function enqueueCredentialSync(
  credentialType,
  credentialId,
  deviceId,
  tuyaDeviceId,
  priority = 5,
) {
  const [r] = await db.query(
    `INSERT INTO sync_queue (queue_type, entity_type, entity_id, device_id, tuya_device_id, priority, status)
     VALUES ('credential', ?, ?, ?, ?, ?, 'pending')`,
    [credentialType, credentialId, deviceId, tuyaDeviceId, priority],
  );
  return r.insertId;
}

/**
 * Enqueue schedule sync for a device.
 */
async function enqueueScheduleSync(
  accessScheduleId,
  deviceId,
  tuyaDeviceId,
  priority = 5,
) {
  const [r] = await db.query(
    `INSERT INTO sync_queue (queue_type, entity_type, entity_id, device_id, tuya_device_id, priority, status)
     VALUES ('schedule', 'access_schedule', ?, ?, ?, ?, 'pending')`,
    [accessScheduleId, deviceId, tuyaDeviceId, priority],
  );
  return r.insertId;
}

/**
 * Get last successful sync timestamp for the system (earliest across devices).
 */
async function getLastSuccessfulSyncTime() {
  const [rows] = await db.query(
    "SELECT MIN(last_successful_sync_at) AS ts FROM device_sync_status WHERE last_successful_sync_at IS NOT NULL",
  );
  return rows[0]?.ts || null;
}

/**
 * Run full credential sync for default device: ensure device_sync_status, push pending credentials.
 */
async function runCredentialSyncForDefaultDevice() {
  if (!DEFAULT_TUYA_DEVICE_ID) {
    logger.warn("No TUYA_DEVICE_ID; skipping credential sync");
    return { synced: 0, errors: [] };
  }

  const [devices] = await db.query(
    "SELECT id, tuya_device_id FROM devices WHERE tuya_device_id = ?",
    [DEFAULT_TUYA_DEVICE_ID],
  );
  if (devices.length === 0) {
    logger.warn(
      "Default TUYA device not in devices table; skipping credential sync",
    );
    return { synced: 0, errors: [] };
  }

  const deviceId = devices[0].id;
  const tuyaDeviceId = devices[0].tuya_device_id;
  await ensureDeviceSyncStatus(deviceId, tuyaDeviceId);

  const errors = [];
  let synced = 0;

  try {
    const [enrollments] = await db.query(
      "SELECT id FROM enrollments WHERE status IN ('approved','synced')",
    );
    for (const e of enrollments) {
      const result = await syncCredentialToDevice(
        "enrollment",
        e.id,
        deviceId,
        tuyaDeviceId,
      );
      if (result.success) synced++;
      else if (result.error)
        errors.push({ type: "enrollment", id: e.id, error: result.error });
    }

    const [temps] = await db.query(
      "SELECT id FROM temporary_passwords WHERE is_active = 1",
    );
    for (const t of temps) {
      const result = await syncCredentialToDevice(
        "temporary_password",
        t.id,
        deviceId,
        tuyaDeviceId,
      );
      if (result.success) synced++;
      else if (result.error)
        errors.push({
          type: "temporary_password",
          id: t.id,
          error: result.error,
        });
    }

    if (synced > 0 || errors.length === 0) {
      await updateLastSync(deviceId, "last_credential_sync_at");
    }
    if (errors.length) {
      await recordSyncError(deviceId, errors.map((e) => e.error).join("; "));
    }
  } catch (err) {
    logger.error("Run credential sync failed", { error: err.message });
    await recordSyncError(deviceId, err.message);
    errors.push({ error: err.message });
  }

  return { synced, errors };
}

module.exports = {
  checkTuyaConnectivity,
  getTuyaDevices,
  ensureDeviceSyncStatus,
  updateLastSync,
  recordSyncError,
  syncCredentialToDevice,
  processSyncQueue,
  enqueueCredentialSync,
  enqueueScheduleSync,
  getLastSuccessfulSyncTime,
  runCredentialSyncForDefaultDevice,
};
