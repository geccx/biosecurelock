/**
 * Run sync/retention schema migration:
 * - Creates credential_sync_status, access_schedule_sync, device_sync_status,
 *   sync_queue, log_retrieval_gaps, sync_audit_log
 * - Adds columns to access_logs (event_hash, offline_flag, sync_timestamp, retrieval_status, external_event_id)
 * - Adds indexes for deduplication and gap detection
 * Idempotent: skips ALTER/INDEX if column/index already exists.
 */
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const MIGRATION_SQL = path.join(
  __dirname,
  "../database/migrations/create_sync_retention_tables.sql",
);

// ALTER and INDEX statements for access_logs (run individually to allow idempotency)
const ACCESS_LOGS_ALTERS = [
  "ALTER TABLE access_logs ADD COLUMN event_hash VARCHAR(64) NULL COMMENT 'SHA256 for deduplication' AFTER details",
  "ALTER TABLE access_logs ADD COLUMN offline_flag BOOLEAN DEFAULT FALSE COMMENT 'Event occurred while device was offline'",
  "ALTER TABLE access_logs ADD COLUMN sync_timestamp DATETIME NULL COMMENT 'When log was retrieved from device'",
  "ALTER TABLE access_logs ADD COLUMN retrieval_status ENUM('realtime', 'buffered', 'reconciled') DEFAULT 'realtime'",
  "ALTER TABLE access_logs ADD COLUMN external_event_id VARCHAR(255) NULL COMMENT 'Device/TUYA event ID'",
];

const ACCESS_LOGS_INDEXES = [
  "CREATE INDEX idx_event_hash ON access_logs (event_hash)",
  "CREATE INDEX idx_offline_retrieval ON access_logs (offline_flag, retrieval_status, sync_timestamp)",
];

async function runMigration() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "railway",
      multipleStatements: true,
    });

    console.log("Connected to database");

    // 1. Run main SQL (CREATE TABLEs only - file has no access_logs ALTERs)
    const sql = fs.readFileSync(MIGRATION_SQL, "utf8");
    await connection.query(sql);
    console.log("✓ Sync/retention tables created or already exist");

    // 2. Add access_logs columns (ignore duplicate column)
    for (const stmt of ACCESS_LOGS_ALTERS) {
      try {
        await connection.query(stmt);
        console.log("✓ access_logs column added");
      } catch (err) {
        if (err.code === "ER_DUP_FIELDNAME") {
          console.log("  (column already exists, skipping)");
        } else throw err;
      }
    }

    // 3. Add indexes (ignore duplicate key)
    for (const stmt of ACCESS_LOGS_INDEXES) {
      try {
        await connection.query(stmt);
        console.log("✓ access_logs index added");
      } catch (err) {
        if (err.code === "ER_DUP_KEYNAME" || err.code === "ER_DUP_INDEX") {
          console.log("  (index already exists, skipping)");
        } else throw err;
      }
    }

    console.log("✅ Sync retention migration completed successfully.");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log("Database connection closed");
    }
  }
}

runMigration();
