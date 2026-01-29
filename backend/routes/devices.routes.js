const express = require("express");
const router = express.Router();
const devicesController = require("../controllers/devices.controller");
const syncController = require("../controllers/sync.controller");
const {
  authenticate,
  requireAdmin,
  requireAdminOrTechSupport,
  hasPermission,
  hasAnyPermission,
  PERMISSIONS,
} = require("../middleware/auth.middleware");
const { body, param, query, validationResult } = require("express-validator");

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
 * Device Routes with Role-Based Access:
 *
 * Admin: Full control (create, update, delete, check health)
 * Tech Support: View, refresh status, check health, troubleshoot
 * Teacher: View only
 */

// Get all devices (all authenticated users)
router.get("/", authenticate, devicesController.getAllDevices);

// Get all device sync status (admin/tech support) - must be before /:deviceId
router.get(
  "/status",
  authenticate,
  requireAdminOrTechSupport,
  syncController.getAllDevicesStatus,
);

// Get online smart door locks from Tuya (admin only)
router.get(
  "/online-door-locks",
  authenticate,
  requireAdmin,
  devicesController.getOnlineSmartDoorLocks,
);

// Get device status with Tuya details (admin/tech support)
router.get(
  "/status/tuya",
  authenticate,
  requireAdminOrTechSupport,
  devicesController.getDeviceStatusWithTuya,
);

// Refresh all devices status (admin/tech support for monitoring)
router.post(
  "/refresh",
  authenticate,
  requireAdminOrTechSupport,
  devicesController.refreshAllDevices,
);

// Get a single device (all authenticated users)
router.get(
  "/:deviceId",
  authenticate,
  param("deviceId").isInt(),
  validate,
  devicesController.getDeviceById,
);

// Get single device sync status (admin/tech support)
router.get(
  "/:deviceId/status",
  authenticate,
  requireAdminOrTechSupport,
  [param("deviceId").isInt()],
  validate,
  (req, res) => {
    req.params.id = req.params.deviceId;
    syncController.getDeviceStatus(req, res);
  },
);

// Ping device connectivity (admin/tech support)
router.post(
  "/:deviceId/ping",
  authenticate,
  requireAdminOrTechSupport,
  [param("deviceId").isInt()],
  validate,
  (req, res) => {
    req.params.id = req.params.deviceId;
    syncController.pingDevice(req, res);
  },
);

// Create a new device (admin only)
router.post(
  "/",
  authenticate,
  requireAdmin,
  [
    body("deviceName").isString().notEmpty(),
    body("type").isIn(["lock", "fingerprint", "rfid", "network"]),
    body("location").isString().notEmpty(),
    body("tuyaDeviceId").optional().isString(),
  ],
  validate,
  devicesController.createDevice,
);

// Update a device (admin only)
router.put(
  "/:deviceId",
  authenticate,
  requireAdmin,
  [
    param("deviceId").isInt(),
    body("deviceName").optional().isString(),
    body("type").optional().isIn(["lock", "fingerprint", "rfid", "network"]),
    body("status").optional().isIn(["online", "offline", "error"]),
    body("location").optional().isString(),
    body("tuyaDeviceId").optional().isString(),
  ],
  validate,
  devicesController.updateDevice,
);

// Check device health (admin/tech support for troubleshooting)
router.post(
  "/:deviceId/health-check",
  authenticate,
  requireAdminOrTechSupport,
  param("deviceId").isInt(),
  validate,
  devicesController.checkDeviceHealth,
);

// Troubleshoot device (tech support)
router.post(
  "/:deviceId/troubleshoot",
  authenticate,
  requireAdminOrTechSupport,
  param("deviceId").isInt(),
  validate,
  devicesController.troubleshootDevice,
);

// Delete a device (admin only)
router.delete(
  "/:deviceId",
  authenticate,
  requireAdmin,
  param("deviceId").isInt(),
  validate,
  devicesController.deleteDevice,
);

// Get device logs from Tuya API
// Requires: view_all_logs permission (for monitoring)
router.get(
  "/:deviceId/logs",
  authenticate,
  hasPermission(PERMISSIONS.VIEW_ALL_LOGS),
  [
    param("deviceId").isInt(),
    query("codes").optional().isString(),
    query("type").optional().isString(),
    query("start_time").optional().isInt(),
    query("end_time").optional().isInt(),
    query("query_type").optional().isInt(),
    query("start_row_key").optional().isString(),
    query("last_row_key").optional().isString(),
    query("last_event_time").optional().isInt(),
    query("size").optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  devicesController.getDeviceLogs,
);

// Get Tuya device logs using environment variable
// Requires: view_all_logs permission (for monitoring)
router.get(
  "/tuya/device/logs",
  authenticate,
  hasPermission(PERMISSIONS.VIEW_ALL_LOGS),
  [
    query("codes").optional().isString(),
    query("type").optional().isString(),
    query("start_time").optional().isInt(),
    query("end_time").optional().isInt(),
    query("query_type").optional().isInt(),
    query("start_row_key").optional().isString(),
    query("last_row_key").optional().isString(),
    query("last_event_time").optional().isInt(),
    query("size").optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  devicesController.getTuyaDeviceLogs,
);

// Get Tuya gateway logs using environment variable
// Requires: view_all_logs permission (for monitoring)
router.get(
  "/tuya/gateway/logs",
  authenticate,
  hasPermission(PERMISSIONS.VIEW_ALL_LOGS),
  [
    query("codes").optional().isString(),
    query("type").optional().isString(),
    query("start_time").optional().isInt(),
    query("end_time").optional().isInt(),
    query("query_type").optional().isInt(),
    query("start_row_key").optional().isString(),
    query("last_row_key").optional().isString(),
    query("last_event_time").optional().isInt(),
    query("size").optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  devicesController.getTuyaGatewayLogs,
);

// Get smart door lock and gateway status using GET /v1.0/devices/{device_id}
// Requires: admin or tech support (for monitoring)
router.get(
  "/status/lock-and-gateway",
  authenticate,
  requireAdminOrTechSupport,
  devicesController.getLockAndGatewayStatus,
);

module.exports = router;
