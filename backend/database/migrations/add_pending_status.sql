-- Migration: Add 'pending' status to lab_schedules table
-- Run this SQL to update existing database

USE smart_door_lock;

-- Alter the status column to include 'pending'
ALTER TABLE lab_schedules 
MODIFY COLUMN status ENUM('pending', 'scheduled', 'completed', 'cancelled') DEFAULT 'pending';

-- Update any existing 'scheduled' records created by teachers to 'pending' if needed
-- (This is optional - only run if you want to retroactively mark teacher-created schedules as pending)
-- UPDATE lab_schedules 
-- SET status = 'pending' 
-- WHERE status = 'scheduled' 
-- AND created_by IN (SELECT id FROM users WHERE role = 'teacher');

