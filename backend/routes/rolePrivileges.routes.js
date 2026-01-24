const express = require("express");
const router = express.Router();
const rolePrivilegesController = require("../controllers/rolePrivileges.controller");
const { authenticate, requireAdmin } = require("../middleware/auth.middleware");
const { param, body, validationResult } = require("express-validator");

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

// Get all available permissions (admin only)
router.get(
  "/permissions",
  authenticate,
  requireAdmin,
  rolePrivilegesController.getAvailablePermissions
);

// Get all role privileges for Teacher and TechSupport (admin only)
router.get(
  "/",
  authenticate,
  requireAdmin,
  rolePrivilegesController.getAllRolePrivileges
);

// Get role privileges for a specific role (admin only)
router.get(
  "/:role",
  authenticate,
  requireAdmin,
  [
    param("role")
      .isIn(["teacher", "techsupport"])
      .withMessage("Role must be teacher or techsupport"),
  ],
  validate,
  rolePrivilegesController.getRolePrivileges
);

// Update role privileges (admin only)
router.put(
  "/:role",
  authenticate,
  requireAdmin,
  [
    param("role")
      .isIn(["teacher", "techsupport"])
      .withMessage("Role must be teacher or techsupport"),
    body("permissions")
      .isArray()
      .withMessage("Permissions must be an array")
      .custom((permissions) => {
        if (permissions.length === 0) {
          throw new Error("Permissions array cannot be empty");
        }
        return true;
      }),
    body("permissions.*")
      .isString()
      .withMessage("Each permission must be a string"),
  ],
  validate,
  rolePrivilegesController.updateRolePrivileges
);

module.exports = router;
