-- Migration: Create password_requests table
-- Run this SQL to create the password requests table for temporary password approval workflow

USE smart_door_lock;

-- Password Requests table
CREATE TABLE IF NOT EXISTS password_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id INT NOT NULL,
    user_id INT NOT NULL,
    tuya_user_id VARCHAR(255),
    password_name VARCHAR(255) NOT NULL,
    password VARCHAR(10) NOT NULL COMMENT 'Plain password (6-7 digits)',
    valid_from DATETIME NOT NULL,
    valid_until DATETIME NOT NULL,
    max_usage INT DEFAULT 1 COMMENT '1 = once, 0 = multiple',
    phone VARCHAR(50),
    time_zone VARCHAR(100),
    schedule_list JSON COMMENT 'Periodic schedule list',
    relate_dev_list TEXT COMMENT 'Comma-separated device IDs for Bluetooth locks',
    status ENUM('pending', 'approved', 'rejected', 'completed') DEFAULT 'pending',
    approved_by INT,
    approved_at DATETIME,
    rejected_reason TEXT,
    tuya_password_id VARCHAR(255) COMMENT 'ID returned from Tuya API after approval',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES lab_schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_user_id (user_id),
    INDEX idx_schedule_id (schedule_id),
    INDEX idx_tuya_user_id (tuya_user_id)
);
