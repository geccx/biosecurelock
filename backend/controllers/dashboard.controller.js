const db = require("../models/mysql.models");
const fabricService = require("../services/fabric.service");
const tuyaService = require("../services/tuya.service");
const logger = require("../utils/logger");

/**
 * Get dashboard statistics
 */
exports.getStats = async (req, res) => {
  try {
    // Get total schedules count (all statuses)
    const [schedulesResult] = await db.query(
      "SELECT COUNT(*) as count FROM lab_schedules"
    );
    const activeSchedules = schedulesResult[0].count;

    // Get pending move requests count
    const [pendingMoveRequestsResult] = await db.query(
      "SELECT COUNT(*) as count FROM schedule_move_requests WHERE status = 'pending'"
    );
    const pendingMoveRequests = pendingMoveRequestsResult[0].count;

    // Get pending schedules count
    const [pendingSchedulesResult] = await db.query(
      "SELECT COUNT(*) as count FROM lab_schedules WHERE status = 'pending'"
    );
    const pendingSchedules = pendingSchedulesResult[0].count;

    // Total pending approvals = pending schedules + pending move requests
    const pendingApprovals = pendingSchedules + pendingMoveRequests;

    // Get today's access logs count
    const [logsResult] = await db.query(
      "SELECT COUNT(*) as count FROM access_logs WHERE DATE(timestamp) = CURDATE()"
    );
    const accessLogsToday = logsResult[0].count;

    // Get pending enrollments count
    const [enrollmentsResult] = await db.query(
      "SELECT COUNT(*) as count FROM enrollments WHERE status = 'pending'"
    );
    const pendingEnrollments = enrollmentsResult[0].count;

    // Get local users count (from database)
    const [localUsersResult] = await db.query(
      "SELECT COUNT(*) as count FROM users"
    );
    const localUsers = localUsersResult[0].count;

    // Get active local users count (status = 'active')
    const [activeLocalUsersResult] = await db.query(
      "SELECT COUNT(*) as count FROM users WHERE status = 'active'"
    );
    const activeLocalUsers = activeLocalUsersResult[0].count;

    // Get Tuya users using the same API endpoint logic
    let totalUsers = 0;
    let activeTuyaUsers = 0;
    let totalTuyaUsers = 0;
    let tuyaUsersWithValidSchedule = 0;

    try {
      const deviceId = process.env.TUYA_DEVICE_ID;

      if (deviceId) {
        // Call getAllDeviceUsers exactly like the route does
        const result = await tuyaService.getAllDeviceUsers(deviceId, {
          page_no: 1,
          page_size: 100,
        });

        if (result && result.success && result.data) {
          const users = result.data;
          const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds

          totalTuyaUsers = users.length;

          users.forEach((user) => {
            // Count active Tuya users (effective_flag === 1)
            if (user.effective_flag === 1) {
              activeTuyaUsers++;
            }

            // Check if user has valid time schedule
            if (user.time_schedule_info) {
              const schedule = user.time_schedule_info;

              if (schedule.permanent) {
                // Permanent schedule - always valid
                tuyaUsersWithValidSchedule++;
              } else if (schedule.expired_time) {
                // Check if expired_time is ahead of today
                if (schedule.expired_time > now) {
                  tuyaUsersWithValidSchedule++;
                }
              }
            }
          });

          // Total users = Tuya users (since we're not using local DB users)
          totalUsers = totalTuyaUsers;
        }
      }
    } catch (error) {
      logger.warn("Error fetching Tuya users for dashboard:", error.message);
      // Continue without Tuya users count if there's an error
    }

    // Total active users = active local users + active Tuya users
    const activeUsers = activeLocalUsers + activeTuyaUsers;

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        activeSchedules,
        pendingApprovals,
        accessLogsToday,
        pendingEnrollments,
        totalTuyaUsers,
        tuyaUsersWithValidSchedule,
        localUsers,
        activeLocalUsers,
        activeTuyaUsers,
      },
    });
  } catch (error) {
    logger.error("Error fetching dashboard stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch dashboard statistics",
    });
  }
};

/**
 * Get system status
 */
exports.getSystemStatus = async (req, res) => {
  try {
    // Check Fabric connection
    const fabricStatus = fabricService.contract ? "connected" : "disconnected";

    // Get lock status summary
    const [locksResult] = await db.query(
      "SELECT lock_status, COUNT(*) as count FROM laboratories GROUP BY lock_status"
    );

    const locksSummary = {
      locked: 0,
      unlocked: 0,
    };
    locksResult.forEach((row) => {
      locksSummary[row.lock_status] = row.count;
    });

    // Get online devices count
    const [devicesResult] = await db.query(
      "SELECT status, COUNT(*) as count FROM devices GROUP BY status"
    );

    const devicesSummary = {
      online: 0,
      offline: 0,
      error: 0,
    };
    devicesResult.forEach((row) => {
      devicesSummary[row.status] = row.count;
    });

    res.json({
      success: true,
      data: {
        blockchain: {
          status: fabricStatus,
          network: "active",
        },
        locks: locksSummary,
        devices: devicesSummary,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Error fetching system status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch system status",
    });
  }
};

/**
 * Get today's access logs for dashboard
 */
exports.getRecentAccessLogs = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const [logs] = await db.query(
      `SELECT al.*, u.username as user_name, u.role, l.name as lab_name
       FROM access_logs al
       LEFT JOIN users u ON al.user_id = u.id
       LEFT JOIN laboratories l ON al.laboratory_id = l.id
       WHERE DATE(al.timestamp) = CURDATE()
       ORDER BY al.timestamp DESC
       LIMIT ?`,
      [limit]
    );

    res.json({
      success: true,
      data: logs.map((log) => ({
        id: log.id,
        userId: log.user_id,
        userName: log.user_name || "Unknown",
        userRole: log.role || null,
        labName: log.lab_name || "Unknown",
        timestamp: log.timestamp,
        method: log.access_method,
        status: log.success ? "granted" : "denied",
        blockchainHash: log.blockchain_hash,
        ipAddress: log.ip_address,
      })),
    });
  } catch (error) {
    logger.error("Error fetching today's access logs:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch today's access logs",
    });
  }
};

/**
 * Get pending approvals for dashboard
 * Returns both pending schedules and pending move requests
 */
exports.getPendingApprovals = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    // Get pending schedules
    const [pendingSchedules] = await db.query(
      `SELECT ls.*, u.username as teacher_name
       FROM lab_schedules ls
       LEFT JOIN users u ON ls.teacher_id = u.id
       WHERE ls.status = 'pending'
       ORDER BY ls.created_at DESC
       LIMIT ?`,
      [limit]
    );

    // Get pending move requests
    const [moveRequests] = await db.query(
      `SELECT mr.*, u.username as teacher_name, ls.lab_name
       FROM schedule_move_requests mr
       LEFT JOIN users u ON mr.teacher_id = u.id
       LEFT JOIN lab_schedules ls ON mr.schedule_id = ls.id
       WHERE mr.status = 'pending'
       ORDER BY mr.requested_at DESC
       LIMIT ?`,
      [limit]
    );

    // Combine and format both types
    const allPending = [
      // Pending schedules
      ...pendingSchedules.map((s) => ({
        id: `schedule-${s.id}`,
        type: "schedule",
        scheduleId: s.id.toString(),
        teacherId: s.teacher_id.toString(),
        teacherName: s.teacher_name || "Unknown",
        labName: s.lab_name,
        startTime: s.start_time,
        endTime: s.end_time,
        subject: s.subject,
        status: s.status,
        createdAt: s.created_at,
        timestamp: s.created_at, // For sorting
      })),
      // Pending move requests
      ...moveRequests.map((req) => ({
        id: `move-${req.id}`,
        type: "move_request",
        scheduleId: req.schedule_id.toString(),
        teacherId: req.teacher_id.toString(),
        teacherName: req.teacher_name || "Unknown",
        labName: req.lab_name || "Unknown",
        currentStartTime: req.current_start_time,
        currentEndTime: req.current_end_time,
        requestedStartTime: req.requested_start_time,
        requestedEndTime: req.requested_end_time,
        reason: req.reason,
        status: req.status,
        requestedAt: req.requested_at,
        timestamp: req.requested_at, // For sorting
      })),
    ];

    // Sort by timestamp (most recent first) and limit
    allPending.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limited = allPending.slice(0, limit);

    res.json({
      success: true,
      data: limited,
    });
  } catch (error) {
    logger.error("Error fetching pending approvals:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch pending approvals",
    });
  }
};
