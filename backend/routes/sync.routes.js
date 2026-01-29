/**
 * Sync Routes
 * Credential sync and sync queue/history. Device status and log retrieve/gaps are on /api/devices and /api/logs.
 */
const express = require("express");
const router = express.Router();
const syncController = require("../controllers/sync.controller");
const {
  authenticate,
  requireAdmin,
  requireAdminOrTechSupport,
} = require("../middleware/auth.middleware");
const { body, param, query, validationResult } = require("express-validator");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// Credential sync (admin / tech support)
router.post(
  "/credentials/sync",
  authenticate,
  requireAdminOrTechSupport,
  [
    body("credentialType").isIn(["enrollment", "temporary_password"]),
    body("credentialId").isInt(),
    body("deviceIds").optional().isArray(),
  ],
  validate,
  syncController.syncCredential,
);

router.get(
  "/credentials/sync-status/:id",
  authenticate,
  requireAdminOrTechSupport,
  [
    param("id").isInt(),
    query("type").optional().isIn(["enrollment", "temporary_password"]),
  ],
  validate,
  syncController.getCredentialSyncStatus,
);

router.post(
  "/credentials/force-sync",
  authenticate,
  requireAdmin,
  syncController.forceSyncCredentials,
);

// Sync queue & history (admin / tech support)
router.get(
  "/queue",
  authenticate,
  requireAdminOrTechSupport,
  [
    query("status")
      .optional()
      .isIn(["pending", "processing", "completed", "failed"]),
  ],
  validate,
  syncController.getSyncQueue,
);

router.post(
  "/retry/:id",
  authenticate,
  requireAdminOrTechSupport,
  [param("id").isInt()],
  validate,
  syncController.retrySync,
);

router.get(
  "/history",
  authenticate,
  requireAdminOrTechSupport,
  [query("limit").optional().isInt({ min: 1, max: 100 })],
  validate,
  syncController.getSyncHistory,
);

module.exports = router;
