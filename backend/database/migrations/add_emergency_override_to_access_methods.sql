-- Migration: Add emergency_override to access_method ENUM in access_logs table
-- This migration adds the emergency_override access method for emergency unlock functionality

ALTER TABLE access_logs 
MODIFY COLUMN access_method ENUM(
  'fingerprint', 
  'rfid', 
  'pin', 
  'remote', 
  'auto_schedule', 
  'key', 
  'temporary_password', 
  'dynamic_password',
  'emergency_override'
) NOT NULL 
COMMENT 'Access method including emergency override';
