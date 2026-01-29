-- Semester Schedule Management - Add tables to existing database
-- Run with: node scripts/run-migration.js (or pass this file path)
-- Uses existing users(id) for foreign keys

-- 1. Semesters table
CREATE TABLE IF NOT EXISTS semesters (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    academic_year VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status ENUM('draft', 'approved', 'active', 'completed') DEFAULT 'draft',
    approved_by INT NULL,
    approved_at DATETIME NULL,
    created_by INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_status (status),
    INDEX idx_academic_year (academic_year),
    INDEX idx_dates (start_date, end_date)
);

-- 2. Schedule Templates (Master Timetable)
CREATE TABLE IF NOT EXISTS schedule_templates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    semester_id INT NOT NULL,
    course_code VARCHAR(50) NOT NULL,
    subject_code VARCHAR(50) NOT NULL,
    instructor_name VARCHAR(100) NOT NULL,
    day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room_lab VARCHAR(50) NOT NULL,
    units DECIMAL(3,1) NOT NULL,
    hours DECIMAL(3,1) NOT NULL,
    is_special BOOLEAN DEFAULT FALSE,
    special_notes VARCHAR(255) NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE,
    INDEX idx_semester_day (semester_id, day_of_week),
    INDEX idx_instructor (instructor_name),
    INDEX idx_room (room_lab)
);

-- 3. Schedule Instances (Generated Weekly Schedules)
CREATE TABLE IF NOT EXISTS schedule_instances (
    id INT PRIMARY KEY AUTO_INCREMENT,
    template_id INT NOT NULL,
    semester_id INT NOT NULL,
    schedule_date DATE NOT NULL,
    course_code VARCHAR(50) NOT NULL,
    subject_code VARCHAR(50) NOT NULL,
    instructor_name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room_lab VARCHAR(50) NOT NULL,
    units DECIMAL(3,1) NOT NULL,
    hours DECIMAL(3,1) NOT NULL,
    status ENUM('scheduled', 'modified', 'cancelled') DEFAULT 'scheduled',
    is_modified BOOLEAN DEFAULT FALSE,
    notes TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES schedule_templates(id) ON DELETE CASCADE,
    FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE,
    INDEX idx_date (schedule_date),
    INDEX idx_semester_date (semester_id, schedule_date),
    INDEX idx_room_date (room_lab, schedule_date)
);

-- 4. Schedule Changes (Audit Trail)
CREATE TABLE IF NOT EXISTS schedule_changes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    change_type ENUM('template_create', 'template_modify', 'instance_modify', 'instance_cancel', 'bulk_generate') NOT NULL,
    reference_type ENUM('template', 'instance') NOT NULL,
    reference_id INT NOT NULL,
    old_values JSON NULL,
    new_values JSON NULL,
    reason TEXT NULL,
    requested_by INT NOT NULL,
    approved_by INT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME NULL,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_reference (reference_type, reference_id)
);

-- 5. Semester Exclusions (Holidays/Breaks)
CREATE TABLE IF NOT EXISTS semester_exclusions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    semester_id INT NOT NULL,
    exclusion_date DATE NOT NULL,
    reason VARCHAR(255) NOT NULL,
    created_by INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_semester_date (semester_id, exclusion_date)
);
