const db = require("../models/mysql.models");
const logger = require("../utils/logger");
const {
  PERMISSIONS,
  clearPermissionsCache,
} = require("../middleware/auth.middleware");

/**
 * Get all available permissions
 */
exports.getAvailablePermissions = async (req, res) => {
  try {
    // Return all permission constants grouped by category
    const permissions = {
      userManagement: [
        PERMISSIONS.CREATE_ADMIN,
        PERMISSIONS.CREATE_USER,
        PERMISSIONS.EDIT_USER,
        PERMISSIONS.DELETE_USER,
        PERMISSIONS.DEACTIVATE_USER,
        PERMISSIONS.ENROLL_USER,
      ],
      scheduleManagement: [
        PERMISSIONS.CREATE_SCHEDULE,
        PERMISSIONS.EDIT_SCHEDULE,
        PERMISSIONS.DELETE_SCHEDULE,
        PERMISSIONS.REQUEST_SCHEDULE_MOVE,
        PERMISSIONS.APPROVE_SCHEDULE_MOVE,
        PERMISSIONS.VIEW_ALL_SCHEDULES,
        PERMISSIONS.VIEW_OWN_SCHEDULES,
      ],
      accessControl: [
        PERMISSIONS.UNLOCK_LAB,
        PERMISSIONS.LOCK_LAB,
        PERMISSIONS.EMERGENCY_OVERRIDE,
      ],
      monitoring: [
        PERMISSIONS.VIEW_ALL_LOGS,
        PERMISSIONS.VIEW_OWN_LOGS,
        PERMISSIONS.GENERATE_REPORTS,
      ],
      systemConfiguration: [
        PERMISSIONS.MODIFY_SYSTEM_CONFIG,
        PERMISSIONS.MODIFY_SECURITY_POLICIES,
        PERMISSIONS.MODIFY_BLOCKCHAIN_SETTINGS,
      ],
      deviceManagement: [
        PERMISSIONS.VIEW_DEVICES,
        PERMISSIONS.MANAGE_DEVICES,
        PERMISSIONS.TROUBLESHOOT,
      ],
    };

    res.json({
      success: true,
      data: permissions,
    });
  } catch (error) {
    logger.error("Error fetching available permissions:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch available permissions",
    });
  }
};

/**
 * Get role privileges for a specific role
 */
exports.getRolePrivileges = async (req, res) => {
  try {
    const { role } = req.params;

    if (!["teacher", "techsupport"].includes(role)) {
      return res.status(400).json({
        success: false,
        error: "Only teacher and techsupport roles can be managed",
      });
    }

    const [privileges] = await db.query(
      "SELECT role, permissions FROM role_privileges WHERE role = ?",
      [role]
    );

    if (privileges.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Role privileges not found",
      });
    }

    const rolePrivileges = privileges[0];
    let permissions = [];

    // Parse JSON if it's a string, otherwise use as is
    if (typeof rolePrivileges.permissions === "string") {
      permissions = JSON.parse(rolePrivileges.permissions);
    } else {
      permissions = rolePrivileges.permissions;
    }

    res.json({
      success: true,
      data: {
        role: rolePrivileges.role,
        permissions: permissions,
      },
    });
  } catch (error) {
    logger.error("Error fetching role privileges:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch role privileges",
    });
  }
};

/**
 * Get all role privileges (for Teacher and TechSupport)
 */
exports.getAllRolePrivileges = async (req, res) => {
  try {
    const [privileges] = await db.query(
      "SELECT role, permissions FROM role_privileges WHERE role IN ('teacher', 'techsupport') ORDER BY role"
    );

    const result = privileges.map((row) => {
      let permissions = [];
      if (typeof row.permissions === "string") {
        permissions = JSON.parse(row.permissions);
      } else {
        permissions = row.permissions;
      }
      return {
        role: row.role,
        permissions: permissions,
      };
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("Error fetching all role privileges:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch role privileges",
    });
  }
};

/**
 * Update role privileges
 */
exports.updateRolePrivileges = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { role } = req.params;
    const { permissions } = req.body;

    if (!["teacher", "techsupport"].includes(role)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: "Only teacher and techsupport roles can be managed",
      });
    }

    if (!Array.isArray(permissions)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: "Permissions must be an array",
      });
    }

    // Validate that all permissions are valid
    const allPermissions = Object.values(PERMISSIONS);
    const invalidPermissions = permissions.filter(
      (p) => !allPermissions.includes(p)
    );

    if (invalidPermissions.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: `Invalid permissions: ${invalidPermissions.join(", ")}`,
      });
    }

    // Update role privileges
    await connection.query(
      "UPDATE role_privileges SET permissions = ?, updated_at = NOW() WHERE role = ?",
      [JSON.stringify(permissions), role]
    );

    // Log the action
    await connection.query(
      `INSERT INTO system_logs (event_type, user_id, details, timestamp)
       VALUES ('role_privileges_updated', ?, ?, NOW())`,
      [
        req.user.id,
        JSON.stringify({
          role,
          permissions,
          updatedBy: req.user.role,
        }),
      ]
    );

    await connection.commit();

    // Clear permissions cache to force refresh
    clearPermissionsCache();

    logger.info("Role privileges updated", {
      role,
      permissionsCount: permissions.length,
      updatedBy: req.user.id,
    });

    res.json({
      success: true,
      data: {
        role,
        permissions,
      },
      message: "Role privileges updated successfully",
    });
  } catch (error) {
    await connection.rollback();
    logger.error("Error updating role privileges:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update role privileges",
      details: error.message,
    });
  } finally {
    connection.release();
  }
};
