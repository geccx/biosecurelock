-- Migration: add_recurrence_to_lab_schedules.sql
-- Description: Add weekly recurrence support to lab_schedules table
-- Date: 2026-01-25

-- Use the configured database
USE `railway`;

-- Add recurrence_type column if it doesn't exist
SET @dbname = DATABASE();
SET @tablename = 'lab_schedules';
SET @columnname = 'recurrence_type';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = @tablename
      AND table_schema = @dbname
      AND column_name = @columnname
  ) > 0,
  "SELECT 'Column recurrence_type already exists' as message",
  "ALTER TABLE lab_schedules ADD COLUMN recurrence_type ENUM('one-time', 'weekly') DEFAULT 'one-time' COMMENT 'Type of schedule: one-time or weekly recurring' AFTER status"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add days_of_week column if it doesn't exist
SET @columnname = 'days_of_week';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = @tablename
      AND table_schema = @dbname
      AND column_name = @columnname
  ) > 0,
  "SELECT 'Column days_of_week already exists' as message",
  "ALTER TABLE lab_schedules ADD COLUMN days_of_week JSON DEFAULT NULL COMMENT 'Array of days for weekly schedules' AFTER recurrence_type"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add recurrence_end_date column if it doesn't exist
SET @columnname = 'recurrence_end_date';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = @tablename
      AND table_schema = @dbname
      AND column_name = @columnname
  ) > 0,
  "SELECT 'Column recurrence_end_date already exists' as message",
  "ALTER TABLE lab_schedules ADD COLUMN recurrence_end_date DATE DEFAULT NULL COMMENT 'End date for recurring schedules' AFTER days_of_week"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Update existing records with default values
UPDATE lab_schedules 
SET recurrence_type = COALESCE(recurrence_type, 'one-time'),
    days_of_week = COALESCE(days_of_week, JSON_ARRAY())
WHERE recurrence_type IS NULL OR days_of_week IS NULL;

-- Add index for recurrence_type if it doesn't exist
SET @indexname = 'idx_recurrence_type';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE table_name = @tablename
      AND table_schema = @dbname
      AND index_name = @indexname
  ) > 0,
  "SELECT 'Index idx_recurrence_type already exists' as message",
  "CREATE INDEX idx_recurrence_type ON lab_schedules(recurrence_type)"
));
PREPARE createIndexIfNotExists FROM @preparedStatement;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;

-- Add index for recurrence_end_date if it doesn't exist
SET @indexname = 'idx_recurrence_end_date';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE table_name = @tablename
      AND table_schema = @dbname
      AND index_name = @indexname
  ) > 0,
  "SELECT 'Index idx_recurrence_end_date already exists' as message",
  "CREATE INDEX idx_recurrence_end_date ON lab_schedules(recurrence_end_date)"
));
PREPARE createIndexIfNotExists FROM @preparedStatement;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;

-- Display success message
SELECT '✅ Migration completed successfully!' as Status;
SELECT 'Columns added: recurrence_type, days_of_week, recurrence_end_date' as Changes;