const db = require("../models/mysql.models");
const fabricService = require("../services/fabric.service");
const logger = require("../utils/logger");
const reportService = require("../services/report.service");
const tuyaService = require("../services/tuya.service");

class LogsController {
  // Get access logs with filtering
  async getAccessLogs(req, res) {
    try {
      const {
        userId,
        startDate,
        endDate,
        accessMethod,
        success,
        limit = 50,
        offset = 0,
      } = req.query;

      const requesterId = req.user.id;
      const requesterRole = req.user.role;

      // Permission check: users can see their own logs, admins and tech support can see all
      if (
        userId &&
        parseInt(userId) !== requesterId &&
        requesterRole !== "admin" &&
        requesterRole !== "techsupport"
      ) {
        return res.status(403).json({
          success: false,
          error: "Unauthorized to view these logs",
        });
      }

      // Build query with joins for laboratory and subject information
      let query = `
                SELECT 
                  al.*, 
                  u.username, 
                  u.email, 
                  u.role,
                  l.name as laboratory_name,
                  ls.subject
                FROM access_logs al
                LEFT JOIN users u ON al.user_id = u.id
                LEFT JOIN laboratories l ON al.laboratory_id = l.id
                LEFT JOIN lab_schedules ls ON (
                  ls.teacher_id = al.user_id 
                  AND ls.status = 'scheduled'
                  AND al.timestamp >= ls.start_time 
                  AND al.timestamp <= ls.end_time
                )
                WHERE 1=1
            `;
      const params = [];

      if (userId) {
        query += " AND al.user_id = ?";
        params.push(userId);
      }

      if (startDate) {
        query += " AND al.timestamp >= ?";
        params.push(startDate);
      }

      if (endDate) {
        query += " AND al.timestamp <= ?";
        params.push(endDate);
      }

      if (accessMethod) {
        query += " AND al.access_method = ?";
        params.push(accessMethod);
      }

      if (success !== undefined) {
        query += " AND al.success = ?";
        params.push(success === "true" || success === true ? 1 : 0);
      }

      // If not admin or tech support, only show user's own logs
      if (
        requesterRole !== "admin" &&
        requesterRole !== "techsupport" &&
        !userId
      ) {
        query += " AND al.user_id = ?";
        params.push(requesterId);
      }

      query += " ORDER BY al.timestamp DESC LIMIT ? OFFSET ?";
      params.push(parseInt(limit), parseInt(offset));

      const [logs] = await db.query(query, params);

      // Get total count for pagination
      let countQuery = `
                SELECT COUNT(*) as total 
                FROM access_logs al 
                WHERE 1=1
            `;
      const countParams = [];

      if (userId) {
        countQuery += " AND al.user_id = ?";
        countParams.push(userId);
      }
      if (
        requesterRole !== "admin" &&
        requesterRole !== "techsupport" &&
        !userId
      ) {
        countQuery += " AND al.user_id = ?";
        countParams.push(requesterId);
      }

      const [countResult] = await db.query(countQuery, countParams);

      // Helper function to format access method
      const formatAccessMethod = (method) => {
        const methodMap = {
          'fingerprint': 'Biometric',
          'rfid': 'RFID',
          'pin': 'PIN',
          'remote': 'Remote',
          'auto_schedule': 'Auto Schedule',
          'key': 'Key',
          'temporary_password': 'Temporary Password',
          'dynamic_password': 'Dynamic Password'
        };
        return methodMap[method?.toLowerCase()] || method || 'Unknown';
      };

      // Map database columns (snake_case) to frontend format (camelCase)
      const mappedLogs = logs.map((log) => {
        const success = log.success !== undefined ? Boolean(log.success) : true;
        const accessMethodRaw = log.access_method || log.accessMethod;
        
        return {
          id: log.id?.toString() || log.id,
          userId: log.user_id?.toString() || log.userId,
          userName: log.username || "Unknown",
          role: log.role || null,
          subject: log.subject || null,
          laboratory: log.laboratory_name || null,
          timestamp: log.timestamp,
          dateTime: log.timestamp, // Alias for clarity
          accessMethod: formatAccessMethod(accessMethodRaw),
          accessMethodRaw: accessMethodRaw, // Keep original for filtering
          accessType: log.access_type || log.accessType || "unlock",
          result: success ? "Granted" : "Denied",
          success: success,
          reasonForDenial: log.reason_for_denial || null,
          blockchainHash: log.blockchain_hash || log.blockchainHash || null,
          fabricTxId: log.fabric_tx_id || log.fabricTxId || null,
          ipAddress: log.ip_address || log.ipAddress || null,
          laboratoryId: log.laboratory_id || log.laboratoryId || null,
          email: log.email || null,
          details: log.details
            ? typeof log.details === "string"
              ? JSON.parse(log.details)
              : log.details
            : null,
          deviceResponse: log.device_response
            ? typeof log.device_response === "string"
              ? JSON.parse(log.device_response)
              : log.device_response
            : null,
        };
      });

      res.json({
        success: true,
        data: mappedLogs,
        pagination: {
          total: countResult[0].total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + logs.length < countResult[0].total,
        },
      });
    } catch (error) {
      logger.error("Error fetching access logs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch access logs",
        details: error.message,
      });
    }
  }

  // Get Tuya unlocking history (new v1.1 API)
  // Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-record?id=Kbe2o4dci8roa#title-1-Query%20unlocking%20history%20(new)
  async getTuyaUnlockingHistory(req, res) {
    try {
      const deviceId = process.env.TUYA_DEVICE_ID;
      if (!deviceId) {
        return res.status(400).json({
          success: false,
          error: "TUYA_DEVICE_ID not set in environment",
        });
      }

      const { page_no = 1, page_size = 20, start_time, end_time } = req.query;

      // Convert dates to milliseconds if provided as ISO strings
      let startTime = start_time;
      let endTime = end_time;

      if (start_time && !Number.isInteger(Number(start_time))) {
        // If it's an ISO string, convert to milliseconds
        startTime = new Date(start_time).getTime();
      } else if (start_time) {
        startTime = Number(start_time);
      }

      if (end_time && !Number.isInteger(Number(end_time))) {
        // If it's an ISO string, convert to milliseconds
        endTime = new Date(end_time).getTime();
      } else if (end_time) {
        endTime = Number(end_time);
      }

      // Per Tuya docs, show_media_info is required; default to true so that
      // image information is returned unless explicitly disabled later.
      const result = await tuyaService.getUnlockingHistory(deviceId, {
        page_no: parseInt(page_no),
        page_size: parseInt(page_size),
        start_time: startTime,
        end_time: endTime,
        showMediaInfo: true,
      });

      // tuyaService.getUnlockingHistory returns the `result` object from Tuya,
      // which already contains { logs, total }. It does NOT include a `success`
      // field (that lives at the top level of the Tuya response), so we only
      // need to check that we actually got a result back.
      if (!result) {
        return res.status(500).json({
          success: false,
          error: "Failed to fetch Tuya unlocking history",
          details: "Empty response from Tuya API",
        });
      }

      // Format response to match expected structure
      const logs = result.logs || [];
      const total = result.total || 0;

      res.json({
        success: true,
        data: logs,
        total,
        page_no: parseInt(page_no),
        page_size: parseInt(page_size),
      });
    } catch (error) {
      logger.error("Error fetching Tuya unlocking history:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch Tuya unlocking history",
        details: error.message,
      });
    }
  }

  // Get system activity logs (admin, tech support, or own logs for teachers)
  async getSystemLogs(req, res) {
    try {
      // Teachers can only view their own logs
      // Admin and tech support can view all logs
      const isTeacher = req.user.role === "teacher";
      const isAdminOrTechSupport =
        req.user.role === "admin" || req.user.role === "techsupport";

      const {
        eventType,
        startDate,
        endDate,
        userId,
        limit = 50,
        offset = 0,
      } = req.query;

      let query = `
                SELECT sl.*, u.username, u.role 
                FROM system_logs sl
                LEFT JOIN users u ON sl.user_id = u.id
                WHERE 1=1
            `;
      const params = [];

      // If teacher, only show their own logs
      if (isTeacher) {
        query += " AND sl.user_id = ?";
        params.push(req.user.id);
      } else if (userId && isAdminOrTechSupport) {
        // Admin/tech support can filter by userId
        query += " AND sl.user_id = ?";
        params.push(userId);
      }

      if (eventType) {
        query += " AND sl.event_type = ?";
        params.push(eventType);
      }

      if (startDate) {
        query += " AND sl.timestamp >= ?";
        params.push(startDate);
      }

      if (endDate) {
        query += " AND sl.timestamp <= ?";
        params.push(endDate);
      }

      query += " ORDER BY sl.timestamp DESC LIMIT ? OFFSET ?";
      params.push(parseInt(limit), parseInt(offset));

      const [logs] = await db.query(query, params);

      // Get total count
      let countQuery = "SELECT COUNT(*) as total FROM system_logs WHERE 1=1";
      const countParams = [];

      // If teacher, only count their own logs
      if (isTeacher) {
        countQuery += " AND user_id = ?";
        countParams.push(req.user.id);
      } else if (userId && isAdminOrTechSupport) {
        countQuery += " AND user_id = ?";
        countParams.push(userId);
      }

      if (eventType) {
        countQuery += " AND event_type = ?";
        countParams.push(eventType);
      }

      const [countResult] = await db.query(countQuery, countParams);

      // Map database columns (snake_case) to frontend format (camelCase)
      const mappedLogs = logs.map((log) => {
        // Parse details if it's a string
        let parsedDetails = log.details;
        if (typeof log.details === "string") {
          try {
            parsedDetails = JSON.parse(log.details);
          } catch (e) {
            parsedDetails = log.details;
          }
        }

        // Parse metadata if it exists and is a string
        let parsedMetadata = log.metadata;
        if (log.metadata && typeof log.metadata === "string") {
          try {
            parsedMetadata = JSON.parse(log.metadata);
          } catch (e) {
            parsedMetadata = log.metadata;
          }
        }

        // Extract role from details if not in main query, or use from user join
        const role = log.role || parsedDetails?.role || parsedDetails?.userLevel || parsedMetadata?.role || parsedMetadata?.userLevel || null;

        return {
          id: log.id?.toString() || log.id,
          eventType: log.event_type || log.eventType,
          eventDescription:
            log.event_description || log.eventDescription || null,
          userId: log.user_id?.toString() || log.userId || null,
          username: log.username || null,
          role: role,
          details: parsedDetails || parsedMetadata || {},
          timestamp: log.timestamp,
          blockchainHash:
            log.blockchain_hash ||
            log.blockchainHash ||
            log.fabric_tx_id ||
            log.fabricTxId ||
            null,
          fabricTxId: log.fabric_tx_id || log.fabricTxId || null,
        };
      });

      res.json({
        success: true,
        data: mappedLogs,
        pagination: {
          total: countResult[0].total,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      logger.error("Error fetching system logs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch system logs",
      });
    }
  }

  // Get access statistics
  async getAccessStats(req, res) {
    try {
      const { userId, period = "7days" } = req.query;
      const requesterId = req.user.id;
      const requesterRole = req.user.role;

      // Permission check
      if (
        userId &&
        parseInt(userId) !== requesterId &&
        requesterRole !== "admin" &&
        requesterRole !== "techsupport"
      ) {
        return res.status(403).json({
          success: false,
          error: "Unauthorized",
        });
      }

      const periodMap = {
        "24hours": "DATE_SUB(NOW(), INTERVAL 1 DAY)",
        "7days": "DATE_SUB(NOW(), INTERVAL 7 DAY)",
        "30days": "DATE_SUB(NOW(), INTERVAL 30 DAY)",
        "90days": "DATE_SUB(NOW(), INTERVAL 90 DAY)",
      };

      const dateFilter = periodMap[period] || periodMap["7days"];
      const userFilter = userId
        ? "AND user_id = ?"
        : requesterRole !== "admin" && requesterRole !== "techsupport"
        ? "AND user_id = ?"
        : "";
      const userParam = userId
        ? [userId]
        : requesterRole !== "admin" && requesterRole !== "techsupport"
        ? [requesterId]
        : [];

      // Total accesses summary
      const [totalAccess] = await db.query(
        `SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
                FROM access_logs 
                WHERE timestamp >= ${dateFilter} ${userFilter}`,
        userParam
      );

      // Access by method
      const [byMethod] = await db.query(
        `SELECT 
                    access_method, 
                    COUNT(*) as count,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_count
                FROM access_logs 
                WHERE timestamp >= ${dateFilter} ${userFilter}
                GROUP BY access_method
                ORDER BY count DESC`,
        userParam
      );

      // Access by day
      const [byDay] = await db.query(
        `SELECT 
                    DATE(timestamp) as date, 
                    COUNT(*) as count,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
                FROM access_logs 
                WHERE timestamp >= ${dateFilter} ${userFilter}
                GROUP BY DATE(timestamp)
                ORDER BY date DESC`,
        userParam
      );

      // Access by hour (for 24-hour period)
      const [byHour] = await db.query(
        `SELECT 
                    HOUR(timestamp) as hour, 
                    COUNT(*) as count
                FROM access_logs 
                WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ${userFilter}
                GROUP BY HOUR(timestamp)
                ORDER BY hour`,
        userParam
      );

      // Most active users (admin and tech support)
      let topUsers = [];
      if (
        (requesterRole === "admin" || requesterRole === "techsupport") &&
        !userId
      ) {
        const [users] = await db.query(
          `SELECT 
                        u.id, u.username, u.email,
                        COUNT(al.id) as access_count,
                        SUM(CASE WHEN al.success = 1 THEN 1 ELSE 0 END) as successful_count
                    FROM users u
                    JOIN access_logs al ON u.id = al.user_id
                    WHERE al.timestamp >= ${dateFilter}
                    GROUP BY u.id, u.username, u.email
                    ORDER BY access_count DESC
                    LIMIT 10`
        );
        topUsers = users;
      }

      res.json({
        success: true,
        data: {
          period,
          summary: totalAccess[0],
          byMethod,
          byDay,
          byHour,
          topUsers: topUsers.length > 0 ? topUsers : undefined,
        },
      });
    } catch (error) {
      logger.error("Error fetching access stats:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch statistics",
        details: error.message,
      });
    }
  }

  // Get single access log details
  async getAccessLogById(req, res) {
    try {
      const { logId } = req.params;
      const requesterId = req.user.id;
      const requesterRole = req.user.role;

      const [logs] = await db.query(
        `SELECT al.*, u.username, u.email, u.role
                FROM access_logs al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE al.id = ?`,
        [logId]
      );

      if (logs.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Log not found",
        });
      }

      const log = logs[0];

      // Permission check
      if (
        log.user_id !== requesterId &&
        requesterRole !== "admin" &&
        requesterRole !== "techsupport"
      ) {
        return res.status(403).json({
          success: false,
          error: "Unauthorized",
        });
      }

      // Get blockchain verification if fabric_tx_id exists
      let fabricData = null;
      if (log.fabric_tx_id) {
        try {
          fabricData = await fabricService.getAccessLogs(log.user_id);
        } catch (error) {
          logger.warn("Could not fetch Fabric data:", error);
        }
      }

      res.json({
        success: true,
        data: {
          ...log,
          fabricVerification: fabricData,
        },
      });
    } catch (error) {
      logger.error("Error fetching log details:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch log details",
      });
    }
  }

  // Export logs (admin only)
  async exportLogs(req, res) {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Admin access required",
        });
      }

      const { format = "json", startDate, endDate } = req.query;

      let query = `
                SELECT al.*, u.username, u.email
                FROM access_logs al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE 1=1
            `;
      const params = [];

      if (startDate) {
        query += " AND al.timestamp >= ?";
        params.push(startDate);
      }

      if (endDate) {
        query += " AND al.timestamp <= ?";
        params.push(endDate);
      }

      query += " ORDER BY al.timestamp DESC";

      const [logs] = await db.query(query, params);

      if (format === "csv") {
        // Convert to CSV
        const csvHeaders =
          "ID,User,Email,Method,Type,Success,Timestamp,IP Address\n";
        const csvRows = logs
          .map(
            (log) =>
              `${log.id},"${log.username || "Unknown"}","${log.email || ""}",${
                log.access_method
              },${log.access_type},${log.success},${log.timestamp},"${
                log.ip_address || ""
              }"`
          )
          .join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=access_logs_${Date.now()}.csv`
        );
        res.send(csvHeaders + csvRows);
      } else {
        // Return JSON
        res.setHeader("Content-Type", "application/json");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=access_logs_${Date.now()}.json`
        );
        res.json({
          success: true,
          exportedAt: new Date().toISOString(),
          totalRecords: logs.length,
          data: logs,
        });
      }
    } catch (error) {
      logger.error("Error exporting logs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to export logs",
      });
    }
  }

  // Generate report for Admin users
  async generateAdminReport(req, res) {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Admin access required",
        });
      }

      const {
        format = "pdf",
        startDate,
        endDate,
        userId,
        accessMethod,
        success,
      } = req.query;

      const filters = {
        startDate,
        endDate,
        userId,
        accessMethod,
        success,
      };

      const reportBuffer = await reportService.generateAdminReport(
        format,
        filters
      );

      if (format === "pdf") {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=admin_report_${Date.now()}.pdf`
        );
      } else {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=admin_report_${Date.now()}.csv`
        );
      }

      res.send(reportBuffer);
    } catch (error) {
      logger.error("Error generating admin report:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate admin report",
        details: error.message,
      });
    }
  }

  // Generate report for Teacher users
  async generateTeacherReport(req, res) {
    try {
      if (req.user.role !== "teacher") {
        return res.status(403).json({
          success: false,
          error: "Teacher access required",
        });
      }

      const {
        format = "pdf",
        startDate,
        endDate,
        accessMethod,
        success,
      } = req.query;
      const userId = req.user.id;

      const filters = {
        startDate,
        endDate,
        accessMethod,
        success,
      };

      const reportBuffer = await reportService.generateTeacherReport(
        userId,
        format,
        filters
      );

      if (format === "pdf") {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=teacher_report_${Date.now()}.pdf`
        );
      } else {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=teacher_report_${Date.now()}.csv`
        );
      }

      res.send(reportBuffer);
    } catch (error) {
      logger.error("Error generating teacher report:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate teacher report",
        details: error.message,
      });
    }
  }

  // Generate report for Tech Support users (admin and techsupport can access)
  async generateTechSupportReport(req, res) {
    try {
      if (req.user.role !== "techsupport" && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Admin or tech support access required",
        });
      }

      const {
        format = "pdf",
        startDate,
        endDate,
        userId,
        accessMethod,
        success,
      } = req.query;

      const filters = {
        startDate,
        endDate,
        userId,
        accessMethod,
        success,
      };

      const reportBuffer = await reportService.generateTechSupportReport(
        format,
        filters
      );

      if (format === "pdf") {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=techsupport_report_${Date.now()}.pdf`
        );
      } else {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=techsupport_report_${Date.now()}.csv`
        );
      }

      res.send(reportBuffer);
    } catch (error) {
      logger.error("Error generating tech support report:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate tech support report",
        details: error.message,
      });
    }
  }

  // Generate report for regular User level
  async generateUserReport(req, res) {
    try {
      if (req.user.role !== "user") {
        return res.status(403).json({
          success: false,
          error: "User access required",
        });
      }

      const {
        format = "pdf",
        startDate,
        endDate,
        accessMethod,
        success,
      } = req.query;
      const userId = req.user.id;

      const filters = {
        startDate,
        endDate,
        accessMethod,
        success,
      };

      const reportBuffer = await reportService.generateUserReport(
        userId,
        format,
        filters
      );

      if (format === "pdf") {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=user_report_${Date.now()}.pdf`
        );
      } else {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=user_report_${Date.now()}.csv`
        );
      }

      res.send(reportBuffer);
    } catch (error) {
      logger.error("Error generating user report:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate user report",
        details: error.message,
      });
    }
  }

  // Generate report for Visitor level
  async generateVisitorReport(req, res) {
    try {
      if (req.user.role !== "visitor") {
        return res.status(403).json({
          success: false,
          error: "Visitor access required",
        });
      }

      const { format = "pdf", startDate, endDate } = req.query;
      const userId = req.user.id;

      const filters = {
        startDate,
        endDate,
      };

      const reportBuffer = await reportService.generateVisitorReport(
        userId,
        format,
        filters
      );

      if (format === "pdf") {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=visitor_report_${Date.now()}.pdf`
        );
      } else {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=visitor_report_${Date.now()}.csv`
        );
      }

      res.send(reportBuffer);
    } catch (error) {
      logger.error("Error generating visitor report:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate visitor report",
        details: error.message,
      });
    }
  }
}

module.exports = new LogsController();
