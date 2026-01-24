const express = require("express");
const router = express.Router();
const laboratoriesController = require("../controllers/laboratories.controller");
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

/**
 * Laboratory Routes with Role-Based Access:
 * 
 * Admin: Full control (create, update, delete, lock/unlock)
 * Tech Support: Can lock/unlock, view, but NOT create/delete
 * Teacher: Can only view laboratories
 */

// Get all laboratories (all authenticated users)
router.get("/", authenticate, laboratoriesController.getAllLaboratories);

// Get a single laboratory (all authenticated users)
router.get(
  "/:labId",
  authenticate,
  param("labId").isInt(),
  validate,
  laboratoriesController.getLaboratoryById
);

// Create a new laboratory (admin only)
router.post(
  "/",
  authenticate,
  requireAdmin,
  [
    body("name").isString().trim().isLength({ min: 2, max: 100 }).withMessage("Name must be between 2 and 100 characters"),
    body("location").isString().trim().isLength({ min: 2, max: 255 }).withMessage("Location must be between 2 and 255 characters"),
    body("capacity").optional().isInt({ min: 1, max: 1000 }).withMessage("Capacity must be between 1 and 1000"),
    body("deviceId").optional().isString().trim(),
  ],
  validate,
  laboratoriesController.createLaboratory
);

// Update a laboratory (admin only)
router.put(
  "/:labId",
  authenticate,
  requireAdmin,
  [
    param("labId").isInt().withMessage("Laboratory ID must be an integer"),
    body("name").optional().isString().trim().isLength({ min: 2, max: 100 }).withMessage("Name must be between 2 and 100 characters"),
    body("location").optional().isString().trim().isLength({ min: 2, max: 255 }).withMessage("Location must be between 2 and 255 characters"),
    body("capacity").optional().isInt({ min: 1, max: 1000 }).withMessage("Capacity must be between 1 and 1000"),
    body("deviceId").optional().isString().trim(),
  ],
  validate,
  laboratoriesController.updateLaboratory
);

// Toggle lock status (admin and tech support)
router.post(
  "/:labId/toggle-lock",
  authenticate,
  requireAdminOrTechSupport,
  param("labId").isInt(),
  validate,
  laboratoriesController.toggleLock
);

// Lock all laboratories (admin and tech support - emergency)
router.post(
  "/lock-all",
  authenticate,
  requireAdminOrTechSupport,
  laboratoriesController.lockAll
);

// Unlock all laboratories (admin and tech support - emergency)
router.post(
  "/unlock-all",
  authenticate,
  requireAdminOrTechSupport,
  laboratoriesController.unlockAll
);

// Delete a laboratory (admin only)
router.delete(
  "/:labId",
  authenticate,
  requireAdmin,
  param("labId").isInt(),
  validate,
  laboratoriesController.deleteLaboratory
);

module.exports = router;
