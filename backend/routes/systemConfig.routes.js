const express = require("express");
const router = express.Router();
const systemConfigController = require("../controllers/systemConfig.controller");
const {
  authenticate,
  requireAdmin,
  requireAdminOrTechSupport,
} = require("../middleware/auth.middleware");
const { body, param, validationResult } = require("express-validator");

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

// Get system configuration
router.get("/", authenticate, systemConfigController.getConfig);

// Update system configuration (admin only)
router.put(
  "/",
  authenticate,
  requireAdmin,
  [
    body("lockStatus").optional().isIn(["locked", "unlocked"]),
    body("autoLockEnabled").optional().isBoolean(),
    body("maxAccessAttempts").optional().isInt({ min: 1, max: 10 }),
    body("sessionTimeout").optional().isInt({ min: 5, max: 120 }),
    body("notificationsEnabled").optional().isBoolean(),
    body("blockchainEnabled").optional().isBoolean(),
  ],
  validate,
  systemConfigController.updateConfig
);

// Get blockchain statistics
router.get(
  "/blockchain-stats",
  authenticate,
  systemConfigController.getBlockchainStats
);

// Get device status (Admin and TechSupport)
router.get(
  "/device/:deviceId/status",
  authenticate,
  requireAdminOrTechSupport,
  [param("deviceId").notEmpty().withMessage("Device ID is required")],
  validate,
  systemConfigController.getDeviceStatus
);

// Get device from .env (Admin and TechSupport)
router.get(
  "/device/env",
  authenticate,
  requireAdminOrTechSupport,
  systemConfigController.getDeviceFromEnv
);

// Get device details (Admin and TechSupport)
router.get(
  "/device/:deviceId/details",
  authenticate,
  requireAdminOrTechSupport,
  [param("deviceId").notEmpty().withMessage("Device ID is required")],
  validate,
  systemConfigController.getDeviceDetails
);

// Unlock device without password (Admin and TechSupport)
router.post(
  "/device/:deviceId/unlock",
  authenticate,
  requireAdminOrTechSupport,
  [param("deviceId").notEmpty().withMessage("Device ID is required")],
  validate,
  systemConfigController.unlockDevice
);

// Lock device (Admin and TechSupport)
router.post(
  "/device/:deviceId/lock",
  authenticate,
  requireAdminOrTechSupport,
  [param("deviceId").notEmpty().withMessage("Device ID is required")],
  validate,
  systemConfigController.lockDevice
);

module.exports = router;
