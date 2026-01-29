/**
 * Sync Controller
 * Credential sync, sync queue, retry, history, and force sync.
 */
const db = require("../models/mysql.models");
const tuyaSync = require("../services/tuyaSync.service");
const logRetrieval = require("../services/logRetrieval.service");
const reconciliation = require("../services/reconciliation.service");
const deviceStatusMonitor = require("../services/deviceStatusMonitor.service");
const logger = require("../utils/logger");

/**
 * POST /api/credentials/sync - Sync credential to device(s)
 */
exports.syncCredential = async (req, res) => {
  try {
    const { credentialType, credentialId, deviceIds } = req.body;
    if (!credentialType || !credentialId) {
      return res.status(400).json({
        success: false,
        error: "credentialType and credentialId are required",
      });
    }
    if (!["enrollment", "temporary_password"].includes(credentialType)) {
      return res.status(400).json({
        success: false,
        error: "credentialType must be enrollment or temporary_password",
      });
    }

    const devices =
      deviceIds && deviceIds.length
        ? await db
            .query(
              "SELECT id, tuya_device_id FROM devices WHERE id IN (?) AND tuya_device_id IS NOT NULL",
              [deviceIds],
            )
            .then(([r]) => r)
        : await tuyaSync.getTuyaDevices();

    if (devices.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No target devices found",
      });
    }

    const queueIds = [];
    for (const d of devices) {
      const id = await tuyaSync.enqueueCredentialSync(
        credentialType,
        credentialId,
        d.id,
        d.tuya_device_id,
        1,
      );
      queueIds.push(id);
    }

    await tuyaSync.processSyncQueue();

    res.status(200).json({
      success: true,
      message: "Credential sync queued and processed",
      queueIds,
      deviceCount: devices.length,
    });
  } catch (err) {
    logger.error("Sync credential failed", { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message || "Failed to sync credential",
    });
  }
};

/**
 * GET /api/credentials/sync-status/:id - Get credential sync status
 * id = enrollment id or temporary_password id; query ?type=enrollment|temporary_password
 */
exports.getCredentialSyncStatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const type = (req.query.type || "enrollment").toLowerCase();
    if (!id || isNaN(id)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid credential id" });
    }
    const [rows] = await db.query(
      `SELECT css.*, d.device_name
       FROM credential_sync_status css
       JOIN devices d ON d.id = css.device_id
       WHERE css.credential_type = ? AND css.credential_id = ?`,
      [type === "temporary_password" ? "temporary_password" : "enrollment", id],
    );
    res.json({
      success: true,
      data: rows.map((r) => ({
        deviceId: r.device_id,
        deviceName: r.device_name,
        syncStatus: r.sync_status,
        syncedAt: r.synced_at,
        lastAttemptAt: r.last_attempt_at,
        retryCount: r.retry_count,
        errorMessage: r.error_message,
      })),
    });
  } catch (err) {
    logger.error("Get credential sync status failed", { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message || "Failed to get sync status",
    });
  }
};

/**
 * POST /api/credentials/force-sync - Force immediate sync (all pending credentials to default device)
 */
exports.forceSyncCredentials = async (req, res) => {
  try {
    const result = await tuyaSync.runCredentialSyncForDefaultDevice();
    res.json({
      success: true,
      message: "Force sync completed",
      synced: result.synced,
      errors: result.errors,
    });
  } catch (err) {
    logger.error("Force sync failed", { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message || "Force sync failed",
    });
  }
};

/**
 * GET /api/logs/retrieve - Retrieve buffered logs from devices (manual trigger)
 */
exports.retrieveLogs = async (req, res) => {
  try {
    const deviceId = req.query.deviceId
      ? parseInt(req.query.deviceId, 10)
      : null;
    if (deviceId) {
      const devices = await tuyaSync.getTuyaDevices();
      const dev = devices.find((d) => d.id === deviceId);
      if (!dev) {
        return res
          .status(404)
          .json({ success: false, error: "Device not found" });
      }
      const now = Date.now();
      const window = 24 * 60 * 60 * 1000;
      const r = await logRetrieval.retrieveFromDevice(
        dev.id,
        dev.tuya_device_id,
        null,
        now - window,
        now,
        true,
      );
      return res.json({ success: true, data: r });
    }
    const result = await logRetrieval.pollAllDevices();
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    logger.error("Log retrieve failed", { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message || "Log retrieval failed",
    });
  }
};

/**
 * GET /api/logs/gaps - Identify missing log periods
 */
exports.getLogGaps = async (req, res) => {
  try {
    const deviceId = req.query.deviceId
      ? parseInt(req.query.deviceId, 10)
      : null;
    const gaps = await reconciliation.getMissingLogPeriods(deviceId);
    res.json({
      success: true,
      data: gaps.map((g) => ({
        id: g.id,
        deviceId: g.device_id,
        tuyaDeviceId: g.tuya_device_id,
        gapStart: g.gap_start,
        gapEnd: g.gap_end,
        status: g.status,
      })),
    });
  } catch (err) {
    logger.error("Get log gaps failed", { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message || "Failed to get gaps",
    });
  }
};

/**
 * GET /api/devices/status - Get all device statuses (sync health)
 */
exports.getAllDevicesStatus = async (req, res) => {
  try {
    const summary = await deviceStatusMonitor.getStatusSummary();
    res.json({
      success: true,
      data: summary,
    });
  } catch (err) {
    logger.error("Get devices status failed", { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message || "Failed to get device status",
    });
  }
};

/**
 * GET /api/devices/:id/status - Get specific device status
 */
exports.getDeviceStatus = async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id, 10);
    if (!deviceId || isNaN(deviceId)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid device id" });
    }
    const summary = await deviceStatusMonitor.getStatusSummary();
    const one = summary.find((s) => String(s.id) === String(deviceId));
    if (!one) {
      return res
        .status(404)
        .json({ success: false, error: "Device not found" });
    }
    res.json({ success: true, data: one });
  } catch (err) {
    logger.error("Get device status failed", { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message || "Failed to get device status",
    });
  }
};

/**
 * POST /api/devices/:id/ping - Check device connectivity
 */
exports.pingDevice = async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id, 10);
    if (!deviceId || isNaN(deviceId)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid device id" });
    }
    const result = await deviceStatusMonitor.pingDevice(deviceId);
    if (result.error) {
      return res.status(404).json({ success: false, error: result.error });
    }
    res.json({
      success: true,
      data: {
        online: result.online,
        deviceId: result.deviceId,
        tuyaDeviceId: result.tuyaDeviceId,
      },
    });
  } catch (err) {
    logger.error("Ping device failed", { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message || "Ping failed",
    });
  }
};

/**
 * GET /api/sync/queue - Get pending sync operations
 */
exports.getSyncQueue = async (req, res) => {
  try {
    const status = req.query.status || "pending";
    const [rows] = await db.query(
      `SELECT sq.*, d.device_name
       FROM sync_queue sq
       JOIN devices d ON d.id = sq.device_id
       WHERE sq.status = ?
       ORDER BY sq.priority ASC, sq.created_at ASC
       LIMIT 100`,
      [status],
    );
    res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        queueType: r.queue_type,
        entityType: r.entity_type,
        entityId: r.entity_id,
        deviceId: r.device_id,
        deviceName: r.device_name,
        priority: r.priority,
        status: r.status,
        retryCount: r.retry_count,
        maxRetries: r.max_retries,
        lastAttemptAt: r.last_attempt_at,
        errorMessage: r.error_message,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    logger.error("Get sync queue failed", { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message || "Failed to get sync queue",
    });
  }
};

/**
 * POST /api/sync/retry/:id - Retry failed sync
 */
exports.retrySync = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid sync queue id" });
    }
    const [rows] = await db.query(
      "SELECT id, device_id, queue_type, entity_type, entity_id FROM sync_queue WHERE id = ?",
      [id],
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Sync item not found" });
    }
    const item = rows[0];
    await db.query(
      "UPDATE sync_queue SET status = 'pending', retry_count = 0, error_message = NULL WHERE id = ?",
      [id],
    );
    const [dev] = await db.query(
      "SELECT tuya_device_id FROM devices WHERE id = ?",
      [item.device_id],
    );
    const tuyaDeviceId = dev[0]?.tuya_device_id;
    if (item.queue_type === "credential" && tuyaDeviceId) {
      await tuyaSync.syncCredentialToDevice(
        item.entity_type,
        item.entity_id,
        item.device_id,
        tuyaDeviceId,
      );
    }
    const [updated] = await db.query(
      "SELECT status, retry_count FROM sync_queue WHERE id = ?",
      [id],
    );
    res.json({
      success: true,
      message: "Retry initiated",
      data: updated[0],
    });
  } catch (err) {
    logger.error("Retry sync failed", { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message || "Retry failed",
    });
  }
};

/**
 * GET /api/sync/history - Get sync history (audit)
 */
exports.getSyncHistory = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const [rows] = await db.query(
      `SELECT sal.*, u.username AS triggered_by_username
       FROM sync_audit_log sal
       LEFT JOIN users u ON u.id = sal.user_id
       ORDER BY sal.created_at DESC
       LIMIT ?`,
      [limit],
    );
    res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        actionType: r.action_type,
        entityType: r.entity_type,
        entityId: r.entity_id,
        deviceId: r.device_id,
        userId: r.user_id,
        triggeredByUsername: r.triggered_by_username,
        success: r.success,
        details: r.details,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    logger.error("Get sync history failed", { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message || "Failed to get sync history",
    });
  }
};
