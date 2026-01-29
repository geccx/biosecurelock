-- Local Data Retention & Continuous Logging - Sync and Retention Schema
-- Run with: node scripts/run-migration.js migrations/create_sync_retention_tables.sql
-- References: users(id), enrollments(id), temporary_passwords(id), access_schedules(id),
--             access_logs(id), devices(id), laboratories(id)

-- =====================================================
-- 1. CREDENTIAL SYNC STATUS (PIN, RFID, Biometric)
-- Tracks which credentials are synced to which TUYA devices
-- =====================================================
CREATE TABLE IF NOT EXISTS credential_sync_status (
    id INT PRIMARY KEY AUTO_INCREMENT,
    credential_type ENUM('enrollment', 'temporary_password', 'pin', 'rfid', 'biometric') NOT NULL,
    credential_id INT NOT NULL COMMENT 'enrollments.id or temporary_passwords.id',
    device_id INT NOT NULL COMMENT 'devices.id (TUYA lock)',
    tuya_device_id VARCHAR(100) NOT NULL COMMENT 'TUYA cloud device ID',
    sync_status ENUM('pending', 'synced', 'failed', 'removed') DEFAULT 'pending',
    synced_at DATETIME NULL COMMENT 'Last successful sync to device',
    last_attempt_at DATETIME NULL,
    retry_count INT DEFAULT 0,
    error_message TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_credential_device (credential_type, credential_id, device_id),
    INDEX idx_credential (credential_type, credential_id),
    INDEX idx_device (device_id),
    INDEX idx_sync_status (sync_status),
    INDEX idx_synced_at (synced_at),
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- =====================================================
-- 2. ACCESS SCHEDULE SYNC (per device)
-- Tracks which access schedules are synced to which devices
-- =====================================================
CREATE TABLE IF NOT EXISTS access_schedule_sync (
    id INT PRIMARY KEY AUTO_INCREMENT,
    access_schedule_id INT NOT NULL,
    device_id INT NOT NULL,
    tuya_device_id VARCHAR(100) NOT NULL,
    sync_status ENUM('pending', 'synced', 'failed', 'removed') DEFAULT 'pending',
    synced_at DATETIME NULL,
    last_attempt_at DATETIME NULL,
    retry_count INT DEFAULT 0,
    error_message TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_schedule_device (access_schedule_id, device_id),
    INDEX idx_schedule (access_schedule_id),
    INDEX idx_device (device_id),
    INDEX idx_sync_status (sync_status),
    FOREIGN KEY (access_schedule_id) REFERENCES access_schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- =====================================================
-- 3. ACCESS LOGS - New columns applied by run-sync-retention-migration.js
-- (Script runs ALTERs with try/catch for idempotency)
-- Columns: event_hash, offline_flag, sync_timestamp, retrieval_status, external_event_id
-- Indexes: idx_event_hash, idx_offline_retrieval
-- =====================================================

-- =====================================================
-- 4. DEVICE SYNC STATUS
-- Per-device sync and connectivity tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS device_sync_status (
    id INT PRIMARY KEY AUTO_INCREMENT,
    device_id INT NOT NULL UNIQUE,
    tuya_device_id VARCHAR(100) NOT NULL,
    connectivity_status ENUM('online', 'offline', 'unknown') DEFAULT 'unknown',
    last_heartbeat_at DATETIME NULL,
    last_successful_sync_at DATETIME NULL COMMENT 'Last time any sync succeeded',
    last_credential_sync_at DATETIME NULL,
    last_schedule_sync_at DATETIME NULL,
    last_log_retrieval_at DATETIME NULL,
    pending_credentials_count INT DEFAULT 0,
    pending_schedules_count INT DEFAULT 0,
    last_error TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_connectivity (connectivity_status),
    INDEX idx_last_sync (last_successful_sync_at),
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- =====================================================
-- 5. SYNC QUEUE
-- Pending sync operations with retry tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS sync_queue (
    id INT PRIMARY KEY AUTO_INCREMENT,
    queue_type ENUM('credential', 'schedule', 'log_retrieval', 'bulk_credential') NOT NULL,
    entity_type VARCHAR(50) NOT NULL COMMENT 'enrollment, temporary_password, access_schedule',
    entity_id INT NOT NULL,
    device_id INT NOT NULL,
    tuya_device_id VARCHAR(100) NOT NULL,
    priority INT DEFAULT 5 COMMENT '1=highest, 10=lowest',
    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    payload JSON NULL COMMENT 'Data to sync',
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 5,
    last_attempt_at DATETIME NULL,
    error_message TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    INDEX idx_status_priority (status, priority),
    INDEX idx_device (device_id),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_created (created_at),
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- =====================================================
-- 6. LOG RETRIEVAL GAPS (potential missing periods)
-- =====================================================
CREATE TABLE IF NOT EXISTS log_retrieval_gaps (
    id INT PRIMARY KEY AUTO_INCREMENT,
    device_id INT NOT NULL,
    tuya_device_id VARCHAR(100) NOT NULL,
    gap_start DATETIME NOT NULL,
    gap_end DATETIME NOT NULL,
    status ENUM('open', 'retrieving', 'resolved', 'unrecoverable') DEFAULT 'open',
    resolved_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_device (device_id),
    INDEX idx_status (status),
    INDEX idx_gap (gap_start, gap_end),
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- =====================================================
-- 7. SYNC AUDIT TRAIL (credential/schedule changes)
-- =====================================================
CREATE TABLE IF NOT EXISTS sync_audit_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    action_type ENUM('credential_sync', 'schedule_sync', 'log_retrieve', 'force_sync', 'retry') NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT NULL,
    device_id INT NULL,
    user_id INT NULL COMMENT 'Admin who triggered if manual',
    success BOOLEAN NOT NULL,
    details JSON NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_action (action_type),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_created (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
);
