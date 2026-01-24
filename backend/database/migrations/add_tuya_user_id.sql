-- Migration: Add tuya_user_id field to users table
-- Run this SQL to update existing database
--
-- This field stores the Tuya platform user ID (uid) after registering the user
-- in Tuya platform and adding them as a device user

USE smart_door_lock;

-- Add tuya_user_id column to users table
ALTER TABLE users 
ADD COLUMN tuya_user_id VARCHAR(255) NULL AFTER fabric_private_key;

-- Add index for faster lookups
CREATE INDEX idx_tuya_user_id ON users(tuya_user_id);

-- Optional: Add comment to document the field
ALTER TABLE users 
MODIFY COLUMN tuya_user_id VARCHAR(255) NULL COMMENT 'Tuya platform user ID (uid) - set after registering user in Tuya and adding as device user';

