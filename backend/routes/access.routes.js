const express = require("express");
const router = express.Router();
const accessController = require("../controllers/access.controller");
const { authenticate, requireAdmin, requireAdminOrTechSupport, hasPermission, PERMISSIONS } = require("../middleware/auth.middleware");
const {
  checkFabricPermission,
} = require("../middleware/fabricAuth.middleware");
const { body, query, param, validationResult } = require("express-validator");

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

// Remote unlock
router.post(
  "/unlock",
  authenticate,
  checkFabricPermission("remote_unlock"),
  [
    body("method").optional().isIn(["pin", "passwordFree"]),
    body("password").optional().isString(),
    body("labName").optional().isString(),
  ],
  validate,
  accessController.unlockDoor
);

// Emergency unlock (Admin/TechSupport override)
router.post(
  "/emergency-unlock",
  authenticate,
  hasPermission(PERMISSIONS.EMERGENCY_OVERRIDE),
  [
    body("reason").isString().trim().notEmpty().withMessage("Reason is required for emergency unlock"),
    body("deviceId").optional().isString(),
    body("labName").optional().isString(),
  ],
  validate,
  accessController.emergencyUnlock
);

// Handle physical access attempt (from Tuya webhook or device)
router.post(
  "/physical",
  authenticate,
  [
    body("userId").isInt(),
    body("accessMethod").isIn(["fingerprint", "rfid", "pin"]),
    body("labName").optional().isString(),
  ],
  validate,
  accessController.handlePhysicalAccess
);

// Get dynamic password
router.get(
  "/dynamic-password",
  authenticate,
  accessController.getDynamicPassword
);

// Create temporary password (admin and techsupport)
router.post(
  "/temp-password",
  authenticate,
  requireAdminOrTechSupport,
  [
    body("name").isString(),
    body("password").isString(),
    body("validFrom").isISO8601(),
    body("validUntil").isISO8601(),
    body("maxUsage").optional().isInt({ min: 1 }),
    body("targetUserId").optional().isInt(),
  ],
  validate,
  accessController.createTempPassword
);

// Get access logs
router.get(
  "/logs",
  authenticate,
  [
    query("userId").optional().isInt(),
    query("startDate").optional().isISO8601(),
    query("endDate").optional().isISO8601(),
    query("accessMethod").optional().isString(),
    query("success").optional().isBoolean(),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("offset").optional().isInt({ min: 0 }),
  ],
  validate,
  accessController.getAccessLogs
);

// Get system logs (admin only)
router.get(
  "/system-logs",
  authenticate,
  requireAdmin,
  [
    query("eventType").optional().isString(),
    query("userId").optional().isInt(),
    query("startDate").optional().isISO8601(),
    query("endDate").optional().isISO8601(),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("offset").optional().isInt({ min: 0 }),
  ],
  validate,
  accessController.getSystemLogs
);

// Get access statistics
router.get(
  "/stats",
  authenticate,
  [
    query("userId").optional().isInt(),
    query("period").optional().isIn(["24hours", "7days", "30days", "90days"]),
  ],
  validate,
  accessController.getAccessStats
);

// Schedule routes
router.post(
  "/schedules",
  authenticate,
  [
    body("name").isString(),
    body("daysOfWeek").isArray(),
    body("startTime").matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body("endTime").matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body("autoUnlock").optional().isBoolean(),
  ],
  validate,
  accessController.createSchedule
);

router.get(
  "/schedules/:userId?",
  authenticate,
  accessController.getUserSchedules
);

router.put(
  "/schedules/:scheduleId",
  authenticate,
  param("scheduleId").isInt(),
  validate,
  accessController.updateSchedule
);

router.delete(
  "/schedules/:scheduleId",
  authenticate,
  param("scheduleId").isInt(),
  validate,
  accessController.deleteSchedule
);

module.exports = router;
