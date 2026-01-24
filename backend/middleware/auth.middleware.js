const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const db = require("../models/mysql.models");

// Cache for role permissions (refreshed on update)
let rolePermissionsCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get role permissions from database with caching
 */
async function getRolePermissionsFromDB() {
  try {
    // Check cache first
    if (rolePermissionsCache && cacheTimestamp) {
      const now = Date.now();
      if (now - cacheTimestamp < CACHE_TTL) {
        return rolePermissionsCache;
      }
    }

    // Load from database
    const [privileges] = await db.query(
      "SELECT role, permissions FROM role_privileges"
    );

    const permissionsMap = {};
    privileges.forEach((row) => {
      let permissions = [];
      if (typeof row.permissions === "string") {
        permissions = JSON.parse(row.permissions);
      } else {
        permissions = row.permissions;
      }
      permissionsMap[row.role] = permissions;
    });

    // Update cache
    rolePermissionsCache = permissionsMap;
    cacheTimestamp = Date.now();

    return permissionsMap;
  } catch (error) {
    logger.warn(
      "Failed to load role permissions from DB, using defaults:",
      error.message
    );
    // Return hardcoded permissions as fallback
    return ROLE_PERMISSIONS;
  }
}

/**
 * Clear the permissions cache (call after updating privileges)
 */
function clearPermissionsCache() {
  rolePermissionsCache = null;
  cacheTimestamp = null;
}

/**
 * Role-based permissions based on documentation:
 *
 * ADMIN: Full control over everything
 * TECHSUPPORT: Admin-like but cannot:
 *   - Create/modify admin accounts
 *   - Change high-level system configurations
 *   - Modify blockchain settings
 * TEACHER: Can access lab, request schedule changes, view personal logs
 */

// Permission constants
const PERMISSIONS = {
  // User Management
  CREATE_ADMIN: "create_admin",
  CREATE_USER: "create_user",
  EDIT_USER: "edit_user",
  DELETE_USER: "delete_user",
  DEACTIVATE_USER: "deactivate_user",
  ENROLL_USER: "enroll_user",

  // Schedule Management
  CREATE_SCHEDULE: "create_schedule",
  EDIT_SCHEDULE: "edit_schedule",
  DELETE_SCHEDULE: "delete_schedule",
  REQUEST_SCHEDULE_MOVE: "request_schedule_move",
  APPROVE_SCHEDULE_MOVE: "approve_schedule_move",
  VIEW_ALL_SCHEDULES: "view_all_schedules",
  VIEW_OWN_SCHEDULES: "view_own_schedules",

  // Access Control
  UNLOCK_LAB: "unlock_lab",
  LOCK_LAB: "lock_lab",
  EMERGENCY_OVERRIDE: "emergency_override",

  // Monitoring & Logs
  VIEW_ALL_LOGS: "view_all_logs",
  VIEW_OWN_LOGS: "view_own_logs",
  GENERATE_REPORTS: "generate_reports",

  // System Configuration
  MODIFY_SYSTEM_CONFIG: "modify_system_config",
  MODIFY_SECURITY_POLICIES: "modify_security_policies",
  MODIFY_BLOCKCHAIN_SETTINGS: "modify_blockchain_settings",

  // Device Management
  VIEW_DEVICES: "view_devices",
  MANAGE_DEVICES: "manage_devices",
  TROUBLESHOOT: "troubleshoot",
};

// Role-based permission mapping
const ROLE_PERMISSIONS = {
  admin: [
    // Full control - all permissions
    PERMISSIONS.CREATE_ADMIN,
    PERMISSIONS.CREATE_USER,
    PERMISSIONS.EDIT_USER,
    PERMISSIONS.DELETE_USER,
    PERMISSIONS.DEACTIVATE_USER,
    PERMISSIONS.ENROLL_USER,
    PERMISSIONS.CREATE_SCHEDULE,
    PERMISSIONS.EDIT_SCHEDULE,
    PERMISSIONS.DELETE_SCHEDULE,
    PERMISSIONS.REQUEST_SCHEDULE_MOVE,
    PERMISSIONS.APPROVE_SCHEDULE_MOVE,
    PERMISSIONS.VIEW_ALL_SCHEDULES,
    PERMISSIONS.VIEW_OWN_SCHEDULES,
    PERMISSIONS.UNLOCK_LAB,
    PERMISSIONS.LOCK_LAB,
    PERMISSIONS.EMERGENCY_OVERRIDE,
    PERMISSIONS.VIEW_ALL_LOGS,
    PERMISSIONS.VIEW_OWN_LOGS,
    PERMISSIONS.GENERATE_REPORTS,
    PERMISSIONS.MODIFY_SYSTEM_CONFIG,
    PERMISSIONS.MODIFY_SECURITY_POLICIES,
    PERMISSIONS.MODIFY_BLOCKCHAIN_SETTINGS,
    PERMISSIONS.VIEW_DEVICES,
    PERMISSIONS.MANAGE_DEVICES,
    PERMISSIONS.TROUBLESHOOT,
  ],

  techsupport: [
    // Similar to admin but with restrictions
    // CANNOT: CREATE_ADMIN, MODIFY_SYSTEM_CONFIG, MODIFY_BLOCKCHAIN_SETTINGS
    PERMISSIONS.CREATE_USER, // but not admin role
    PERMISSIONS.EDIT_USER, // but not admin users
    PERMISSIONS.DEACTIVATE_USER, // but not admin users
    PERMISSIONS.ENROLL_USER,
    // Schedule: approve but not create/modify
    PERMISSIONS.APPROVE_SCHEDULE_MOVE,
    PERMISSIONS.VIEW_ALL_SCHEDULES,
    PERMISSIONS.VIEW_OWN_SCHEDULES,
    PERMISSIONS.UNLOCK_LAB,
    PERMISSIONS.LOCK_LAB,
    PERMISSIONS.EMERGENCY_OVERRIDE,
    PERMISSIONS.VIEW_ALL_LOGS,
    PERMISSIONS.VIEW_OWN_LOGS,
    PERMISSIONS.VIEW_DEVICES,
    PERMISSIONS.TROUBLESHOOT,
  ],

  teacher: [
    // Limited permissions
    PERMISSIONS.REQUEST_SCHEDULE_MOVE,
    PERMISSIONS.VIEW_OWN_SCHEDULES,
    PERMISSIONS.VIEW_OWN_LOGS,
    // Access via fingerprint/RFID/PIN handled by access controller
  ],

  user: [PERMISSIONS.VIEW_OWN_LOGS],

  visitor: [
    // Minimal permissions
  ],
};

/**
 * Authenticate user from JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No authentication token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Load permissions from database (with caching)
    const dbPermissions = await getRolePermissionsFromDB();
    req.user.permissions =
      dbPermissions[decoded.role] || ROLE_PERMISSIONS[decoded.role] || [];

    next();
  } catch (error) {
    logger.error("Authentication error:", error);
    return res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
};

/**
 * Check if user has specific permission
 */
const hasPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: ${permission} required`,
      });
    }
    next();
  };
};

/**
 * Check if user has ANY of the specified permissions
 */
const hasAnyPermission = (...permissions) => {
  return (req, res, next) => {
    const hasAny = permissions.some((p) => req.user.permissions.includes(p));
    if (!hasAny) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: one of [${permissions.join(", ")}] required`,
      });
    }
    next();
  };
};

/**
 * Check if user has ALL of the specified permissions
 */
const hasAllPermissions = (...permissions) => {
  return (req, res, next) => {
    const hasAll = permissions.every((p) => req.user.permissions.includes(p));
    if (!hasAll) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: all of [${permissions.join(", ")}] required`,
      });
    }
    next();
  };
};

/**
 * Require admin role
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      error: "Admin access required",
    });
  }
  next();
};

/**
 * Require admin or tech support role
 */
const requireAdminOrTechSupport = (req, res, next) => {
  if (req.user.role !== "admin" && req.user.role !== "techsupport") {
    return res.status(403).json({
      success: false,
      error: "Admin or Tech Support access required",
    });
  }
  next();
};

/**
 * Require staff role (admin, techsupport, or teacher)
 */
const requireStaff = (req, res, next) => {
  const staffRoles = ["admin", "techsupport", "teacher"];
  if (!staffRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: "Staff access required",
    });
  }
  next();
};

/**
 * Check if tech support is trying to modify admin (prevent)
 */
const preventTechSupportModifyAdmin = async (req, res, next) => {
  if (req.user.role === "techsupport") {
    const { userId } = req.params;
    const { role } = req.body;

    // If trying to set role to admin, deny
    if (role === "admin") {
      return res.status(403).json({
        success: false,
        error: "Tech Support cannot create or modify admin accounts",
      });
    }

    // If modifying an existing admin, deny
    if (userId) {
      const db = require("../models/mysql.models");
      const [users] = await db.query("SELECT role FROM users WHERE id = ?", [
        userId,
      ]);
      if (users.length > 0 && users[0].role === "admin") {
        return res.status(403).json({
          success: false,
          error: "Tech Support cannot modify admin accounts",
        });
      }
    }
  }
  next();
};

module.exports = {
  authenticate,
  requireAdmin,
  requireAdminOrTechSupport,
  requireStaff,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  preventTechSupportModifyAdmin,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  clearPermissionsCache,
};
