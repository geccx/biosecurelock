const express = require("express");
const router = express.Router();
const moveRequestsController = require("../controllers/moveRequests.controller");
const {
  authenticate,
  requireAdminOrTechSupport,
  requireStaff,
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
 * Schedule Move Request Routes
 * 
 * Teachers can:
 * - Create move requests for their own schedules
 * - View their own requests
 * 
 * Admin & Tech Support can:
 * - View all move requests
 * - Approve or deny requests
 */

// Create a new move request (teachers only - for their own schedules)
router.post(
  "/",
  authenticate,
  requireStaff,
  [
    body("scheduleId").isInt(),
    body("requestedStartTime").isISO8601(),
    body("requestedEndTime").isISO8601(),
    body("reason").isString().isLength({ min: 10 }),
  ],
  validate,
  moveRequestsController.createMoveRequest
);

// Get all move requests (admin/techsupport only)
router.get(
  "/",
  authenticate,
  requireAdminOrTechSupport,
  [
    query("status").optional().isIn(["pending", "approved", "denied"]),
    query("teacherId").optional().isInt(),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("offset").optional().isInt({ min: 0 }),
  ],
  validate,
  moveRequestsController.getAllMoveRequests
);

// Get pending move requests (admin/techsupport only)
router.get(
  "/pending",
  authenticate,
  requireAdminOrTechSupport,
  moveRequestsController.getPendingRequests
);

// Get current user's move requests (teachers view their own)
router.get("/my-requests", authenticate, moveRequestsController.getTeacherRequests);

// Get move requests for a specific teacher (admin/techsupport or the teacher themselves)
router.get(
  "/teacher/:teacherId",
  authenticate,
  param("teacherId").isInt(),
  validate,
  async (req, res, next) => {
    const { teacherId } = req.params;
    // Allow if admin/techsupport OR if requesting own data
    if (
      req.user.role === "admin" ||
      req.user.role === "techsupport" ||
      req.user.id === parseInt(teacherId)
    ) {
      return moveRequestsController.getTeacherRequests(req, res, next);
    }
    return res.status(403).json({
      success: false,
      error: "You can only view your own move requests",
    });
  }
);

// Approve a move request (admin/techsupport only)
router.post(
  "/:requestId/approve",
  authenticate,
  requireAdminOrTechSupport,
  param("requestId").isInt(),
  validate,
  moveRequestsController.approveRequest
);

// Deny a move request (admin/techsupport only)
router.post(
  "/:requestId/deny",
  authenticate,
  requireAdminOrTechSupport,
  [param("requestId").isInt(), body("reason").optional().isString()],
  validate,
  moveRequestsController.denyRequest
);

module.exports = router;
