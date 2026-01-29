const express = require("express");
const router = express.Router();
const semesterController = require("../controllers/semester.controller");
const { authenticate, requireAdmin } = require("../middleware/auth.middleware");
const { body, param, query, validationResult } = require("express-validator");

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

// All routes require admin
router.use(authenticate, requireAdmin);

// ========== SEMESTER MANAGEMENT ==========

// Create semester
router.post(
  "/semesters",
  [
    body("name").isString().trim().notEmpty().isLength({ max: 100 }),
    body("academicYear").isString().trim().notEmpty().isLength({ max: 20 }),
    body("startDate").isISO8601(),
    body("endDate").isISO8601(),
  ],
  validate,
  semesterController.createSemester,
);

// List semesters
router.get(
  "/semesters",
  [
    query("status")
      .optional()
      .isIn(["draft", "approved", "active", "completed"]),
    query("academicYear").optional().isString().trim(),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("offset").optional().isInt({ min: 0 }),
  ],
  validate,
  semesterController.listSemesters,
);

// Get semester by ID
router.get(
  "/semesters/:id",
  [param("id").isInt({ min: 1 })],
  validate,
  semesterController.getSemester,
);

// Update semester
router.put(
  "/semesters/:id",
  [
    param("id").isInt({ min: 1 }),
    body("name").optional().isString().trim().notEmpty().isLength({ max: 100 }),
    body("academicYear")
      .optional()
      .isString()
      .trim()
      .notEmpty()
      .isLength({ max: 20 }),
    body("startDate").optional().isISO8601(),
    body("endDate").optional().isISO8601(),
  ],
  validate,
  semesterController.updateSemester,
);

// Delete semester
router.delete(
  "/semesters/:id",
  [param("id").isInt({ min: 1 })],
  validate,
  semesterController.deleteSemester,
);

// Approve semester
router.put(
  "/semesters/:id/approve",
  [param("id").isInt({ min: 1 })],
  validate,
  semesterController.approveSemester,
);

module.exports = router;
