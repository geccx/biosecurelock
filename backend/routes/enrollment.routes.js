const express = require("express");
const router = express.Router();
const enrollmentController = require("../controllers/enrollment.controller");
const {
  authenticate,
  requireAdmin,
  requireAdminOrTechSupport,
  hasPermission,
  PERMISSIONS,
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

/**
 * Enrollment Routes with Role-Based Access:
 * 
 * Admin: Full control (create, approve, reject, sync, delete)
 * Tech Support: Can enroll, approve, reset (assist users)
 * Teacher: Can request own enrollment
 */

// Request enrollment
// Requires: enroll_user permission
router.post(
  "/",
  authenticate,
  hasPermission(PERMISSIONS.ENROLL_USER),
  [
    body("userId").isInt(),
    body("enrollmentType").isIn(["fingerprint", "rfid", "pin"]),
    body("enrollmentData").isObject(),
  ],
  validate,
  enrollmentController.requestEnrollment
);

// Get all enrollments (admin/tech support)
router.get(
  "/",
  authenticate,
  requireAdminOrTechSupport,
  enrollmentController.getAllEnrollments
);

// Get pending enrollments (admin/tech support)
router.get(
  "/pending",
  authenticate,
  requireAdminOrTechSupport,
  enrollmentController.getPendingEnrollments
);

// Get user's enrollments
// Admin/TechSupport: Any user
// Teacher: Own enrollments only
router.get(
  "/user/:userId",
  authenticate,
  param("userId").isInt(),
  validate,
  async (req, res, next) => {
    const { userId } = req.params;
    // Teachers can only view their own enrollments
    if (
      req.user.role === "teacher" &&
      req.user.id !== parseInt(userId)
    ) {
      return res.status(403).json({
        success: false,
        error: "You can only view your own enrollments",
      });
    }
    enrollmentController.getUserEnrollments(req, res, next);
  }
);

// Approve enrollment (admin/tech support)
router.post(
  "/:enrollmentId/approve",
  authenticate,
  requireAdminOrTechSupport,
  param("enrollmentId").isInt(),
  validate,
  enrollmentController.approveEnrollment
);

// Reject enrollment (admin/tech support)
router.post(
  "/:enrollmentId/reject",
  authenticate,
  requireAdminOrTechSupport,
  [param("enrollmentId").isInt(), body("reason").optional().isString()],
  validate,
  enrollmentController.rejectEnrollment
);

// Sync physical enrollment with Tuya device (admin/tech support)
router.post(
  "/:enrollmentId/sync",
  authenticate,
  requireAdminOrTechSupport,
  [param("enrollmentId").isInt(), body("tuyaUnlockId").isString()],
  validate,
  enrollmentController.syncPhysicalEnrollment
);

// Reset enrollment (e.g., reset PIN or RFID) - tech support can do this
router.post(
  "/:enrollmentId/reset",
  authenticate,
  requireAdminOrTechSupport,
  [param("enrollmentId").isInt(), body("newData").optional().isObject()],
  validate,
  enrollmentController.resetEnrollment
);

// Delete enrollment (admin only)
router.delete(
  "/:enrollmentId",
  authenticate,
  requireAdmin,
  param("enrollmentId").isInt(),
  validate,
  enrollmentController.deleteEnrollment
);

module.exports = router;
