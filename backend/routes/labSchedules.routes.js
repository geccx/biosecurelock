const express = require("express");
const router = express.Router();
const labSchedulesController = require("../controllers/labSchedules.controller");
const {
  authenticate,
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

// Create a new lab schedule with recurring support
router.post(
  "/",
  authenticate,
  hasPermission(PERMISSIONS.CREATE_SCHEDULE),
  [
    body("labName").isString().notEmpty(),
    body("teacherId").isInt(),
    body("subject").optional().isString(),
    body("recurrenceType").isIn(["one-time", "weekly"]),
    // For weekly: startTime and endTime are just time strings (HH:MM)
    // For one-time: they are ISO8601 datetime strings
    body("startTime").notEmpty(),
    body("endTime").notEmpty(),
    body("daysOfWeek").optional().isArray(),
    body("daysOfWeek.*").optional().isIn([
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
    ]),
    body("recurrenceEndDate").optional().isISO8601(),
  ],
  validate,
  labSchedulesController.createSchedule
);

// Get all lab schedules
router.get(
  "/",
  authenticate,
  hasAnyPermission(PERMISSIONS.VIEW_ALL_SCHEDULES, PERMISSIONS.VIEW_OWN_SCHEDULES),
  [
    query("status")
      .optional()
      .isIn(["pending", "scheduled", "completed", "cancelled"]),
    query("teacherId").optional().isInt(),
    query("labName").optional().isString(),
    query("startDate").optional().isISO8601(),
    query("endDate").optional().isISO8601(),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("offset").optional().isInt({ min: 0 }),
  ],
  validate,
  labSchedulesController.getAllSchedules
);

// Get schedules for current user (teacher)
router.get(
  "/my-schedules",
  authenticate,
  hasPermission(PERMISSIONS.VIEW_OWN_SCHEDULES),
  labSchedulesController.getTeacherSchedules
);

// Get schedules for a specific teacher
router.get(
  "/teacher/:teacherId",
  authenticate,
  param("teacherId").isInt(),
  validate,
  labSchedulesController.getTeacherSchedules
);

// Approve a pending schedule
router.post(
  "/:scheduleId/approve",
  authenticate,
  hasPermission(PERMISSIONS.APPROVE_SCHEDULE_MOVE),
  [param("scheduleId").isInt()],
  validate,
  labSchedulesController.approveSchedule
);

// Disapprove/reject a pending schedule
router.post(
  "/:scheduleId/disapprove",
  authenticate,
  hasPermission(PERMISSIONS.APPROVE_SCHEDULE_MOVE),
  [param("scheduleId").isInt(), body("reason").optional().isString()],
  validate,
  labSchedulesController.disapproveSchedule
);

// Get a single schedule by ID
router.get(
  "/:scheduleId",
  authenticate,
  param("scheduleId").isInt(),
  validate,
  labSchedulesController.getScheduleById
);

// Update a schedule
router.put(
  "/:scheduleId",
  authenticate,
  hasPermission(PERMISSIONS.EDIT_SCHEDULE),
  [
    param("scheduleId").isInt(),
    body("labName").optional().isString(),
    body("teacherId").optional().isInt(),
    body("startTime").optional(),
    body("endTime").optional(),
    body("subject").optional().isString(),
    body("recurrenceType").optional().isIn(["one-time", "weekly"]),
    body("daysOfWeek").optional().isArray(),
    body("daysOfWeek.*").optional().isIn([
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
    ]),
    body("recurrenceEndDate").optional().isISO8601(),
    body("status")
      .optional()
      .isIn(["pending", "scheduled", "completed", "cancelled"]),
  ],
  validate,
  labSchedulesController.updateSchedule
);

// Delete a schedule
router.delete(
  "/:scheduleId",
  authenticate,
  hasPermission(PERMISSIONS.DELETE_SCHEDULE),
  param("scheduleId").isInt(),
  validate,
  labSchedulesController.deleteSchedule
);

module.exports = router;