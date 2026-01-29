/**
 * Device Status Monitor
 * Tracks online/offline status of each TUYA device, last heartbeat, extended offline detection,
 * and triggers alerts for sync failures.
 */
const db = require("../models/mysql.models");
const tuyaService = require("./tuya.service");
const tuyaSync = require("./tuyaSync.service");
const notificationService = require("./notification.service");
const syncConfig = require("../config/sync.config");
const logger = require("../utils/logger");

const OFFLINE_ALERT_MS =
  (syncConfig.offlineAlertThresholdMinutes || 30) * 60 * 1000;

/**
 * Update connectivity status for a single device by calling TUYA device status API.
 */
async function updateDeviceStatus(deviceId, tuyaDeviceId) {
  try {
    const statusRes = await tuyaService.getDeviceStatus(tuyaDeviceId);
    const online =
      statusRes && statusRes.result && Array.isArray(statusRes.result)
        ? statusRes.result.some(
            (s) =>
              (s.code === "online" || s.code === "work_state") &&
              (s.value === true || s.value === "true" || s.value === "online"),
          )
        : !!statusRes;

    await tuyaSync.ensureDeviceSyncStatus(deviceId, tuyaDeviceId);
    await db.query(
      `UPDATE device_sync_status SET connectivity_status = ?, last_heartbeat_at = NOW(), updated_at = NOW() WHERE device_id = ?`,
      [online ? "online" : "offline", deviceId],
    );
    await db.query(
      "UPDATE devices SET status = ?, last_checked = NOW() WHERE id = ?",
      [online ? "online" : "offline", deviceId],
    );
    return { online, deviceId, tuyaDeviceId };
  } catch (err) {
    logger.warn("Device status check failed", {
      deviceId,
      tuyaDeviceId,
      error: err.message,
    });
    await tuyaSync.ensureDeviceSyncStatus(deviceId, tuyaDeviceId);
    await db.query(
      `UPDATE device_sync_status SET connectivity_status = 'offline', last_error = ?, updated_at = NOW() WHERE device_id = ?`,
      [(err.message || "").substring(0, 500), deviceId],
    );
    await db.query(
      "UPDATE devices SET status = 'offline', last_checked = NOW() WHERE id = ?",
      [deviceId],
    );
    return { online: false, deviceId, tuyaDeviceId, error: err.message };
  }
}

/**
 * Check all TUYA devices and update their status.
 */
async function checkAllDevices() {
  const devices = await tuyaSync.getTuyaDevices();
  const results = [];
  for (const dev of devices) {
    const r = await updateDeviceStatus(dev.id, dev.tuya_device_id);
    results.push(r);
  }
  return results;
}

/**
 * Detect extended offline periods and optionally notify admins.
 */
async function detectExtendedOfflineAndAlert() {
  const [rows] = await db.query(
    `SELECT dss.device_id, dss.tuya_device_id, dss.last_heartbeat_at, d.device_name
     FROM device_sync_status dss
     JOIN devices d ON d.id = dss.device_id
     WHERE dss.connectivity_status = 'offline' OR dss.last_heartbeat_at IS NULL`,
  );

  const now = Date.now();
  const toAlert = [];

  for (const r of rows) {
    const last = r.last_heartbeat_at
      ? new Date(r.last_heartbeat_at).getTime()
      : 0;
    if (now - last >= OFFLINE_ALERT_MS) {
      toAlert.push({
        deviceId: r.device_id,
        deviceName: r.device_name,
        lastHeartbeat: r.last_heartbeat_at,
      });
    }
  }

  if (
    toAlert.length > 0 &&
    notificationService &&
    typeof notificationService.notifyAdminsAndTechSupport === "function"
  ) {
    try {
      await notificationService.notifyAdminsAndTechSupport(
        "DEVICE_ERROR",
        "Devices Offline",
        `${toAlert.length} device(s) have been offline for more than ${syncConfig.offlineAlertThresholdMinutes} minutes. Check Device Status dashboard.`,
      );
    } catch (err) {
      logger.error("Failed to send offline alert", { error: err.message });
    }
  }

  return toAlert;
}

/**
 * Get status summary for all devices (for dashboard).
 */
async function getStatusSummary() {
  const [devices] = await db.query(
    `SELECT d.id, d.device_name, d.tuya_device_id, d.status AS device_status, d.last_checked,
      dss.connectivity_status, dss.last_heartbeat_at, dss.last_successful_sync_at,
      dss.last_credential_sync_at, dss.last_schedule_sync_at, dss.last_log_retrieval_at,
      dss.pending_credentials_count, dss.pending_schedules_count, dss.last_error
     FROM devices d
     LEFT JOIN device_sync_status dss ON dss.device_id = d.id
     WHERE d.tuya_device_id IS NOT NULL AND d.tuya_device_id != ''`,
  );

  return devices.map((d) => ({
    id: d.id,
    deviceName: d.device_name,
    tuyaDeviceId: d.tuya_device_id,
    status: d.device_status,
    connectivityStatus: d.connectivity_status || "unknown",
    lastChecked: d.last_checked,
    lastHeartbeat: d.last_heartbeat_at,
    lastSuccessfulSync: d.last_successful_sync_at,
    lastCredentialSync: d.last_credential_sync_at,
    lastScheduleSync: d.last_schedule_sync_at,
    lastLogRetrieval: d.last_log_retrieval_at,
    pendingCredentials: d.pending_credentials_count || 0,
    pendingSchedules: d.pending_schedules_count || 0,
    lastError: d.last_error,
  }));
}

/**
 * Ping a single device (check connectivity).
 */
async function pingDevice(deviceId) {
  const [rows] = await db.query(
    "SELECT id, tuya_device_id FROM devices WHERE id = ? AND tuya_device_id IS NOT NULL",
    [deviceId],
  );
  if (rows.length === 0) return { error: "Device not found" };
  return updateDeviceStatus(rows[0].id, rows[0].tuya_device_id);
}

module.exports = {
  updateDeviceStatus,
  checkAllDevices,
  detectExtendedOfflineAndAlert,
  getStatusSummary,
  pingDevice,
};
