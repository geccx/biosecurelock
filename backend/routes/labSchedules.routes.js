const express = require("express");
const router = express.Router();
const labSchedulesController = require("../controllers/labSchedules.controller");
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

// Create a new lab schedule
// Requires: create_schedule permission
router.post(
  "/",
  authenticate,
  hasPermission(PERMISSIONS.CREATE_SCHEDULE),
  [
    body("labName").isString().notEmpty(),
    body("teacherId").isInt(),
    body("startTime").isISO8601(),
    body("endTime").isISO8601(),
    body("subject").optional().isString(),
  ],
  validate,
  labSchedulesController.createSchedule
);

// Get all lab schedules
// Requires: view_all_schedules or view_own_schedules permission
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
// Requires: view_own_schedules permission
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
// Requires: approve_schedule_move permission
router.post(
  "/:scheduleId/approve",
  authenticate,
  hasPermission(PERMISSIONS.APPROVE_SCHEDULE_MOVE),
  [param("scheduleId").isInt()],
  validate,
  labSchedulesController.approveSchedule
);

// Disapprove/reject a pending schedule
// Requires: approve_schedule_move permission
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
// Requires: edit_schedule permission
router.put(
  "/:scheduleId",
  authenticate,
  hasPermission(PERMISSIONS.EDIT_SCHEDULE),
  [
    param("scheduleId").isInt(),
    body("labName").optional().isString(),
    body("teacherId").optional().isInt(),
    body("startTime").optional().isISO8601(),
    body("endTime").optional().isISO8601(),
    body("subject").optional().isString(),
    body("status")
      .optional()
      .isIn(["pending", "scheduled", "completed", "cancelled"]),
  ],
  validate,
  labSchedulesController.updateSchedule
);

// Delete a schedule
// Requires: delete_schedule permission
router.delete(
  "/:scheduleId",
  authenticate,
  hasPermission(PERMISSIONS.DELETE_SCHEDULE),
  param("scheduleId").isInt(),
  validate,
  labSchedulesController.deleteSchedule
);

module.exports = router;