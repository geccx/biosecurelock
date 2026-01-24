const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboard.controller");
const { authenticate } = require("../middleware/auth.middleware");

// Get dashboard statistics
router.get("/stats", authenticate, dashboardController.getStats);

// Get system status
router.get("/system-status", authenticate, dashboardController.getSystemStatus);

// Get recent access logs
router.get("/recent-logs", authenticate, dashboardController.getRecentAccessLogs);

// Get pending approvals
router.get("/pending-approvals", authenticate, dashboardController.getPendingApprovals);

module.exports = router;

