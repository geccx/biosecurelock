/**
 * Sync & Log Retrieval Configuration
 * Values from environment with defaults for local data retention and continuous logging.
 * Reference: https://developer.tuya.com/en/docs/cloud
 */
require("dotenv").config();

module.exports = {
  /** Polling interval for log retrieval from devices (ms). Default: 5 minutes */
  logRetrievalIntervalMs:
    parseInt(process.env.SYNC_LOG_RETRIEVAL_INTERVAL_MS, 10) || 5 * 60 * 1000,

  /** Polling interval for device status/heartbeat (ms). Default: 2 minutes */
  deviceStatusIntervalMs:
    parseInt(process.env.SYNC_DEVICE_STATUS_INTERVAL_MS, 10) || 2 * 60 * 1000,

  /** Credential/schedule sync retry interval (ms). Default: 10 minutes */
  syncRetryIntervalMs:
    parseInt(process.env.SYNC_RETRY_INTERVAL_MS, 10) || 10 * 60 * 1000,

  /** Maximum retry attempts for failed sync operations */
  maxRetryAttempts: parseInt(process.env.SYNC_MAX_RETRIES, 10) || 5,

  /** Request timeout for TUYA API calls (ms) */
  tuyaRequestTimeoutMs: parseInt(process.env.SYNC_TUYA_TIMEOUT_MS, 10) || 30000,

  /** Alert when device is offline for this many minutes */
  offlineAlertThresholdMinutes:
    parseInt(process.env.SYNC_OFFLINE_ALERT_MINUTES, 10) || 30,

  /** Consider log gap "unrecoverable" after this many hours */
  logGapUnrecoverableHours:
    parseInt(process.env.SYNC_LOG_GAP_UNRECOVERABLE_HOURS, 10) || 168, // 7 days

  /** Max clock drift (seconds) to accept device timestamp without flagging */
  maxClockDriftSeconds:
    parseInt(process.env.SYNC_MAX_CLOCK_DRIFT_SECONDS, 10) || 300,

  /** Log retention: delete access_logs older than this many days (0 = keep forever) */
  logRetentionDays: parseInt(process.env.SYNC_LOG_RETENTION_DAYS, 10) || 0,
};
