-- Role Privileges table for managing access privileges per role
-- This allows admins to dynamically configure permissions for Teacher and TechSupport roles

CREATE TABLE IF NOT EXISTS role_privileges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role ENUM('admin', 'teacher', 'techsupport', 'user', 'visitor') NOT NULL UNIQUE,
    permissions JSON NOT NULL COMMENT 'Array of permission strings',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_role (role)
);

-- Insert default role privileges based on current ROLE_PERMISSIONS in auth.middleware.js
-- Admin: All permissions (will be managed separately, but included for consistency)
INSERT INTO role_privileges (role, permissions) VALUES
('admin', JSON_ARRAY(
    'create_admin', 'create_user', 'edit_user', 'delete_user', 'deactivate_user', 'enroll_user',
    'create_schedule', 'edit_schedule', 'delete_schedule', 'request_schedule_move', 'approve_schedule_move',
    'view_all_schedules', 'view_own_schedules', 'unlock_lab', 'lock_lab', 'emergency_override',
    'view_all_logs', 'view_own_logs', 'view_blockchain_logs', 'generate_reports',
    'modify_system_config', 'modify_security_policies', 'modify_blockchain_settings',
    'view_devices', 'manage_devices', 'troubleshoot'
))
ON DUPLICATE KEY UPDATE permissions=VALUES(permissions);

-- TechSupport: Similar to admin but with restrictions
INSERT INTO role_privileges (role, permissions) VALUES
('techsupport', JSON_ARRAY(
    'create_user', 'edit_user', 'deactivate_user', 'enroll_user',
    'approve_schedule_move', 'view_all_schedules', 'view_own_schedules',
    'unlock_lab', 'lock_lab', 'emergency_override',
    'view_all_logs', 'view_own_logs', 'view_blockchain_logs',
    'view_devices', 'troubleshoot'
))
ON DUPLICATE KEY UPDATE permissions=VALUES(permissions);

-- Teacher: Limited permissions
INSERT INTO role_privileges (role, permissions) VALUES
('teacher', JSON_ARRAY(
    'request_schedule_move', 'view_own_schedules', 'view_own_logs'
))
ON DUPLICATE KEY UPDATE permissions=VALUES(permissions);

-- User: Basic permissions
INSERT INTO role_privileges (role, permissions) VALUES
('user', JSON_ARRAY('view_own_logs'))
ON DUPLICATE KEY UPDATE permissions=VALUES(permissions);

-- Visitor: No permissions
INSERT INTO role_privileges (role, permissions) VALUES
('visitor', JSON_ARRAY())
ON DUPLICATE KEY UPDATE permissions=VALUES(permissions);
