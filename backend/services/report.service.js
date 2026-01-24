const PDFDocument = require("pdfkit");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const db = require("../models/mysql.models");
const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");

/**
 * Report Generation Service
 * Provides separate functions for each user level to generate PDF or CSV reports
 */

class ReportService {
  /**
   * Generate report for Admin users
   * Includes all access logs, system logs, and comprehensive statistics
   */
  async generateAdminReport(format, filters = {}) {
    try {
      const { startDate, endDate, userId, accessMethod, success } = filters;

      // Fetch access logs
      let accessLogsQuery = `
        SELECT al.*, u.username, u.email, u.role, l.name as laboratory_name
        FROM access_logs al
        LEFT JOIN users u ON al.user_id = u.id
        LEFT JOIN laboratories l ON al.laboratory_id = l.id
        WHERE 1=1
      `;
      const accessParams = [];

      if (startDate) {
        accessLogsQuery += " AND al.timestamp >= ?";
        accessParams.push(startDate);
      }
      if (endDate) {
        accessLogsQuery += " AND al.timestamp <= ?";
        accessParams.push(endDate);
      }
      if (userId) {
        accessLogsQuery += " AND al.user_id = ?";
        accessParams.push(userId);
      }
      if (accessMethod) {
        accessLogsQuery += " AND al.access_method = ?";
        accessParams.push(accessMethod);
      }
      if (success !== undefined) {
        accessLogsQuery += " AND al.success = ?";
        accessParams.push(success === "true" || success === true ? 1 : 0);
      }

      accessLogsQuery += " ORDER BY al.timestamp DESC";
      const [accessLogs] = await db.query(accessLogsQuery, accessParams);

      // Fetch system logs
      let systemLogsQuery = `
        SELECT sl.*, u.username, u.email, u.role
        FROM system_logs sl
        LEFT JOIN users u ON sl.user_id = u.id
        WHERE 1=1
      `;
      const systemParams = [];

      if (startDate) {
        systemLogsQuery += " AND sl.timestamp >= ?";
        systemParams.push(startDate);
      }
      if (endDate) {
        systemLogsQuery += " AND sl.timestamp <= ?";
        systemParams.push(endDate);
      }
      if (userId) {
        systemLogsQuery += " AND sl.user_id = ?";
        systemParams.push(userId);
      }

      systemLogsQuery += " ORDER BY sl.timestamp DESC";
      const [systemLogs] = await db.query(systemLogsQuery, systemParams);

      // Get statistics
      let statsQuery = `
        SELECT 
          COUNT(*) as total_accesses,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_accesses,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_accesses,
          COUNT(DISTINCT user_id) as unique_users
        FROM access_logs
        WHERE 1=1
      `;
      const statsParams = [];
      if (startDate) {
        statsQuery += " AND timestamp >= ?";
        statsParams.push(startDate);
      }
      if (endDate) {
        statsQuery += " AND timestamp <= ?";
        statsParams.push(endDate);
      }
      const [stats] = await db.query(statsQuery, statsParams);

      const reportData = {
        title: "Admin Report - Comprehensive System Logs",
        generatedAt: new Date().toISOString(),
        filters,
        statistics: stats[0] || {},
        accessLogs: accessLogs.map(this._mapAccessLog),
        systemLogs: systemLogs.map(this._mapSystemLog),
      };

      if (format === "pdf") {
        return await this._generatePDFReport(reportData, "admin");
      } else {
        return await this._generateCSVReport(reportData, "admin");
      }
    } catch (error) {
      logger.error("Error generating admin report:", error);
      throw error;
    }
  }

  /**
   * Generate report for Teacher users
   * Includes only their own access logs and related system activities
   */
  async generateTeacherReport(userId, format, filters = {}) {
    try {
      const { startDate, endDate, accessMethod, success } = filters;

      // Fetch teacher's access logs
      let accessLogsQuery = `
        SELECT al.*, u.username, u.email, u.role, l.name as laboratory_name
        FROM access_logs al
        LEFT JOIN users u ON al.user_id = u.id
        LEFT JOIN laboratories l ON al.laboratory_id = l.id
        WHERE al.user_id = ?
      `;
      const accessParams = [userId];

      if (startDate) {
        accessLogsQuery += " AND al.timestamp >= ?";
        accessParams.push(startDate);
      }
      if (endDate) {
        accessLogsQuery += " AND al.timestamp <= ?";
        accessParams.push(endDate);
      }
      if (accessMethod) {
        accessLogsQuery += " AND al.access_method = ?";
        accessParams.push(accessMethod);
      }
      if (success !== undefined) {
        accessLogsQuery += " AND al.success = ?";
        accessParams.push(success === "true" || success === true ? 1 : 0);
      }

      accessLogsQuery += " ORDER BY al.timestamp DESC";
      const [accessLogs] = await db.query(accessLogsQuery, accessParams);

      // Fetch teacher's system logs
      let systemLogsQuery = `
        SELECT sl.*, u.username, u.email, u.role
        FROM system_logs sl
        LEFT JOIN users u ON sl.user_id = u.id
        WHERE sl.user_id = ?
      `;
      const systemParams = [userId];

      if (startDate) {
        systemLogsQuery += " AND sl.timestamp >= ?";
        systemParams.push(startDate);
      }
      if (endDate) {
        systemLogsQuery += " AND sl.timestamp <= ?";
        systemParams.push(endDate);
      }

      systemLogsQuery += " ORDER BY sl.timestamp DESC";
      const [systemLogs] = await db.query(systemLogsQuery, systemParams);

      // Get teacher statistics
      let statsQuery = `
        SELECT 
          COUNT(*) as total_accesses,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_accesses,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_accesses
        FROM access_logs
        WHERE user_id = ?
      `;
      const statsParams = [userId];
      if (startDate) {
        statsQuery += " AND timestamp >= ?";
        statsParams.push(startDate);
      }
      if (endDate) {
        statsQuery += " AND timestamp <= ?";
        statsParams.push(endDate);
      }
      const [stats] = await db.query(statsQuery, statsParams);

      const reportData = {
        title: "Teacher Report - Personal Access Logs",
        generatedAt: new Date().toISOString(),
        userId,
        filters,
        statistics: stats[0] || {},
        accessLogs: accessLogs.map(this._mapAccessLog),
        systemLogs: systemLogs.map(this._mapSystemLog),
      };

      if (format === "pdf") {
        return await this._generatePDFReport(reportData, "teacher");
      } else {
        return await this._generateCSVReport(reportData, "teacher");
      }
    } catch (error) {
      logger.error("Error generating teacher report:", error);
      throw error;
    }
  }

  /**
   * Generate report for Tech Support users
   * Includes all access logs and system logs (read-only view)
   */
  async generateTechSupportReport(format, filters = {}) {
    try {
      const { startDate, endDate, userId, accessMethod, success } = filters;

      // Fetch access logs
      let accessLogsQuery = `
        SELECT al.*, u.username, u.email, u.role, l.name as laboratory_name
        FROM access_logs al
        LEFT JOIN users u ON al.user_id = u.id
        LEFT JOIN laboratories l ON al.laboratory_id = l.id
        WHERE 1=1
      `;
      const accessParams = [];

      if (startDate) {
        accessLogsQuery += " AND al.timestamp >= ?";
        accessParams.push(startDate);
      }
      if (endDate) {
        accessLogsQuery += " AND al.timestamp <= ?";
        accessParams.push(endDate);
      }
      if (userId) {
        accessLogsQuery += " AND al.user_id = ?";
        accessParams.push(userId);
      }
      if (accessMethod) {
        accessLogsQuery += " AND al.access_method = ?";
        accessParams.push(accessMethod);
      }
      if (success !== undefined) {
        accessLogsQuery += " AND al.success = ?";
        accessParams.push(success === "true" || success === true ? 1 : 0);
      }

      accessLogsQuery += " ORDER BY al.timestamp DESC";
      const [accessLogs] = await db.query(accessLogsQuery, accessParams);

      // Fetch system logs
      let systemLogsQuery = `
        SELECT sl.*, u.username, u.email, u.role
        FROM system_logs sl
        LEFT JOIN users u ON sl.user_id = u.id
        WHERE 1=1
      `;
      const systemParams = [];

      if (startDate) {
        systemLogsQuery += " AND sl.timestamp >= ?";
        systemParams.push(startDate);
      }
      if (endDate) {
        systemLogsQuery += " AND sl.timestamp <= ?";
        systemParams.push(endDate);
      }
      if (userId) {
        systemLogsQuery += " AND sl.user_id = ?";
        systemParams.push(userId);
      }

      systemLogsQuery += " ORDER BY sl.timestamp DESC";
      const [systemLogs] = await db.query(systemLogsQuery, systemParams);

      // Get statistics
      let statsQuery = `
        SELECT 
          COUNT(*) as total_accesses,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_accesses,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_accesses,
          COUNT(DISTINCT user_id) as unique_users
        FROM access_logs
        WHERE 1=1
      `;
      const statsParams = [];
      if (startDate) {
        statsQuery += " AND timestamp >= ?";
        statsParams.push(startDate);
      }
      if (endDate) {
        statsQuery += " AND timestamp <= ?";
        statsParams.push(endDate);
      }
      const [stats] = await db.query(statsQuery, statsParams);

      const reportData = {
        title: "Tech Support Report - System Logs",
        generatedAt: new Date().toISOString(),
        filters,
        statistics: stats[0] || {},
        accessLogs: accessLogs.map(this._mapAccessLog),
        systemLogs: systemLogs.map(this._mapSystemLog),
      };

      if (format === "pdf") {
        return await this._generatePDFReport(reportData, "techsupport");
      } else {
        return await this._generateCSVReport(reportData, "techsupport");
      }
    } catch (error) {
      logger.error("Error generating tech support report:", error);
      throw error;
    }
  }

  /**
   * Generate report for regular User level
   * Includes only their own access logs
   */
  async generateUserReport(userId, format, filters = {}) {
    try {
      const { startDate, endDate, accessMethod, success } = filters;

      // Fetch user's access logs
      let accessLogsQuery = `
        SELECT al.*, u.username, u.email, u.role, l.name as laboratory_name
        FROM access_logs al
        LEFT JOIN users u ON al.user_id = u.id
        LEFT JOIN laboratories l ON al.laboratory_id = l.id
        WHERE al.user_id = ?
      `;
      const accessParams = [userId];

      if (startDate) {
        accessLogsQuery += " AND al.timestamp >= ?";
        accessParams.push(startDate);
      }
      if (endDate) {
        accessLogsQuery += " AND al.timestamp <= ?";
        accessParams.push(endDate);
      }
      if (accessMethod) {
        accessLogsQuery += " AND al.access_method = ?";
        accessParams.push(accessMethod);
      }
      if (success !== undefined) {
        accessLogsQuery += " AND al.success = ?";
        accessParams.push(success === "true" || success === true ? 1 : 0);
      }

      accessLogsQuery += " ORDER BY al.timestamp DESC";
      const [accessLogs] = await db.query(accessLogsQuery, accessParams);

      // Get user statistics
      let statsQuery = `
        SELECT 
          COUNT(*) as total_accesses,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_accesses,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_accesses
        FROM access_logs
        WHERE user_id = ?
      `;
      const statsParams = [userId];
      if (startDate) {
        statsQuery += " AND timestamp >= ?";
        statsParams.push(startDate);
      }
      if (endDate) {
        statsQuery += " AND timestamp <= ?";
        statsParams.push(endDate);
      }
      const [stats] = await db.query(statsQuery, statsParams);

      const reportData = {
        title: "User Report - Access Logs",
        generatedAt: new Date().toISOString(),
        userId,
        filters,
        statistics: stats[0] || {},
        accessLogs: accessLogs.map(this._mapAccessLog),
        systemLogs: [],
      };

      if (format === "pdf") {
        return await this._generatePDFReport(reportData, "user");
      } else {
        return await this._generateCSVReport(reportData, "user");
      }
    } catch (error) {
      logger.error("Error generating user report:", error);
      throw error;
    }
  }

  /**
   * Generate report for Visitor level
   * Includes only their own access logs (limited view)
   */
  async generateVisitorReport(userId, format, filters = {}) {
    try {
      const { startDate, endDate } = filters;

      // Fetch visitor's access logs
      let accessLogsQuery = `
        SELECT al.*, u.username, u.email, u.role, l.name as laboratory_name
        FROM access_logs al
        LEFT JOIN users u ON al.user_id = u.id
        LEFT JOIN laboratories l ON al.laboratory_id = l.id
        WHERE al.user_id = ?
      `;
      const accessParams = [userId];

      if (startDate) {
        accessLogsQuery += " AND al.timestamp >= ?";
        accessParams.push(startDate);
      }
      if (endDate) {
        accessLogsQuery += " AND al.timestamp <= ?";
        accessParams.push(endDate);
      }

      accessLogsQuery += " ORDER BY al.timestamp DESC";
      const [accessLogs] = await db.query(accessLogsQuery, accessParams);

      // Get visitor statistics
      let statsQuery = `
        SELECT 
          COUNT(*) as total_accesses,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_accesses,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_accesses
        FROM access_logs
        WHERE user_id = ?
      `;
      const statsParams = [userId];
      if (startDate) {
        statsQuery += " AND timestamp >= ?";
        statsParams.push(startDate);
      }
      if (endDate) {
        statsQuery += " AND timestamp <= ?";
        statsParams.push(endDate);
      }
      const [stats] = await db.query(statsQuery, statsParams);

      const reportData = {
        title: "Visitor Report - Access Logs",
        generatedAt: new Date().toISOString(),
        userId,
        filters,
        statistics: stats[0] || {},
        accessLogs: accessLogs.map(this._mapAccessLog),
        systemLogs: [],
      };

      if (format === "pdf") {
        return await this._generatePDFReport(reportData, "visitor");
      } else {
        return await this._generateCSVReport(reportData, "visitor");
      }
    } catch (error) {
      logger.error("Error generating visitor report:", error);
      throw error;
    }
  }

  /**
   * Map access log from database format to report format
   */
  _mapAccessLog(log) {
    return {
      id: log.id,
      userId: log.user_id,
      username: log.username || "Unknown",
      email: log.email || "",
      role: log.role || "",
      timestamp: log.timestamp,
      accessMethod: log.access_method || log.accessMethod,
      accessType: log.access_type || log.accessType || "unlock",
      success: log.success !== undefined ? Boolean(log.success) : true,
      blockchainHash: log.blockchain_hash || log.blockchainHash || null,
      fabricTxId: log.fabric_tx_id || log.fabricTxId || null,
      ipAddress: log.ip_address || log.ipAddress || null,
      laboratoryName: log.laboratory_name || log.laboratoryName || null,
      details: log.details
        ? typeof log.details === "string"
          ? JSON.parse(log.details)
          : log.details
        : null,
    };
  }

  /**
   * Map system log from database format to report format
   */
  _mapSystemLog(log) {
    return {
      id: log.id,
      eventType: log.event_type || log.eventType,
      userId: log.user_id || null,
      username: log.username || null,
      email: log.email || null,
      role: log.role || null,
      timestamp: log.timestamp,
      details: log.details
        ? typeof log.details === "string"
          ? JSON.parse(log.details)
          : log.details
        : null,
    };
  }

  /**
   * Generate PDF report
   */
  async _generatePDFReport(reportData, userLevel) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => {
          const buffer = Buffer.concat(chunks);
          resolve(buffer);
        });
        doc.on("error", reject);

        // Header
        doc.fontSize(20).text(reportData.title, { align: "center" });
        doc.moveDown();
        doc.fontSize(12).text(`Generated: ${new Date(reportData.generatedAt).toLocaleString()}`, { align: "center" });
        doc.moveDown(2);

        // Filters
        if (reportData.filters && Object.keys(reportData.filters).length > 0) {
          doc.fontSize(14).text("Filters:", { underline: true });
          doc.fontSize(10);
          Object.entries(reportData.filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              doc.text(`${key}: ${value}`);
            }
          });
          doc.moveDown();
        }

        // Statistics
        if (reportData.statistics) {
          doc.fontSize(14).text("Statistics:", { underline: true });
          doc.fontSize(10);
          doc.text(`Total Accesses: ${reportData.statistics.total_accesses || 0}`);
          doc.text(`Successful: ${reportData.statistics.successful_accesses || 0}`);
          doc.text(`Failed: ${reportData.statistics.failed_accesses || 0}`);
          if (reportData.statistics.unique_users) {
            doc.text(`Unique Users: ${reportData.statistics.unique_users || 0}`);
          }
          doc.moveDown();
        }

        // Access Logs
        if (reportData.accessLogs && reportData.accessLogs.length > 0) {
          doc.fontSize(14).text("Access Logs:", { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(9);

          reportData.accessLogs.forEach((log, index) => {
            if (index > 0 && index % 10 === 0) {
              doc.addPage();
            }

            doc.text(`ID: ${log.id}`, { continued: false });
            doc.text(`User: ${log.username} (${log.email})`, { indent: 20 });
            doc.text(`Timestamp: ${new Date(log.timestamp).toLocaleString()}`, { indent: 20 });
            doc.text(`Method: ${log.accessMethod} | Type: ${log.accessType} | Success: ${log.success ? "Yes" : "No"}`, { indent: 20 });
            if (log.laboratoryName) {
              doc.text(`Laboratory: ${log.laboratoryName}`, { indent: 20 });
            }
            if (log.ipAddress) {
              doc.text(`IP Address: ${log.ipAddress}`, { indent: 20 });
            }
            doc.moveDown(0.5);
          });
        }

        // System Logs
        if (reportData.systemLogs && reportData.systemLogs.length > 0) {
          doc.addPage();
          doc.fontSize(14).text("System Logs:", { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(9);

          reportData.systemLogs.forEach((log, index) => {
            if (index > 0 && index % 10 === 0) {
              doc.addPage();
            }

            doc.text(`ID: ${log.id}`, { continued: false });
            doc.text(`Event Type: ${log.eventType}`, { indent: 20 });
            doc.text(`User: ${log.username || "System"}`, { indent: 20 });
            doc.text(`Timestamp: ${new Date(log.timestamp).toLocaleString()}`, { indent: 20 });
            doc.moveDown(0.5);
          });
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate CSV report
   */
  async _generateCSVReport(reportData, userLevel) {
    return new Promise(async (resolve, reject) => {
      try {
        const tempDir = path.join(__dirname, "../temp");
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const csvPath = path.join(tempDir, `report_${userLevel}_${timestamp}.csv`);

        // Prepare CSV data
        const csvData = [];

        // Add statistics as header rows
        csvData.push({
          type: "STATISTICS",
          id: "",
          userId: "",
          username: "",
          email: "",
          role: "",
          timestamp: "",
          accessMethod: "",
          accessType: "",
          success: "",
          eventType: "",
          laboratoryName: "",
          ipAddress: "",
          blockchainHash: "",
          fabricTxId: "",
          field: "Total Accesses",
          value: reportData.statistics.total_accesses || 0,
          details: "",
        });
        csvData.push({
          type: "STATISTICS",
          id: "",
          userId: "",
          username: "",
          email: "",
          role: "",
          timestamp: "",
          accessMethod: "",
          accessType: "",
          success: "",
          eventType: "",
          laboratoryName: "",
          ipAddress: "",
          blockchainHash: "",
          fabricTxId: "",
          field: "Successful Accesses",
          value: reportData.statistics.successful_accesses || 0,
          details: "",
        });
        csvData.push({
          type: "STATISTICS",
          id: "",
          userId: "",
          username: "",
          email: "",
          role: "",
          timestamp: "",
          accessMethod: "",
          accessType: "",
          success: "",
          eventType: "",
          laboratoryName: "",
          ipAddress: "",
          blockchainHash: "",
          fabricTxId: "",
          field: "Failed Accesses",
          value: reportData.statistics.failed_accesses || 0,
          details: "",
        });
        if (reportData.statistics.unique_users) {
          csvData.push({
            type: "STATISTICS",
            id: "",
            userId: "",
            username: "",
            email: "",
            role: "",
            timestamp: "",
            accessMethod: "",
            accessType: "",
            success: "",
            eventType: "",
            laboratoryName: "",
            ipAddress: "",
            blockchainHash: "",
            fabricTxId: "",
            field: "Unique Users",
            value: reportData.statistics.unique_users || 0,
            details: "",
          });
        }

        // Add access logs
        reportData.accessLogs.forEach((log) => {
          csvData.push({
            type: "ACCESS_LOG",
            id: log.id || "",
            userId: log.userId || "",
            username: log.username || "",
            email: log.email || "",
            role: log.role || "",
            timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : "",
            accessMethod: log.accessMethod || "",
            accessType: log.accessType || "",
            success: log.success ? "Yes" : "No",
            eventType: "",
            laboratoryName: log.laboratoryName || "",
            ipAddress: log.ipAddress || "",
            blockchainHash: log.blockchainHash || "",
            fabricTxId: log.fabricTxId || "",
            field: "",
            value: "",
            details: log.details ? JSON.stringify(log.details) : "",
          });
        });

        // Add system logs
        reportData.systemLogs.forEach((log) => {
          csvData.push({
            type: "SYSTEM_LOG",
            id: log.id || "",
            userId: log.userId || "",
            username: log.username || "",
            email: log.email || "",
            role: log.role || "",
            timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : "",
            accessMethod: "",
            accessType: "",
            success: "",
            eventType: log.eventType || "",
            laboratoryName: "",
            ipAddress: "",
            blockchainHash: "",
            fabricTxId: "",
            field: "",
            value: "",
            details: log.details ? JSON.stringify(log.details) : "",
          });
        });

        // Create CSV writer
        const csvWriter = createCsvWriter({
          path: csvPath,
          header: [
            { id: "type", title: "Type" },
            { id: "id", title: "ID" },
            { id: "userId", title: "User ID" },
            { id: "username", title: "Username" },
            { id: "email", title: "Email" },
            { id: "role", title: "Role" },
            { id: "timestamp", title: "Timestamp" },
            { id: "accessMethod", title: "Access Method" },
            { id: "accessType", title: "Access Type" },
            { id: "success", title: "Success" },
            { id: "eventType", title: "Event Type" },
            { id: "laboratoryName", title: "Laboratory" },
            { id: "ipAddress", title: "IP Address" },
            { id: "blockchainHash", title: "Blockchain Hash" },
            { id: "fabricTxId", title: "Fabric TX ID" },
            { id: "field", title: "Field" },
            { id: "value", title: "Value" },
            { id: "details", title: "Details" },
          ],
        });

        await csvWriter.writeRecords(csvData);

        // Read the file and return buffer
        const buffer = fs.readFileSync(csvPath);
        
        // Clean up temp file
        fs.unlinkSync(csvPath);

        resolve(buffer);
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = new ReportService();

