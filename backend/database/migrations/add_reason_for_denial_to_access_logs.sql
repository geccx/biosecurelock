-- Migration: Add reason_for_denial column to access_logs table
-- This migration adds a field to store the reason when access is denied

ALTER TABLE access_logs 
ADD COLUMN reason_for_denial TEXT NULL 
COMMENT 'Reason for access denial, if applicable' 
AFTER success;
