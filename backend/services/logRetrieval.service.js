/**
 * Log Retrieval Service
 * Polls TUYA devices for buffered access events, normalizes and deduplicates log data,
 * validates timestamps (device clock drift), inserts into access_logs with offline/sync metadata.
 * Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-record
 */
const crypto = require("crypto");
const db = require("../models/mysql.models");
const tuyaService = require("./tuya.service");
const tuyaSync = require("./tuyaSync.service");
const syncConfig = require("../config/sync.config");
const logger = require("../utils/logger");

/** Build event hash for deduplication: timestamp + device + user + result (and optional external id). */
function eventHash(payload) {
  const str = [
    payload.timestamp || "",
    payload.deviceId || payload.tuya_device_id || "",
    payload.userId ?? payload.user_id ?? "",
    payload.credentialId ?? payload.tuya_unlock_id ?? "",
    payload.success === true ? "1" : "0",
    payload.external_event_id || "",
  ].join("|");
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

/**
 * Check if device timestamp is within acceptable drift of server time.
 */
function isTimestampValid(deviceTimestampMs, maxDriftSeconds = null) {
  const max = (maxDriftSeconds ?? syncConfig.maxClockDriftSeconds) * 1000;
  const serverNow = Date.now();
  const diff = Math.abs(serverNow - deviceTimestampMs);
  return diff <= max;
}

/**
 * Normalize a single unlock log entry from TUYA API to our access_logs shape.
 * TUYA v1.1 open-logs / door-lock records format may vary; adapt as needed.
 */
function normalizeTuyaLogItem(item, tuyaDeviceId, laboratoryId, wasOffline) {
  let timestamp =
    item.timestamp || item.event_time || item.create_time || item.time;
  if (typeof timestamp === "number") {
    if (timestamp < 1e12) timestamp = timestamp * 1000; // seconds -> ms
  } else if (typeof timestamp === "string") {
    timestamp = new Date(timestamp).getTime();
  } else {
    timestamp = Date.now();
  }

  const success =
    item.success !== false && item.result !== "fail" && item.state !== "failed";
  const userId = item.user_id != null ? parseInt(item.user_id, 10) : null;
  const accessMethod = mapTuyaUnlockTypeToAccessMethod(
    item.unlock_type || item.dp_code || item.method,
  );

  const payload = {
    timestamp: new Date(timestamp),
    deviceId: tuyaDeviceId,
    userId: Number.isInteger(userId) ? userId : null,
    credentialId:
      item.unlock_sn ?? item.unlock_id ?? item.tuya_unlock_id ?? null,
    success: !!success,
    accessMethod,
    external_event_id: item.id ?? item.record_id ?? item.event_id ?? null,
  };

  const hash = eventHash({
    timestamp: String(timestamp),
    tuya_device_id: tuyaDeviceId,
    user_id: payload.userId,
    tuya_unlock_id: payload.credentialId,
    success: payload.success,
    external_event_id: payload.external_event_id,
  });

  return {
    user_id: payload.userId,
    laboratory_id: laboratoryId,
    timestamp: payload.timestamp,
    access_method: payload.accessMethod,
    access_type: "unlock",
    success: payload.success,
    tuya_unlock_id: payload.credentialId ? String(payload.credentialId) : null,
    details: typeof item.details === "object" ? item.details : { raw: item },
    event_hash: hash,
    offline_flag: !!wasOffline,
    sync_timestamp: new Date(),
    retrieval_status: wasOffline ? "buffered" : "realtime",
    external_event_id: payload.external_event_id
      ? String(payload.external_event_id)
      : null,
  };
}

function mapTuyaUnlockTypeToAccessMethod(tuyaType) {
  const map = {
    unlock_fingerprint: "fingerprint",
    unlock_card: "rfid",
    unlock_password: "pin",
    unlock_key: "key",
    unlock_temporary: "temporary_password",
    unlock_dynamic: "dynamic_password",
    unlock_offline_pd: "pin",
    fingerprint: "fingerprint",
    rfid: "rfid",
    card: "rfid",
    pin: "pin",
    password: "pin",
  };
  return map[String(tuyaType).toLowerCase()] || "pin";
}

/**
 * Check if an event with the same hash already exists (deduplication).
 */
async function existsByHash(hash) {
  const [rows] = await db.query(
    "SELECT 1 FROM access_logs WHERE event_hash = ? LIMIT 1",
    [hash],
  );
  return rows.length > 0;
}

/**
 * Insert a normalized log row; skip if duplicate (same event_hash).
 */
async function insertLogRow(row) {
  if (await existsByHash(row.event_hash))
    return { inserted: false, duplicate: true };
  await db.query(
    `INSERT INTO access_logs (
      user_id, laboratory_id, timestamp, access_method, access_type, success,
      tuya_unlock_id, details, event_hash, offline_flag, sync_timestamp, retrieval_status, external_event_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.user_id,
      row.laboratory_id,
      row.timestamp,
      row.access_method,
      row.access_type || "unlock",
      row.success ? 1 : 0,
      row.tuya_unlock_id,
      row.details ? JSON.stringify(row.details) : null,
      row.event_hash,
      row.offline_flag ? 1 : 0,
      row.sync_timestamp,
      row.retrieval_status || "buffered",
      row.external_event_id,
    ],
  );
  return { inserted: true, duplicate: false };
}

/**
 * Retrieve logs from a single TUYA device for a time range and persist (with deduplication).
 */
async function retrieveFromDevice(
  deviceId,
  tuyaDeviceId,
  laboratoryId,
  startTimeMs,
  endTimeMs,
  wasOffline = true,
) {
  const results = {
    inserted: 0,
    duplicates: 0,
    invalidTimestamp: 0,
    errors: [],
  };

  try {
    const params = {
      start_time: startTimeMs,
      end_time: endTimeMs,
      page_no: 1,
      page_size: 50,
    };

    let list = [];
    const res = await tuyaService.getUnlockingHistory(tuyaDeviceId, params);
    if (res && res.result && Array.isArray(res.result)) {
      list = res.result;
    } else if (res && Array.isArray(res.list)) {
      list = res.list;
    } else if (res && res.data && Array.isArray(res.data)) {
      list = res.data;
    } else if (res && res.logs && Array.isArray(res.logs)) {
      list = res.logs;
    }

    for (const item of list) {
      try {
        const row = normalizeTuyaLogItem(
          item,
          tuyaDeviceId,
          laboratoryId,
          wasOffline,
        );
        const tsMs = new Date(row.timestamp).getTime();
        if (!isTimestampValid(tsMs)) {
          results.invalidTimestamp++;
          continue;
        }
        const out = await insertLogRow(row);
        if (out.inserted) results.inserted++;
        else if (out.duplicate) results.duplicates++;
      } catch (err) {
        results.errors.push(err.message);
      }
    }

    if (results.inserted > 0) {
      await tuyaSync.updateLastSync(deviceId, "last_log_retrieval_at");
    }
  } catch (err) {
    logger.error("Log retrieval failed for device", {
      deviceId,
      tuyaDeviceId,
      error: err.message,
    });
    results.errors.push(err.message);
    await tuyaSync.recordSyncError(deviceId, err.message);
  }

  return results;
}

/**
 * Poll all TUYA devices and retrieve logs since last retrieval (or last sync gap).
 */
async function pollAllDevices() {
  const devices = await tuyaSync.getTuyaDevices();
  const now = Date.now();
  const defaultWindowMs = syncConfig.logRetrievalIntervalMs * 2;
  const results = { devices: {}, inserted: 0, duplicates: 0 };

  for (const dev of devices) {
    await tuyaSync.ensureDeviceSyncStatus(dev.id, dev.tuya_device_id);

    const [statusRows] = await db.query(
      "SELECT last_log_retrieval_at FROM device_sync_status WHERE device_id = ?",
      [dev.id],
    );
    const lastRetrieval = statusRows[0]?.last_log_retrieval_at
      ? new Date(statusRows[0].last_log_retrieval_at).getTime()
      : now - defaultWindowMs;

    const startTimeMs = lastRetrieval;
    const endTimeMs = now;

    const [labRows] = await db.query(
      "SELECT id FROM laboratories WHERE device_id = ? LIMIT 1",
      [dev.tuya_device_id],
    );
    const laboratoryId = labRows[0]?.id ?? null;

    const wasOffline = true;
    const r = await retrieveFromDevice(
      dev.id,
      dev.tuya_device_id,
      laboratoryId,
      startTimeMs,
      endTimeMs,
      wasOffline,
    );

    results.devices[dev.id] = r;
    results.inserted += r.inserted;
    results.duplicates += r.duplicates;
  }

  return results;
}

/**
 * Manual retrieval for a single device and time range (for reconciliation).
 */
async function retrieveForDeviceInRange(deviceId, startTimeMs, endTimeMs) {
  const [devices] = await db.query(
    "SELECT d.id, d.tuya_device_id FROM devices d WHERE d.id = ? AND d.tuya_device_id IS NOT NULL",
    [deviceId],
  );
  if (devices.length === 0) return { error: "Device not found" };

  const [labRows] = await db.query(
    "SELECT id FROM laboratories WHERE device_id = ? LIMIT 1",
    [devices[0].tuya_device_id],
  );
  const laboratoryId = labRows[0]?.id ?? null;

  return retrieveFromDevice(
    devices[0].id,
    devices[0].tuya_device_id,
    laboratoryId,
    startTimeMs,
    endTimeMs,
    true,
  );
}

module.exports = {
  eventHash,
  isTimestampValid,
  normalizeTuyaLogItem,
  existsByHash,
  insertLogRow,
  retrieveFromDevice,
  pollAllDevices,
  retrieveForDeviceInRange,
};
