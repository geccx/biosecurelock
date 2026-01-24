const db = require("../models/mysql.models");
const fabricService = require("../services/fabric.service");
const logger = require("../utils/logger");
const { formatDateForMySQLManila } = require("../utils/timezone.utils");

/**
 * Create a new lab schedule
 */
exports.createSchedule = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { labName, teacherId, startTime, endTime, subject, passwordRequest } =
      req.body;
    const createdBy = req.user.id;

    // Validate and format dates for MySQL
    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: "startTime and endTime are required",
      });
    }

    // Convert ISO 8601 format to MySQL DATETIME format in Asia/Manila timezone
    // Ensure dates are properly formatted for MySQL (YYYY-MM-DD HH:MM:SS)
    let formattedStartTime, formattedEndTime;
    try {
      formattedStartTime = formatDateForMySQLManila(startTime);
      formattedEndTime = formatDateForMySQLManila(endTime);

      // Verify conversion worked - if still in ISO format, throw error
      if (
        formattedStartTime.includes("T") ||
        formattedStartTime.includes("Z")
      ) {
        throw new Error(`Date formatting failed for startTime: ${startTime}`);
      }
      if (formattedEndTime.includes("T") || formattedEndTime.includes("Z")) {
        throw new Error(`Date formatting failed for endTime: ${endTime}`);
      }

      logger.debug("Date conversion successful:", {
        originalStartTime: startTime,
        formattedStartTime: formattedStartTime,
        originalEndTime: endTime,
        formattedEndTime: formattedEndTime,
      });
    } catch (formatError) {
      logger.error("Date formatting error:", formatError);
      return res.status(400).json({
        success: false,
        error: `Invalid date format: ${formatError.message}`,
      });
    }

    // Check for schedule conflicts
    // A conflict occurs when:
    // 1. Same lab name
    // 2. Status is 'scheduled' or 'pending' (active schedules)
    // 3. Time ranges overlap (new start < existing end AND new end > existing start)
    const [conflicts] = await connection.query(
      `SELECT id, teacher_name, start_time, end_time, status, subject
       FROM lab_schedules 
       WHERE lab_name = ? 
       AND status IN ('scheduled', 'pending')
       AND start_time < ? 
       AND end_time > ?`,
      [labName, formattedEndTime, formattedStartTime]
    );

    if (conflicts.length > 0) {
      const conflict = conflicts[0];
      logger.warn("Schedule conflict detected", {
        labName,
        newStartTime: formattedStartTime,
        newEndTime: formattedEndTime,
        conflictingScheduleId: conflict.id,
        conflictingTeacher: conflict.teacher_name,
        conflictingStartTime: conflict.start_time,
        conflictingEndTime: conflict.end_time,
        conflictingStatus: conflict.status,
      });

      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: "Schedule conflict detected for this lab and time slot",
        details: {
          conflictingSchedule: {
            id: conflict.id,
            teacher: conflict.teacher_name,
            startTime: conflict.start_time,
            endTime: conflict.end_time,
            status: conflict.status,
            subject: conflict.subject,
          },
          requestedTime: {
            startTime: formattedStartTime,
            endTime: formattedEndTime,
          },
        },
      });
    }

    // Get teacher name
    const [teachers] = await connection.query(
      "SELECT username FROM users WHERE id = ?",
      [teacherId]
    );
    const teacherName = teachers[0]?.username || "Unknown";

    // Insert schedule with pending status if created by teacher (non-admin)
    // Check if user is teacher
    const [userCheck] = await connection.query(
      "SELECT role FROM users WHERE id = ?",
      [createdBy]
    );
    const userRole = userCheck[0]?.role || "teacher";
    const scheduleStatus = userRole === "teacher" ? "pending" : "scheduled";

    // Insert schedule
    const [result] = await connection.query(
      `INSERT INTO lab_schedules (lab_name, teacher_id, teacher_name, start_time, end_time, subject, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        labName,
        teacherId,
        teacherName,
        formattedStartTime,
        formattedEndTime,
        subject,
        scheduleStatus,
        createdBy,
      ]
    );

    const scheduleId = result.insertId;

    // If password request is included, save it to password_requests table
    if (passwordRequest) {
      // Get user's Tuya user ID
      const [users] = await connection.query(
        "SELECT tuya_user_id FROM users WHERE id = ?",
        [teacherId]
      );
      const tuyaUserId = users[0]?.tuya_user_id || null;

      // Validate password request data
      if (!passwordRequest.passwordName || !passwordRequest.password) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error:
            "Password name and password are required when including password request",
        });
      }

      if (
        passwordRequest.password.length < 6 ||
        passwordRequest.password.length > 7 ||
        !/^\d+$/.test(passwordRequest.password)
      ) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: "Password must be 6-7 digits",
        });
      }

      // Check if teacher has an existing valid temporary password
      // A password is considered valid if:
      // 1. It's active
      // 2. It has a Tuya password ID (actually created in Tuya)
      // 3. It hasn't expired (valid_until >= schedule start time)
      // 4. It hasn't exceeded max usage (if max_usage is set)
      const scheduleStartTime = passwordRequest.validFrom
        ? formatDateForMySQLManila(passwordRequest.validFrom)
        : formattedStartTime;
      
      const [existingPasswords] = await connection.query(
        `SELECT id, password_hash, tuya_password_id, valid_from, valid_until, 
                max_usage, current_usage, is_active, name
         FROM temporary_passwords 
         WHERE target_user_id = ? 
         AND is_active = TRUE 
         AND tuya_password_id IS NOT NULL 
         AND tuya_password_id != ''
         AND valid_from <= ?
         AND valid_until >= ?
         AND (max_usage IS NULL OR current_usage < max_usage)
         ORDER BY created_at DESC
         LIMIT 1`,
        [teacherId, scheduleStartTime, scheduleStartTime]
      );

      let passwordToUse = passwordRequest.password;
      let passwordNameToUse = passwordRequest.passwordName;

      // If an existing valid password is found, use it instead
      if (existingPasswords.length > 0) {
        const existingPassword = existingPasswords[0];
        passwordToUse = existingPassword.password_hash; // Use the existing password
        passwordNameToUse = existingPassword.name || passwordRequest.passwordName;
        
        logger.info("Reusing existing temporary password for teacher", {
          teacherId,
          tempPasswordId: existingPassword.id,
          tuyaPasswordId: existingPassword.tuya_password_id,
          validUntil: existingPassword.valid_until,
          currentUsage: existingPassword.current_usage,
          maxUsage: existingPassword.max_usage,
        });
      }

      // Insert password request with pending status
      await connection.query(
        `INSERT INTO password_requests (
          schedule_id, user_id, tuya_user_id, password_name, password,
          valid_from, valid_until, max_usage, phone, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
        [
          scheduleId,
          teacherId,
          tuyaUserId,
          passwordNameToUse,
          passwordToUse,
          passwordRequest.validFrom
            ? formatDateForMySQLManila(passwordRequest.validFrom)
            : formattedStartTime,
          passwordRequest.validUntil
            ? formatDateForMySQLManila(passwordRequest.validUntil)
            : formattedEndTime,
          passwordRequest.maxUsage || 1,
          passwordRequest.phone || null,
        ]
      );
    }

    // Commit transaction
    await connection.commit();

    // Log to blockchain
    try {
      await fabricService.submitTransaction("CreateSchedule", {
        scheduleId: scheduleId.toString(),
        labName,
        teacherId: teacherId.toString(),
        startTime,
        endTime,
        createdBy: createdBy.toString(),
      });
    } catch (fabricError) {
      logger.warn("Failed to log schedule to blockchain:", fabricError);
    }

    logger.info("Lab schedule created", { scheduleId });

    res.status(201).json({
      success: true,
      data: {
        id: scheduleId,
        labName,
        teacherId,
        teacherName,
        startTime,
        endTime,
        subject,
        status: scheduleStatus,
        createdBy,
        createdAt: new Date(),
      },
    });
  } catch (error) {
    await connection.rollback();
    logger.error("Error creating lab schedule:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create schedule",
    });
  } finally {
    connection.release();
  }
};

/**
 * Get all lab schedules
 */
exports.getAllSchedules = async (req, res) => {
  try {
    const { status, teacherId, labName, startDate, endDate, limit, offset } =
      req.query;

    let query = `
      SELECT ls.*, u.username as teacher_name
      FROM lab_schedules ls
      LEFT JOIN users u ON ls.teacher_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += " AND ls.status = ?";
      params.push(status);
    }

    if (teacherId) {
      query += " AND ls.teacher_id = ?";
      params.push(teacherId);
    }

    if (labName) {
      query += " AND ls.lab_name LIKE ?";
      params.push(`%${labName}%`);
    }

    if (startDate) {
      query += " AND ls.start_time >= ?";
      params.push(startDate);
    }

    if (endDate) {
      query += " AND ls.end_time <= ?";
      params.push(endDate);
    }

    query += " ORDER BY ls.start_time DESC";

    if (limit) {
      query += " LIMIT ?";
      params.push(parseInt(limit));
      if (offset) {
        query += " OFFSET ?";
        params.push(parseInt(offset));
      }
    }

    const [schedules] = await db.query(query, params);

    res.json({
      success: true,
      data: schedules.map((s) => ({
        id: s.id.toString(),
        labName: s.lab_name,
        teacherId: s.teacher_id.toString(),
        teacherName: s.teacher_name || "Unknown",
        startTime: s.start_time,
        endTime: s.end_time,
        subject: s.subject,
        status: s.status,
        createdBy: s.created_by?.toString(),
        createdAt: s.created_at,
      })),
    });
  } catch (error) {
    logger.error("Error fetching lab schedules:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch schedules",
    });
  }
};

/**
 * Get schedules for a specific teacher
 */
exports.getTeacherSchedules = async (req, res) => {
  try {
    const teacherId = req.params.teacherId || req.user.id;

    const [schedules] = await db.query(
      `SELECT ls.*, u.username as teacher_name
       FROM lab_schedules ls
       LEFT JOIN users u ON ls.teacher_id = u.id
       WHERE ls.teacher_id = ?
       ORDER BY ls.start_time DESC`,
      [teacherId]
    );

    res.json({
      success: true,
      data: schedules.map((s) => ({
        id: s.id.toString(),
        labName: s.lab_name,
        teacherId: s.teacher_id.toString(),
        teacherName: s.teacher_name || "Unknown",
        startTime: s.start_time,
        endTime: s.end_time,
        subject: s.subject,
        status: s.status,
        createdBy: s.created_by?.toString(),
        createdAt: s.created_at,
      })),
    });
  } catch (error) {
    logger.error("Error fetching teacher schedules:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch schedules",
    });
  }
};

/**
 * Get a single schedule by ID
 */
exports.getScheduleById = async (req, res) => {
  try {
    const { scheduleId } = req.params;

    const [schedules] = await db.query(
      `SELECT ls.*, u.username as teacher_name
       FROM lab_schedules ls
       LEFT JOIN users u ON ls.teacher_id = u.id
       WHERE ls.id = ?`,
      [scheduleId]
    );

    if (schedules.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Schedule not found",
      });
    }

    const s = schedules[0];
    res.json({
      success: true,
      data: {
        id: s.id.toString(),
        labName: s.lab_name,
        teacherId: s.teacher_id.toString(),
        teacherName: s.teacher_name || "Unknown",
        startTime: s.start_time,
        endTime: s.end_time,
        subject: s.subject,
        status: s.status,
        createdBy: s.created_by?.toString(),
        createdAt: s.created_at,
      },
    });
  } catch (error) {
    logger.error("Error fetching schedule:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch schedule",
    });
  }
};

/**
 * Update a schedule
 */
exports.updateSchedule = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { labName, teacherId, startTime, endTime, subject, status } =
      req.body;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    // Check if schedule exists and get current details
    const [existingSchedule] = await db.query(
      "SELECT teacher_id, lab_name, start_time, end_time FROM lab_schedules WHERE id = ?",
      [scheduleId]
    );

    if (existingSchedule.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Schedule not found",
      });
    }

    // Authorization check: teachers can only update their own schedules
    if (
      currentUserRole === "teacher" &&
      existingSchedule[0].teacher_id !== currentUserId
    ) {
      return res.status(403).json({
        success: false,
        error: "You can only update your own schedules",
      });
    }

    // Teachers cannot change teacherId or status
    if (currentUserRole === "teacher") {
      if (teacherId && teacherId !== existingSchedule[0].teacher_id) {
        return res.status(403).json({
          success: false,
          error: "You cannot change the teacher assignment",
        });
      }
      if (status) {
        return res.status(403).json({
          success: false,
          error: "You cannot change the schedule status",
        });
      }
    }

    // If lab name, start time, or end time is being updated, check for conflicts
    const needsConflictCheck = labName || startTime || endTime;

    if (needsConflictCheck) {
      // Get the values that will be used (either new or existing)
      const finalLabName = labName || existingSchedule[0].lab_name;
      let finalStartTime = startTime
        ? formatDateForMySQLManila(startTime)
        : existingSchedule[0].start_time;
      let finalEndTime = endTime
        ? formatDateForMySQLManila(endTime)
        : existingSchedule[0].end_time;

      // Check for schedule conflicts (excluding the current schedule being updated)
      const [conflicts] = await db.query(
        `SELECT id, teacher_name, start_time, end_time, status, subject
         FROM lab_schedules 
         WHERE lab_name = ? 
         AND status IN ('scheduled', 'pending')
         AND id != ?
         AND start_time < ? 
         AND end_time > ?`,
        [finalLabName, scheduleId, finalEndTime, finalStartTime]
      );

      if (conflicts.length > 0) {
        const conflict = conflicts[0];
        logger.warn("Schedule conflict detected during update", {
          scheduleId,
          labName: finalLabName,
          newStartTime: finalStartTime,
          newEndTime: finalEndTime,
          conflictingScheduleId: conflict.id,
          conflictingTeacher: conflict.teacher_name,
          conflictingStartTime: conflict.start_time,
          conflictingEndTime: conflict.end_time,
        });

        return res.status(400).json({
          success: false,
          error: "Schedule conflict detected for this lab and time slot",
          details: {
            conflictingSchedule: {
              id: conflict.id,
              teacher: conflict.teacher_name,
              startTime: conflict.start_time,
              endTime: conflict.end_time,
              status: conflict.status,
              subject: conflict.subject,
            },
            requestedTime: {
              startTime: finalStartTime,
              endTime: finalEndTime,
            },
          },
        });
      }
    }

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (labName) {
      updates.push("lab_name = ?");
      params.push(labName);
    }
    if (teacherId && currentUserRole !== "teacher") {
      updates.push("teacher_id = ?");
      params.push(teacherId);

      // Update teacher name
      const [teachers] = await db.query(
        "SELECT username FROM users WHERE id = ?",
        [teacherId]
      );
      if (teachers.length > 0) {
        updates.push("teacher_name = ?");
        params.push(teachers[0].username);
      }
    }
    if (startTime) {
      updates.push("start_time = ?");
      params.push(formatDateForMySQLManila(startTime));
    }
    if (endTime) {
      updates.push("end_time = ?");
      params.push(formatDateForMySQLManila(endTime));
    }
    if (subject !== undefined) {
      updates.push("subject = ?");
      params.push(subject);
    }
    if (status && currentUserRole !== "teacher") {
      updates.push("status = ?");
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No fields to update",
      });
    }

    updates.push("updated_at = NOW()");
    params.push(scheduleId);

    await db.query(
      `UPDATE lab_schedules SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    logger.info("Lab schedule updated", { scheduleId, userId: currentUserId });

    res.json({
      success: true,
      message: "Schedule updated successfully",
    });
  } catch (error) {
    logger.error("Error updating schedule:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update schedule",
    });
  }
};

/**
 * Delete a schedule
 */
exports.deleteSchedule = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    // Check if schedule exists and get current details
    const [existingSchedule] = await db.query(
      "SELECT teacher_id, status FROM lab_schedules WHERE id = ?",
      [scheduleId]
    );

    if (existingSchedule.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Schedule not found",
      });
    }

    // Authorization check: teachers can only delete their own schedules
    if (
      currentUserRole === "teacher" &&
      existingSchedule[0].teacher_id !== currentUserId
    ) {
      return res.status(403).json({
        success: false,
        error: "You can only delete your own schedules",
      });
    }

    // Teachers cannot delete completed schedules
    if (
      currentUserRole === "teacher" &&
      existingSchedule[0].status === "completed"
    ) {
      return res.status(403).json({
        success: false,
        error: "You cannot delete completed schedules",
      });
    }

    await db.query("DELETE FROM lab_schedules WHERE id = ?", [scheduleId]);

    logger.info("Lab schedule deleted", { scheduleId, userId: currentUserId });

    res.json({
      success: true,
      message: "Schedule deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting schedule:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete schedule",
    });
  }
};

/**
 * Approve a pending schedule
 */
exports.approveSchedule = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const reviewedBy = req.user.id;
    const currentUserRole = req.user.role;

    // Only admin and techsupport can approve schedules
    if (currentUserRole !== "admin" && currentUserRole !== "techsupport") {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to approve schedules",
      });
    }

    // Check if schedule exists and is pending
    const [schedules] = await db.query(
      "SELECT * FROM lab_schedules WHERE id = ? AND status = 'pending'",
      [scheduleId]
    );

    if (schedules.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Pending schedule not found or already processed",
      });
    }

    const schedule = schedules[0];

    // Check for schedule conflicts before approving
    // A conflict occurs when:
    // 1. Same lab name
    // 2. Status is 'scheduled' or 'pending' (active schedules)
    // 3. Time ranges overlap (new start < existing end AND new end > existing start)
    // 4. Exclude the current schedule being approved
    const [conflicts] = await db.query(
      `SELECT id, teacher_name, start_time, end_time, status, subject
       FROM lab_schedules 
       WHERE lab_name = ? 
       AND status IN ('scheduled', 'pending')
       AND id != ?
       AND start_time < ? 
       AND end_time > ?`,
      [schedule.lab_name, scheduleId, schedule.end_time, schedule.start_time]
    );

    if (conflicts.length > 0) {
      const conflict = conflicts[0];
      logger.warn("Schedule conflict detected during approval", {
        scheduleId,
        labName: schedule.lab_name,
        scheduleStartTime: schedule.start_time,
        scheduleEndTime: schedule.end_time,
        conflictingScheduleId: conflict.id,
        conflictingTeacher: conflict.teacher_name,
        conflictingStartTime: conflict.start_time,
        conflictingEndTime: conflict.end_time,
        conflictingStatus: conflict.status,
      });

      return res.status(400).json({
        success: false,
        error: "Schedule conflict detected for this lab and time slot",
        details: {
          conflictingSchedule: {
            id: conflict.id,
            teacher: conflict.teacher_name,
            startTime: conflict.start_time,
            endTime: conflict.end_time,
            status: conflict.status,
            subject: conflict.subject,
          },
          requestedTime: {
            startTime: schedule.start_time,
            endTime: schedule.end_time,
          },
        },
      });
    }

    // Update schedule status to scheduled
    await db.query(
      "UPDATE lab_schedules SET status = 'scheduled', updated_at = NOW() WHERE id = ?",
      [scheduleId]
    );

    // Send notification to the teacher who created the schedule
    const notificationService = require("../services/notification.service");
    const startTime = new Date(schedule.start_time).toLocaleString();
    const endTime = new Date(schedule.end_time).toLocaleString();
    await notificationService.createNotification(
      schedule.teacher_id,
      notificationService.NOTIFICATION_TYPES.SCHEDULE_APPROVED,
      "Schedule Approved",
      `Your schedule for ${schedule.lab_name} from ${startTime} to ${endTime} has been approved.`
    );

    logger.info("Schedule approved", { scheduleId, reviewedBy });

    res.json({
      success: true,
      message: "Schedule approved successfully",
    });
  } catch (error) {
    logger.error("Error approving schedule:", error);
    res.status(500).json({
      success: false,
      error: "Failed to approve schedule",
    });
  }
};

/**
 * Disapprove/reject a pending schedule
 */
exports.disapproveSchedule = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { reason } = req.body;
    const reviewedBy = req.user.id;
    const currentUserRole = req.user.role;

    // Only admin and techsupport can disapprove schedules
    if (currentUserRole !== "admin" && currentUserRole !== "techsupport") {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to disapprove schedules",
      });
    }

    // Check if schedule exists and is pending
    const [schedules] = await db.query(
      "SELECT * FROM lab_schedules WHERE id = ? AND status = 'pending'",
      [scheduleId]
    );

    if (schedules.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Pending schedule not found or already processed",
      });
    }

    // Update schedule status to cancelled
    await db.query(
      "UPDATE lab_schedules SET status = 'cancelled', updated_at = NOW() WHERE id = ?",
      [scheduleId]
    );

    // Send notification to the teacher who created the schedule
    const notificationService = require("../services/notification.service");
    const startTime = new Date(schedule.start_time).toLocaleString();
    const endTime = new Date(schedule.end_time).toLocaleString();
    const message = reason
      ? `Your schedule for ${schedule.lab_name} from ${startTime} to ${endTime} has been disapproved. Reason: ${reason}`
      : `Your schedule for ${schedule.lab_name} from ${startTime} to ${endTime} has been disapproved.`;
    await notificationService.createNotification(
      schedule.teacher_id,
      notificationService.NOTIFICATION_TYPES.SCHEDULE_DISAPPROVED,
      "Schedule Disapproved",
      message
    );

    logger.info("Schedule disapproved", { scheduleId, reviewedBy, reason });

    res.json({
      success: true,
      message: "Schedule disapproved successfully",
    });
  } catch (error) {
    logger.error("Error disapproving schedule:", error);
    res.status(500).json({
      success: false,
      error: "Failed to disapprove schedule",
    });
  }
};
