const express = require("express");
const router = express.Router();
const logsController = require("../controllers/logs.controller");
const {
  authenticate,
  requireAdmin,
  requireAdminOrTechSupport,
  hasPermission,
  hasAnyPermission,
  PERMISSIONS,
} = require("../middleware/auth.middleware");
const { query, param, validationResult } = require("express-validator");

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }
  next();
};

/**
 * Logs Routes with Role-Based Access:
 *
 * Admin: Can view all logs, export, generate reports
 * Tech Support: Can view all logs (read-only), no export
 * Teacher: Can only view their own access logs
 */

// Get access logs with filtering
// Requires: view_all_logs or view_own_logs permission
router.get(
  "/access",
  authenticate,
  hasAnyPermission(PERMISSIONS.VIEW_ALL_LOGS, PERMISSIONS.VIEW_OWN_LOGS),
  [
    query("userId").optional().isInt().withMessage("userId must be an integer"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("startDate must be valid ISO date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("endDate must be valid ISO date"),
    query("accessMethod")
      .optional()
      .isIn([
        "fingerprint",
        "rfid",
        "pin",
        "remote",
        "auto_schedule",
        "key",
        "temporary_password",
        "dynamic_password",
      ])
      .withMessage("Invalid access method"),
    query("success")
      .optional()
      .isBoolean()
      .withMessage("success must be boolean"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("limit must be between 1 and 100"),
    query("offset")
      .optional()
      .isInt({ min: 0 })
      .withMessage("offset must be non-negative"),
  ],
  validate,
  async (req, res, next) => {
    // Users with only view_own_logs permission can only view their own logs
    if (
      req.user.permissions.includes(PERMISSIONS.VIEW_OWN_LOGS) &&
      !req.user.permissions.includes(PERMISSIONS.VIEW_ALL_LOGS)
    ) {
      req.query.userId = req.user.id.toString();
    }
    logsController.getAccessLogs(req, res, next);
  }
);

// Get system activity logs (admin, tech support, and teachers for their own logs)
router.get(
  "/system",
  authenticate,
  [
    query("eventType")
      .optional()
      .isString()
      .withMessage("eventType must be string"),
    query("userId").optional().isInt().withMessage("userId must be an integer"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("startDate must be valid ISO date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("endDate must be valid ISO date"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("limit must be between 1 and 100"),
    query("offset")
      .optional()
      .isInt({ min: 0 })
      .withMessage("offset must be non-negative"),
  ],
  validate,
  logsController.getSystemLogs
);

// Get access statistics
// Requires: view_all_logs or view_own_logs permission
router.get(
  "/stats",
  authenticate,
  hasAnyPermission(PERMISSIONS.VIEW_ALL_LOGS, PERMISSIONS.VIEW_OWN_LOGS),
  [
    query("userId").optional().isInt().withMessage("userId must be an integer"),
    query("period")
      .optional()
      .isIn(["24hours", "7days", "30days", "90days"])
      .withMessage("period must be one of: 24hours, 7days, 30days, 90days"),
  ],
  validate,
  async (req, res, next) => {
    // Users with only view_own_logs permission can only view their own stats
    if (
      req.user.permissions.includes(PERMISSIONS.VIEW_OWN_LOGS) &&
      !req.user.permissions.includes(PERMISSIONS.VIEW_ALL_LOGS)
    ) {
      req.query.userId = req.user.id.toString();
    }
    logsController.getAccessStats(req, res, next);
  }
);

// Get single access log by ID
router.get(
  "/access/:logId",
  authenticate,
  [param("logId").isInt().withMessage("logId must be an integer")],
  validate,
  logsController.getAccessLogById
);

// Get Tuya unlocking history (new v1.1 API)
// Requires: view_all_logs permission (admin/tech support)
router.get(
  "/tuya/unlocking-history",
  authenticate,
  hasPermission(PERMISSIONS.VIEW_ALL_LOGS),
  [
    query("page_no")
      .optional()
      .isInt({ min: 1 })
      .withMessage("page_no must be a positive integer"),
    query("page_size")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("page_size must be between 1 and 100"),
    query("start_time")
      .optional()
      .custom((value) => {
        // Accept either ISO date string or numeric timestamp (seconds or milliseconds).
        // Note: express-validator always passes query params as strings,
        // so we first try to parse as number, then fall back to Date parsing.
        const num = Number(value);
        if (!Number.isNaN(num)) {
          return true;
        }

        const date = new Date(value);
        return !isNaN(date.getTime());
      })
      .withMessage("start_time must be a valid date or timestamp"),
    query("end_time")
      .optional()
      .custom((value) => {
        // Accept either ISO date string or numeric timestamp (seconds or milliseconds).
        const num = Number(value);
        if (!Number.isNaN(num)) {
          return true;
        }

        const date = new Date(value);
        return !isNaN(date.getTime());
      })
      .withMessage("end_time must be a valid date or timestamp"),
    query("showMediaInfo")
      .optional()
      .isBoolean()
      .withMessage("showMediaInfo must be boolean"),
  ],
  validate,
  logsController.getTuyaUnlockingHistory
);

// Export logs
// Requires: generate_reports permission
router.get(
  "/export",
  authenticate,
  hasPermission(PERMISSIONS.GENERATE_REPORTS),
  [
    query("format")
      .optional()
      .isIn(["json", "csv"])
      .withMessage("format must be json or csv"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("startDate must be valid ISO date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("endDate must be valid ISO date"),
  ],
  validate,
  logsController.exportLogs
);

// Generate reports
// Requires: generate_reports permission
router.get(
  "/reports",
  authenticate,
  hasPermission(PERMISSIONS.GENERATE_REPORTS),
  [
    query("type")
      .optional()
      .isIn(["daily", "weekly", "monthly"])
      .withMessage("type must be daily, weekly, or monthly"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("startDate must be valid ISO date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("endDate must be valid ISO date"),
  ],
  validate,
  logsController.getAccessStats // Reuse stats controller for now
);

// Generate Admin Report
// Requires: generate_reports permission
router.get(
  "/reports/admin",
  authenticate,
  hasPermission(PERMISSIONS.GENERATE_REPORTS),
  [
    query("format")
      .optional()
      .isIn(["pdf", "csv"])
      .withMessage("format must be pdf or csv"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("startDate must be valid ISO date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("endDate must be valid ISO date"),
    query("userId").optional().isInt().withMessage("userId must be an integer"),
    query("accessMethod")
      .optional()
      .isIn([
        "fingerprint",
        "rfid",
        "pin",
        "remote",
        "auto_schedule",
        "key",
        "temporary_password",
        "dynamic_password",
      ])
      .withMessage("Invalid access method"),
    query("success")
      .optional()
      .isBoolean()
      .withMessage("success must be boolean"),
  ],
  validate,
  logsController.generateAdminReport
);

// Generate Teacher Report
router.get(
  "/reports/teacher",
  authenticate,
  [
    query("format")
      .optional()
      .isIn(["pdf", "csv"])
      .withMessage("format must be pdf or csv"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("startDate must be valid ISO date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("endDate must be valid ISO date"),
    query("accessMethod")
      .optional()
      .isIn([
        "fingerprint",
        "rfid",
        "pin",
        "remote",
        "auto_schedule",
        "key",
        "temporary_password",
        "dynamic_password",
      ])
      .withMessage("Invalid access method"),
    query("success")
      .optional()
      .isBoolean()
      .withMessage("success must be boolean"),
  ],
  validate,
  async (req, res, next) => {
    if (req.user.role !== "teacher") {
      return res.status(403).json({
        success: false,
        error: "Teacher access required",
      });
    }
    logsController.generateTeacherReport(req, res, next);
  }
);

// Generate Tech Support Report
router.get(
  "/reports/techsupport",
  authenticate,
  requireAdminOrTechSupport,
  [
    query("format")
      .optional()
      .isIn(["pdf", "csv"])
      .withMessage("format must be pdf or csv"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("startDate must be valid ISO date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("endDate must be valid ISO date"),
    query("userId").optional().isInt().withMessage("userId must be an integer"),
    query("accessMethod")
      .optional()
      .isIn([
        "fingerprint",
        "rfid",
        "pin",
        "remote",
        "auto_schedule",
        "key",
        "temporary_password",
        "dynamic_password",
      ])
      .withMessage("Invalid access method"),
    query("success")
      .optional()
      .isBoolean()
      .withMessage("success must be boolean"),
  ],
  validate,
  logsController.generateTechSupportReport
);

// Generate User Report
router.get(
  "/reports/user",
  authenticate,
  [
    query("format")
      .optional()
      .isIn(["pdf", "csv"])
      .withMessage("format must be pdf or csv"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("startDate must be valid ISO date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("endDate must be valid ISO date"),
    query("accessMethod")
      .optional()
      .isIn([
        "fingerprint",
        "rfid",
        "pin",
        "remote",
        "auto_schedule",
        "key",
        "temporary_password",
        "dynamic_password",
      ])
      .withMessage("Invalid access method"),
    query("success")
      .optional()
      .isBoolean()
      .withMessage("success must be boolean"),
  ],
  validate,
  async (req, res, next) => {
    if (req.user.role !== "user") {
      return res.status(403).json({
        success: false,
        error: "User access required",
      });
    }
    logsController.generateUserReport(req, res, next);
  }
);

// Generate Visitor Report
router.get(
  "/reports/visitor",
  authenticate,
  [
    query("format")
      .optional()
      .isIn(["pdf", "csv"])
      .withMessage("format must be pdf or csv"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("startDate must be valid ISO date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("endDate must be valid ISO date"),
  ],
  validate,
  async (req, res, next) => {
    if (req.user.role !== "visitor") {
      return res.status(403).json({
        success: false,
        error: "Visitor access required",
      });
    }
    logsController.generateVisitorReport(req, res, next);
  }
);

module.exports = router;
