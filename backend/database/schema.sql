-- Smart Door Lock System - Database Schema
-- Run this SQL to set up your MySQL database

-- Create database
CREATE DATABASE IF NOT EXISTS smart_door_lock;
USE smart_door_lock;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'teacher', 'techsupport', 'user', 'visitor') DEFAULT 'user',
    status ENUM('active', 'inactive', 'pending') DEFAULT 'active',
    department VARCHAR(100),
    fabric_identity TEXT,
    fabric_certificate TEXT,
    fabric_private_key TEXT,
    tuya_user_id VARCHAR(255) NULL COMMENT 'Tuya platform user ID (uid) - set after registering user in Tuya and adding as device user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_status (status),
    INDEX idx_tuya_user_id (tuya_user_id)
);

-- Enrollments table (biometric data)
-- Note: Using 'enrollments' as table name (not 'enrollment_requests')
CREATE TABLE IF NOT EXISTS enrollments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    enrollment_type ENUM('fingerprint', 'rfid', 'pin') NOT NULL,
    enrollment_data JSON,
    status ENUM('pending', 'approved', 'rejected', 'synced', 'deleted') DEFAULT 'pending',
    tuya_unlock_id VARCHAR(100),
    approved_by INT,
    approved_at DATETIME,
    enrolled_at DATETIME,
    rejected_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_tuya_unlock_id (tuya_unlock_id)
);

-- Laboratories table
CREATE TABLE IF NOT EXISTS laboratories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(255) NOT NULL,
    capacity INT DEFAULT 30,
    lock_status ENUM('locked', 'unlocked') DEFAULT 'locked',
    current_occupancy INT DEFAULT 0,
    device_id VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_lock_status (lock_status)
);

-- Lab Schedules table
CREATE TABLE IF NOT EXISTS lab_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lab_name VARCHAR(100) NOT NULL,
    teacher_id INT NOT NULL,
    teacher_name VARCHAR(100),
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    subject VARCHAR(200),
    status ENUM('pending', 'scheduled', 'completed', 'cancelled') DEFAULT 'pending',
    created_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_teacher_id (teacher_id),
    INDEX idx_status (status),
    INDEX idx_start_time (start_time)
);

-- Schedule Move Requests table
CREATE TABLE IF NOT EXISTS schedule_move_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id INT NOT NULL,
    teacher_id INT NOT NULL,
    lab_name VARCHAR(100),
    current_start_time DATETIME NOT NULL,
    current_end_time DATETIME NOT NULL,
    requested_start_time DATETIME NOT NULL,
    requested_end_time DATETIME NOT NULL,
    reason TEXT NOT NULL,
    status ENUM('pending', 'approved', 'denied') DEFAULT 'pending',
    reviewed_by INT,
    reviewed_at DATETIME,
    denial_reason TEXT,
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES lab_schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_teacher_id (teacher_id)
);

-- Access Logs table
CREATE TABLE IF NOT EXISTS access_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    laboratory_id INT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    access_method ENUM('fingerprint', 'rfid', 'pin', 'remote', 'auto_schedule', 'key', 'temporary_password', 'dynamic_password') NOT NULL,
    access_type ENUM('unlock', 'lock') DEFAULT 'unlock',
    success BOOLEAN DEFAULT TRUE,
    blockchain_hash VARCHAR(255),
    fabric_tx_id VARCHAR(255),
    tuya_unlock_id VARCHAR(100),
    ip_address VARCHAR(45),
    details JSON,
    device_response JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (laboratory_id) REFERENCES laboratories(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_success (success),
    INDEX idx_tuya_unlock_id (tuya_unlock_id)
);

-- System Logs table
CREATE TABLE IF NOT EXISTS system_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    user_id INT,
    details JSON,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_event_type (event_type),
    INDEX idx_timestamp (timestamp)
);

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_name VARCHAR(100) NOT NULL,
    type ENUM('lock', 'fingerprint', 'rfid', 'network') NOT NULL,
    status ENUM('online', 'offline', 'error') DEFAULT 'offline',
    location VARCHAR(255),
    tuya_device_id VARCHAR(100),
    last_checked DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_type (type),
    INDEX idx_status (status)
);

-- System Configuration table
CREATE TABLE IF NOT EXISTS system_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lock_status ENUM('locked', 'unlocked') DEFAULT 'locked',
    auto_lock_enabled BOOLEAN DEFAULT TRUE,
    max_access_attempts INT DEFAULT 3,
    session_timeout INT DEFAULT 30,
    notifications_enabled BOOLEAN DEFAULT TRUE,
    blockchain_enabled BOOLEAN DEFAULT TRUE,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Access Schedules table (for recurring access permissions)
CREATE TABLE IF NOT EXISTS access_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100),
    days_of_week JSON,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    auto_unlock BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_is_active (is_active)
);

-- Temporary Passwords table
CREATE TABLE IF NOT EXISTS temporary_passwords (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    password_hash VARCHAR(255) NOT NULL,
    tuya_password_id VARCHAR(100),
    valid_from DATETIME NOT NULL,
    valid_until DATETIME NOT NULL,
    max_usage INT,
    current_usage INT DEFAULT 0,
    target_user_id INT,
    created_by INT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_tuya_password_id (tuya_password_id)
);

-- User Notification Preferences table
CREATE TABLE IF NOT EXISTS user_notification_preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    schedule_approved BOOLEAN DEFAULT TRUE,
    schedule_disapproved BOOLEAN DEFAULT TRUE,
    new_user_added BOOLEAN DEFAULT TRUE,
    device_error BOOLEAN DEFAULT TRUE,
    enrollment_approved BOOLEAN DEFAULT TRUE,
    enrollment_rejected BOOLEAN DEFAULT TRUE,
    move_request_approved BOOLEAN DEFAULT TRUE,
    move_request_denied BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
);

-- Notifications table (to store sent notifications)
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    `read` BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_read (`read`),
    INDEX idx_type (type),
    INDEX idx_created_at (created_at)
);

-- User Creation Backup table (to store API parameters for user creation)
-- Used to retry user creation when device comes back online
CREATE TABLE IF NOT EXISTS user_creation_backup (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    api_params JSON NOT NULL COMMENT 'Stored API parameters used for creating user',
    device_status ENUM('online', 'offline') DEFAULT 'offline' COMMENT 'Device status at creation time',
    sync_status ENUM('pending', 'synced', 'failed') DEFAULT 'pending' COMMENT 'Whether user was successfully synced to device',
    retry_count INT DEFAULT 0 COMMENT 'Number of retry attempts',
    last_retry_at DATETIME,
    error_message TEXT,
    created_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_sync_status (sync_status),
    INDEX idx_device_status (device_status),
    INDEX idx_created_at (created_at)
);

-- Insert default system configuration (required for the system to work)
INSERT INTO system_config (lock_status, auto_lock_enabled, max_access_attempts, session_timeout, notifications_enabled, blockchain_enabled) 
VALUES ('locked', TRUE, 3, 30, TRUE, TRUE)
ON DUPLICATE KEY UPDATE id=id;

-- =====================================================
-- SAMPLE DATA (OPTIONAL - Remove in production)
-- =====================================================
-- Uncomment the following lines to insert sample data for testing

-- Sample admin user (password: admin123)
INSERT INTO users (username, email, password_hash, role, status, department) 
VALUES ('Admin User', 'admin@lab.edu', '$2a$10$hvL.CEMTukN.1Jz6GuKyhO8adO46OE3ChAXzW1nVLvcu45dpjKkkG', 'admin', 'active', 'Administration')
ON DUPLICATE KEY UPDATE password_hash='$2a$10$hvL.CEMTukN.1Jz6GuKyhO8adO46OE3ChAXzW1nVLvcu45dpjKkkG';

-- Sample teachers (password: admin123)
INSERT INTO users (username, email, password_hash, role, status, department) VALUES
('Dr. Sarah Johnson', 'sarah.j@lab.edu', '$2a$10$hvL.CEMTukN.1Jz6GuKyhO8adO46OE3ChAXzW1nVLvcu45dpjKkkG', 'teacher', 'active', 'Computer Science'),
('Prof. Michael Chen', 'michael.c@lab.edu', '$2a$10$hvL.CEMTukN.1Jz6GuKyhO8adO46OE3ChAXzW1nVLvcu45dpjKkkG', 'teacher', 'active', 'Engineering')
ON DUPLICATE KEY UPDATE password_hash='$2a$10$hvL.CEMTukN.1Jz6GuKyhO8adO46OE3ChAXzW1nVLvcu45dpjKkkG';

-- Sample tech support (password: admin123)
INSERT INTO users (username, email, password_hash, role, status, department) 
VALUES ('Tech Support', 'support@lab.edu', '$2a$10$hvL.CEMTukN.1Jz6GuKyhO8adO46OE3ChAXzW1nVLvcu45dpjKkkG', 'techsupport', 'active', 'IT Department')
ON DUPLICATE KEY UPDATE password_hash='$2a$10$hvL.CEMTukN.1Jz6GuKyhO8adO46OE3ChAXzW1nVLvcu45dpjKkkG';

-- Sample laboratories
INSERT INTO laboratories (name, location, capacity, lock_status) VALUES
('Computer Lab 1', 'Building A, Floor 2', 30, 'locked'),
('Computer Lab 2', 'Building A, Floor 3', 25, 'locked'),
('Engineering Lab 1', 'Building B, Floor 1', 20, 'locked');

-- Sample devices
INSERT INTO devices (device_name, type, status, location) VALUES
('Main Door Lock', 'lock', 'online', 'Computer Lab 1'),
('Fingerprint Scanner', 'fingerprint', 'online', 'Computer Lab 1');

-- Note: To generate a bcrypt hash for passwords, use:
-- node -e "require('bcryptjs').hash('yourpassword', 10).then(console.log)"

