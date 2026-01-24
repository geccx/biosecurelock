-- Migration: add_recurrence_to_lab_schedules.sql
-- Description: Add weekly recurrence support to lab_schedules table
-- Date: 2026-01-25

USE lab_access_system;

-- Add new columns for recurring schedules
ALTER TABLE lab_schedules 
ADD COLUMN recurrence_type ENUM('one-time', 'weekly') DEFAULT 'one-time' 
  COMMENT 'Type of schedule: one-time or weekly recurring',
ADD COLUMN days_of_week JSON DEFAULT NULL 
  COMMENT 'Array of days for weekly schedules: ["Monday", "Tuesday", etc.]',
ADD COLUMN recurrence_end_date DATE DEFAULT NULL 
  COMMENT 'End date for recurring schedules (NULL = ongoing)';

-- Update existing records to have empty array for days_of_week
UPDATE lab_schedules 
SET days_of_week = JSON_ARRAY(), 
    recurrence_type = 'one-time' 
WHERE days_of_week IS NULL;

-- Add index for better query performance when checking schedules
CREATE INDEX idx_recurrence_type ON lab_schedules(recurrence_type);
CREATE INDEX idx_recurrence_end_date ON lab_schedules(recurrence_end_date);

-- Optional: Add a check to ensure weekly schedules have days_of_week
-- Note: MySQL doesn't support JSON validation in CHECK constraints directly,
-- so this should be handled in application logic