const db = require("../models/mysql.models");
const logger = require("../utils/logger");
const { formatDateForMySQLManila } = require("../utils/timezone.utils");

/**
 * Create a schedule move request
 */
exports.createMoveRequest = async (req, res) => {
  try {
    const { scheduleId, requestedStartTime, requestedEndTime, reason } = req.body;
    const teacherId = req.user.id;

    // Get the current schedule
    const [schedules] = await db.query(
      "SELECT * FROM lab_schedules WHERE id = ? AND teacher_id = ?",
      [scheduleId, teacherId]
    );

    if (schedules.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Schedule not found or you don't have permission",
      });
    }

    const schedule = schedules[0];

    // Check if there's already a pending request for this schedule
    const [existingRequests] = await db.query(
      "SELECT id FROM schedule_move_requests WHERE schedule_id = ? AND status = 'pending'",
      [scheduleId]
    );

    if (existingRequests.length > 0) {
      return res.status(400).json({
        success: false,
        error: "There's already a pending move request for this schedule",
      });
    }

    // Format requested times in Asia/Manila timezone
    const formattedRequestedStartTime = formatDateForMySQLManila(requestedStartTime);
    const formattedRequestedEndTime = formatDateForMySQLManila(requestedEndTime);
    
    // Insert move request
    const [result] = await db.query(
      `INSERT INTO schedule_move_requests 
       (schedule_id, teacher_id, lab_name, current_start_time, current_end_time, 
        requested_start_time, requested_end_time, reason, status, requested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        scheduleId,
        teacherId,
        schedule.lab_name,
        schedule.start_time,
        schedule.end_time,
        formattedRequestedStartTime,
        formattedRequestedEndTime,
        reason,
      ]
    );

    logger.info("Schedule move request created", { requestId: result.insertId });

    // Notify admins and tech support about the new move request
    const notificationService = require("../services/notification.service");
    await notificationService.notifyAdminsAndTechSupport(
      notificationService.NOTIFICATION_TYPES.MOVE_REQUEST_SUBMITTED,
      "Move Request Submitted",
      `A move request for ${schedule.lab_name} was submitted by ${req.user.username} for ${new Date(
        requestedStartTime
      ).toLocaleString()} - ${new Date(requestedEndTime).toLocaleString()}.`
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId.toString(),
        scheduleId: scheduleId.toString(),
        teacherId: teacherId.toString(),
        labName: schedule.lab_name,
        currentStartTime: schedule.start_time,
        currentEndTime: schedule.end_time,
        requestedStartTime,
        requestedEndTime,
        reason,
        status: "pending",
        requestedAt: new Date(),
      },
    });
  } catch (error) {
    logger.error("Error creating move request:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create move request",
    });
  }
};

/**
 * Get all move requests (admin/techsupport)
 */
exports.getAllMoveRequests = async (req, res) => {
  try {
    const { status, teacherId, limit, offset } = req.query;

    let query = `
      SELECT mr.*, u.username as teacher_name
      FROM schedule_move_requests mr
      LEFT JOIN users u ON mr.teacher_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += " AND mr.status = ?";
      params.push(status);
    }

    if (teacherId) {
      query += " AND mr.teacher_id = ?";
      params.push(teacherId);
    }

    query += " ORDER BY mr.requested_at DESC";

    if (limit) {
      query += " LIMIT ?";
      params.push(parseInt(limit));
      if (offset) {
        query += " OFFSET ?";
        params.push(parseInt(offset));
      }
    }

    const [requests] = await db.query(query, params);

    res.json({
      success: true,
      data: requests.map((r) => ({
        id: r.id.toString(),
        scheduleId: r.schedule_id.toString(),
        teacherId: r.teacher_id.toString(),
        teacherName: r.teacher_name || "Unknown",
        labName: r.lab_name,
        currentStartTime: r.current_start_time,
        currentEndTime: r.current_end_time,
        requestedStartTime: r.requested_start_time,
        requestedEndTime: r.requested_end_time,
        reason: r.reason,
        status: r.status,
        requestedAt: r.requested_at,
        reviewedBy: r.reviewed_by,
        reviewedAt: r.reviewed_at,
      })),
    });
  } catch (error) {
    logger.error("Error fetching move requests:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch move requests",
    });
  }
};

/**
 * Get pending move requests
 */
exports.getPendingRequests = async (req, res) => {
  try {
    const [requests] = await db.query(
      `SELECT mr.*, u.username as teacher_name
       FROM schedule_move_requests mr
       LEFT JOIN users u ON mr.teacher_id = u.id
       WHERE mr.status = 'pending'
       ORDER BY mr.requested_at DESC`
    );

    res.json({
      success: true,
      data: requests.map((r) => ({
        id: r.id.toString(),
        scheduleId: r.schedule_id.toString(),
        teacherId: r.teacher_id.toString(),
        teacherName: r.teacher_name || "Unknown",
        labName: r.lab_name,
        currentStartTime: r.current_start_time,
        currentEndTime: r.current_end_time,
        requestedStartTime: r.requested_start_time,
        requestedEndTime: r.requested_end_time,
        reason: r.reason,
        status: r.status,
        requestedAt: r.requested_at,
      })),
    });
  } catch (error) {
    logger.error("Error fetching pending requests:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch pending requests",
    });
  }
};

/**
 * Get move requests for a specific teacher
 */
exports.getTeacherRequests = async (req, res) => {
  try {
    const teacherId = req.params.teacherId || req.user.id;

    const [requests] = await db.query(
      `SELECT mr.*, u.username as teacher_name
       FROM schedule_move_requests mr
       LEFT JOIN users u ON mr.teacher_id = u.id
       WHERE mr.teacher_id = ?
       ORDER BY mr.requested_at DESC`,
      [teacherId]
    );

    res.json({
      success: true,
      data: requests.map((r) => ({
        id: r.id.toString(),
        scheduleId: r.schedule_id.toString(),
        teacherId: r.teacher_id.toString(),
        teacherName: r.teacher_name || "Unknown",
        labName: r.lab_name,
        currentStartTime: r.current_start_time,
        currentEndTime: r.current_end_time,
        requestedStartTime: r.requested_start_time,
        requestedEndTime: r.requested_end_time,
        reason: r.reason,
        status: r.status,
        requestedAt: r.requested_at,
        reviewedBy: r.reviewed_by,
        reviewedAt: r.reviewed_at,
      })),
    });
  } catch (error) {
    logger.error("Error fetching teacher requests:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch requests",
    });
  }
};

/**
 * Approve a move request
 */
exports.approveRequest = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { requestId } = req.params;
    const reviewedBy = req.user.id;

    // Get the request
    const [requests] = await connection.query(
      "SELECT * FROM schedule_move_requests WHERE id = ? AND status = 'pending'",
      [requestId]
    );

    if (requests.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: "Move request not found or already processed",
      });
    }

    const request = requests[0];

    // Update the schedule with new times
    await connection.query(
      "UPDATE lab_schedules SET start_time = ?, end_time = ?, updated_at = NOW() WHERE id = ?",
      [request.requested_start_time, request.requested_end_time, request.schedule_id]
    );

    // Update the request status
    await connection.query(
      "UPDATE schedule_move_requests SET status = 'approved', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
      [reviewedBy, requestId]
    );

    await connection.commit();

    // Send notification to the teacher
    const notificationService = require("../services/notification.service");
    const requestedStartTime = new Date(request.requested_start_time).toLocaleString();
    const requestedEndTime = new Date(request.requested_end_time).toLocaleString();
    await notificationService.createNotification(
      request.teacher_id,
      notificationService.NOTIFICATION_TYPES.MOVE_REQUEST_APPROVED,
      "Move Request Approved",
      `Your move request for ${request.lab_name} to ${requestedStartTime} - ${requestedEndTime} has been approved.`
    );

    logger.info("Move request approved", { requestId, reviewedBy });

    res.json({
      success: true,
      message: "Move request approved successfully",
    });
  } catch (error) {
    await connection.rollback();
    logger.error("Error approving move request:", error);
    res.status(500).json({
      success: false,
      error: "Failed to approve move request",
    });
  } finally {
    connection.release();
  }
};

/**
 * Deny a move request
 */
exports.denyRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;
    const reviewedBy = req.user.id;

    const [result] = await db.query(
      "UPDATE schedule_move_requests SET status = 'denied', reviewed_by = ?, reviewed_at = NOW(), denial_reason = ? WHERE id = ? AND status = 'pending'",
      [reviewedBy, reason || null, requestId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: "Move request not found or already processed",
      });
    }

    // Get the request to send notification
    const [requests] = await db.query(
      "SELECT * FROM schedule_move_requests WHERE id = ?",
      [requestId]
    );
    if (requests.length > 0) {
      const request = requests[0];
      const notificationService = require("../services/notification.service");
      const requestedStartTime = new Date(request.requested_start_time).toLocaleString();
      const requestedEndTime = new Date(request.requested_end_time).toLocaleString();
      const message = reason
        ? `Your move request for ${request.lab_name} to ${requestedStartTime} - ${requestedEndTime} has been denied. Reason: ${reason}`
        : `Your move request for ${request.lab_name} to ${requestedStartTime} - ${requestedEndTime} has been denied.`;
      await notificationService.createNotification(
        request.teacher_id,
        notificationService.NOTIFICATION_TYPES.MOVE_REQUEST_DENIED,
        "Move Request Denied",
        message
      );
    }

    logger.info("Move request denied", { requestId, reviewedBy, reason });

    res.json({
      success: true,
      message: "Move request denied",
    });
  } catch (error) {
    logger.error("Error denying move request:", error);
    res.status(500).json({
      success: false,
      error: "Failed to deny move request",
    });
  }
};

