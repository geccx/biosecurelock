const express = require("express");
const router = express.Router();
const passwordRequestsController = require("../controllers/passwordRequests.controller");
const {
  authenticate,
  requireAdminOrTechSupport,
} = require("../middleware/auth.middleware");
const { query, param, body, validationResult } = require("express-validator");

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: errors.array(),
    });
  }
  next();
};

// Get all password requests (admin and techsupport only)
router.get(
  "/",
  authenticate,
  requireAdminOrTechSupport,
  [
    query("status")
      .optional()
      .isIn(["pending", "approved", "rejected", "completed"]),
  ],
  validate,
  passwordRequestsController.getPasswordRequests
);

// Approve a password request
router.post(
  "/:requestId/approve",
  authenticate,
  requireAdminOrTechSupport,
  [param("requestId").isInt()],
  validate,
  passwordRequestsController.approvePasswordRequest
);

// Reject a password request
router.post(
  "/:requestId/reject",
  authenticate,
  requireAdminOrTechSupport,
  [param("requestId").isInt(), body("reason").optional().isString()],
  validate,
  passwordRequestsController.rejectPasswordRequest
);

module.exports = router;
