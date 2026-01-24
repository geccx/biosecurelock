const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const { body, param, query } = require("express-validator");
const notificationPreferencesController = require("../controllers/notificationPreferences.controller");

// Validation middleware
const validate = (req, res, next) => {
  const { validationResult } = require("express-validator");
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }
  next();
};

// Get current user's notification preferences
router.get("/preferences", authenticate, notificationPreferencesController.getMyPreferences);

// Update current user's notification preferences
router.put(
  "/preferences",
  authenticate,
  [
    body("schedule_approved").optional().isBoolean(),
    body("schedule_disapproved").optional().isBoolean(),
    body("new_user_added").optional().isBoolean(),
    body("device_error").optional().isBoolean(),
    body("enrollment_approved").optional().isBoolean(),
    body("enrollment_rejected").optional().isBoolean(),
    body("move_request_approved").optional().isBoolean(),
    body("move_request_denied").optional().isBoolean(),
  ],
  validate,
  notificationPreferencesController.updateMyPreferences
);

// Get current user's notifications
router.get(
  "/notifications",
  authenticate,
  [
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("offset").optional().isInt({ min: 0 }),
    query("unread_only").optional().isBoolean(),
  ],
  validate,
  notificationPreferencesController.getMyNotifications
);

// Mark notification as read
router.post(
  "/notifications/:notificationId/read",
  authenticate,
  [param("notificationId").isInt()],
  validate,
  notificationPreferencesController.markAsRead
);

// Mark all notifications as read
router.post(
  "/notifications/read-all",
  authenticate,
  notificationPreferencesController.markAllAsRead
);

// Get all notifications (admin and techsupport only)
router.get(
  "/notifications/all",
  authenticate,
  [
    query("limit").optional().isInt({ min: 1, max: 500 }),
    query("offset").optional().isInt({ min: 0 }),
    query("unread_only").optional().isBoolean(),
    query("user_id").optional().isInt(),
  ],
  validate,
  notificationPreferencesController.getAllNotifications
);

// Delete notification (admin only)
router.delete(
  "/notifications/:notificationId",
  authenticate,
  [param("notificationId").isInt()],
  validate,
  notificationPreferencesController.deleteNotification
);

// Delete all notifications (admin only)
router.delete(
  "/notifications",
  authenticate,
  [query("user_id").optional().isInt()],
  validate,
  notificationPreferencesController.deleteAllNotifications
);

// Mark notification as read (admin can mark any, others only their own)
router.post(
  "/notifications/:notificationId/read-admin",
  authenticate,
  [param("notificationId").isInt()],
  validate,
  notificationPreferencesController.markNotificationAsRead
);

module.exports = router;

