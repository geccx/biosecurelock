/**
 * Reconciliation Engine
 * Detects connectivity gaps from last sync time, retrieves missed events when connection
 * restores, identifies and flags potential missing log periods, handles partial sync scenarios.
 */
const db = require("../models/mysql.models");
const tuyaSync = require("./tuyaSync.service");
const logRetrieval = require("./logRetrieval.service");
const syncConfig = require("../config/sync.config");
const logger = require("../utils/logger");

const GAP_UNRECOVERABLE_MS =
  (syncConfig.logGapUnrecoverableHours || 168) * 60 * 60 * 1000;

/**
 * Detect connectivity gaps: periods where last_successful_sync_at or last_log_retrieval_at
 * has a gap greater than the polling interval.
 */
async function detectGaps(deviceId = null) {
  const deviceFilter = deviceId ? "WHERE dss.device_id = ?" : "";
  const params = deviceId ? [deviceId] : [];
  const [rows] = await db.query(
    `SELECT dss.device_id, dss.tuya_device_id, dss.last_log_retrieval_at, dss.last_successful_sync_at, dss.updated_at
     FROM device_sync_status dss
     ${deviceFilter}`,
    params,
  );

  const gaps = [];
  const intervalMs = syncConfig.logRetrievalIntervalMs || 5 * 60 * 1000;

  for (const r of rows) {
    const lastRetrieval = r.last_log_retrieval_at
      ? new Date(r.last_log_retrieval_at).getTime()
      : null;
    const lastSync = r.last_successful_sync_at
      ? new Date(r.last_successful_sync_at).getTime()
      : null;
    const updated = r.updated_at ? new Date(r.updated_at).getTime() : null;
    const now = Date.now();

    const ref = lastRetrieval || lastSync || updated || now - intervalMs * 2;
    const gapEnd = now;
    const gapStart = ref;
    if (gapEnd - gapStart > intervalMs * 1.5) {
      const unrecoverable = gapEnd - gapStart > GAP_UNRECOVERABLE_MS;
      gaps.push({
        device_id: r.device_id,
        tuya_device_id: r.tuya_device_id,
        gap_start: new Date(gapStart),
        gap_end: new Date(gapEnd),
        unrecoverable,
      });
    }
  }

  return gaps;
}

/**
 * Insert log_retrieval_gaps for detected gaps (avoids duplicate by checking recent gap_end).
 */
async function recordGaps(gaps) {
  for (const g of gaps) {
    const [existing] = await db.query(
      "SELECT id FROM log_retrieval_gaps WHERE device_id = ? AND gap_end >= ? AND status IN ('open', 'retrieving') LIMIT 1",
      [g.device_id, g.gap_start],
    );
    if (existing.length > 0) {
      await db.query(
        "UPDATE log_retrieval_gaps SET gap_end = ?, status = ? WHERE id = ?",
        [g.gap_end, g.unrecoverable ? "unrecoverable" : "open", existing[0].id],
      );
    } else {
      await db.query(
        `INSERT INTO log_retrieval_gaps (device_id, tuya_device_id, gap_start, gap_end, status)
         VALUES (?, ?, ?, ?, ?)`,
        [
          g.device_id,
          g.tuya_device_id,
          g.gap_start,
          g.gap_end,
          g.unrecoverable ? "unrecoverable" : "open",
        ],
      );
    }
  }
}

/**
 * When connection restores: retrieve missed events for each device for the gap window.
 */
async function retrieveMissedEvents(deviceId = null) {
  const gaps = await detectGaps(deviceId);
  const results = { retrieved: 0, gapsResolved: 0, errors: [] };

  for (const gap of gaps) {
    if (gap.unrecoverable) {
      await db.query(
        "UPDATE log_retrieval_gaps SET status = 'unrecoverable' WHERE device_id = ? AND gap_start = ?",
        [gap.device_id, gap.gap_start],
      );
      continue;
    }

    try {
      const r = await logRetrieval.retrieveForDeviceInRange(
        gap.device_id,
        new Date(gap.gap_start).getTime(),
        new Date(gap.gap_end).getTime(),
      );
      if (r.error) {
        results.errors.push(r.error);
        continue;
      }
      results.retrieved += r.inserted || 0;
      await db.query(
        "UPDATE log_retrieval_gaps SET status = 'resolved', resolved_at = NOW() WHERE device_id = ? AND gap_start = ? AND status IN ('open', 'retrieving')",
        [gap.device_id, gap.gap_start],
      );
      results.gapsResolved++;
    } catch (err) {
      logger.error("Retrieve missed events failed", {
        deviceId: gap.device_id,
        error: err.message,
      });
      results.errors.push(err.message);
    }
  }

  return results;
}

/**
 * Identify and return potential missing log periods (open gaps).
 */
async function getMissingLogPeriods(deviceId = null) {
  const [rows] = await db.query(
    `SELECT id, device_id, tuya_device_id, gap_start, gap_end, status
     FROM log_retrieval_gaps
     WHERE status IN ('open', 'retrieving')
     ${deviceId ? "AND device_id = ?" : ""}
     ORDER BY gap_start ASC`,
    deviceId ? [deviceId] : [],
  );
  return rows;
}

/**
 * Run full reconciliation: detect gaps, record them, retrieve missed events.
 */
async function runReconciliation(deviceId = null) {
  const gaps = await detectGaps(deviceId);
  await recordGaps(gaps);
  return retrieveMissedEvents(deviceId);
}

module.exports = {
  detectGaps,
  recordGaps,
  retrieveMissedEvents,
  getMissingLogPeriods,
  runReconciliation,
};
