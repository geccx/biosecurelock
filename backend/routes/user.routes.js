const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../models/mysql.models");
const fabricService = require("../services/fabric.service");
const tuyaService = require("../services/tuya.service");
const {
  authenticate,
  requireAdmin,
  requireAdminOrTechSupport,
  requireStaff,
  hasPermission,
  hasAnyPermission,
  preventTechSupportModifyAdmin,
  PERMISSIONS,
} = require("../middleware/auth.middleware");
const { body, param, query, validationResult } = require("express-validator");
const logger = require("../utils/logger");

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

// Get current user
router.get("/me", authenticate, async (req, res) => {
  try {
    const [users] = await db.query(
      "SELECT id, username, email, role, status, department, created_at FROM users WHERE id = ?",
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const user = users[0];

    // Get enrollments
    const [enrollments] = await db.query(
      "SELECT enrollment_type, status FROM enrollments WHERE user_id = ? AND status = 'approved'",
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status || "active",
        department: user.department,
        created_at: user.created_at,
        enrollments: enrollments.map((e) => e.enrollment_type),
      },
    });
  } catch (error) {
    logger.error("Error fetching current user:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user",
    });
  }
});

// Get all users (requires user management permissions)
router.get(
  "/",
  authenticate,
  hasAnyPermission(
    PERMISSIONS.CREATE_USER,
    PERMISSIONS.EDIT_USER,
    PERMISSIONS.DELETE_USER,
    PERMISSIONS.DEACTIVATE_USER
  ),
  [
    query("role")
      .optional()
      .isIn(["admin", "teacher", "techsupport", "user", "visitor"]),
    query("status").optional().isIn(["active", "inactive", "pending"]),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("offset").optional().isInt({ min: 0 }),
  ],
  validate,
  async (req, res) => {
    try {
      const { role, status, limit, offset } = req.query;

      let query = `
        SELECT u.id, u.username, u.email, u.role, u.status, u.department, u.created_at,
          (SELECT GROUP_CONCAT(e.enrollment_type) FROM enrollments e WHERE e.user_id = u.id AND e.status = 'approved') as enrollments
        FROM users u
        WHERE 1=1
      `;
      const params = [];

      if (role) {
        query += " AND u.role = ?";
        params.push(role);
      }

      if (status) {
        query += " AND u.status = ?";
        params.push(status);
      }

      query += " ORDER BY u.created_at DESC";

      if (limit) {
        query += " LIMIT ?";
        params.push(parseInt(limit));
        if (offset) {
          query += " OFFSET ?";
          params.push(parseInt(offset));
        }
      }

      const [users] = await db.query(query, params);

      res.json({
        success: true,
        data: users.map((user) => ({
          id: user.id.toString(),
          name: user.username,
          email: user.email,
          role: user.role,
          status: user.status || "active",
          department: user.department,
          createdAt: user.created_at,
          fingerprint: user.enrollments?.includes("fingerprint")
            ? "enrolled"
            : null,
          rfid: user.enrollments?.includes("rfid") ? "enrolled" : null,
          pin: user.enrollments?.includes("pin") ? "enrolled" : null,
        })),
      });
    } catch (error) {
      logger.error("Error fetching users:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch users",
      });
    }
  }
);

// Get user by ID (requires user management permissions)
router.get(
  "/:userId",
  authenticate,
  hasAnyPermission(
    PERMISSIONS.CREATE_USER,
    PERMISSIONS.EDIT_USER,
    PERMISSIONS.DELETE_USER,
    PERMISSIONS.DEACTIVATE_USER
  ),
  param("userId").isInt(),
  validate,
  async (req, res) => {
    try {
      const { userId } = req.params;

      const [users] = await db.query(
        "SELECT id, username, email, role, status, department, created_at FROM users WHERE id = ?",
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      const user = users[0];

      // Get enrollments
      const [enrollments] = await db.query(
        "SELECT enrollment_type, status FROM enrollments WHERE user_id = ?",
        [userId]
      );

      res.json({
        success: true,
        data: {
          id: user.id.toString(),
          name: user.username,
          email: user.email,
          role: user.role,
          status: user.status || "active",
          department: user.department,
          createdAt: user.created_at,
          enrollments: enrollments,
        },
      });
    } catch (error) {
      logger.error("Error fetching user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch user",
      });
    }
  }
);

// Create a new user
// Flow: 1) Add device user in Tuya, 2) If successful, create login credentials in system
// Requires: create_user permission (or create_admin for admin role)
router.post(
  "/",
  authenticate,
  async (req, res, next) => {
    // Check if creating admin role - requires create_admin permission
    if (req.body.role === "admin") {
      if (!req.user.permissions.includes(PERMISSIONS.CREATE_ADMIN)) {
        return res.status(403).json({
          success: false,
          error:
            "Permission denied: create_admin required to create admin users",
        });
      }
    } else {
      // For other roles, check create_user permission
      if (!req.user.permissions.includes(PERMISSIONS.CREATE_USER)) {
        return res.status(403).json({
          success: false,
          error: "Permission denied: create_user required",
        });
      }
    }
    // Tech support cannot create admin users
    if (req.user.role === "techsupport" && req.body.role === "admin") {
      return res.status(403).json({
        success: false,
        error: "Tech Support cannot create admin accounts",
      });
    }
    next();
  },
  preventTechSupportModifyAdmin,
  [
    body("name").isString().isLength({ min: 2, max: 100 }),
    body("email").isEmail(),
    body("password").isString().isLength({ min: 6 }),
    body("role")
      .isIn(["admin", "teacher", "techsupport"])
      .withMessage("Role must be admin, teacher, or techsupport"),
    body("tuya_user_id").optional().isString(),
    body("department").optional().isString(),
    body("sex").optional().isInt({ min: 1, max: 2 }),
    body("birthday").optional().isInt({ min: 0 }),
    body("height").optional().isInt({ min: 0 }),
    body("weight").optional().isInt({ min: 0 }),
    body("back_home_notify_attr").optional().isInt({ min: 0, max: 1 }),
  ],
  validate,
  async (req, res) => {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const {
        name,
        email,
        password,
        role,
        department,
        tuya_user_id,
        sex,
        birthday,
        height,
        weight,
        back_home_notify_attr,
      } = req.body;

      // Check if user already exists in database
      const [existing] = await connection.query(
        "SELECT id FROM users WHERE email = ?",
        [email]
      );

      if (existing.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: "User with this email already exists",
        });
      }

      // Step 1: Register user in Tuya platform to get uid (if not provided)
      let tuyaUserId = tuya_user_id;
      if (!tuyaUserId) {
        try {
          // Generate a secure password for Tuya platform
          const crypto = require("crypto");
          const tuyaPassword = crypto.randomBytes(16).toString("hex");
          const countryCode = process.env.TUYA_COUNTRY_CODE || "1"; // Default to US

          const tuyaPlatformUser = await tuyaService.registerUser({
            username: email,
            password: tuyaPassword,
            country_code: countryCode,
            user_nick_name: name,
          });

          if (tuyaPlatformUser && tuyaPlatformUser.user_id) {
            tuyaUserId = tuyaPlatformUser.user_id;
            logger.info("User registered in Tuya platform", {
              email,
              tuyaUserId,
            });
          } else {
            throw new Error(
              "Failed to get user_id from Tuya platform registration"
            );
          }
        } catch (tuyaRegError) {
          await connection.rollback();
          logger.error(
            "Failed to register user in Tuya platform:",
            tuyaRegError.message
          );
          return res.status(500).json({
            success: false,
            error: "Failed to register user in Tuya platform",
            details: tuyaRegError.message,
          });
        }
      }

      // Step 2: Add device user in Tuya
      // Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-member?id=Kbe2o84on6zgh#title-6-Add%20a%20device%20user
      const deviceId = process.env.TUYA_DEVICE_ID;
      if (!deviceId) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: "TUYA_DEVICE_ID not set in environment",
        });
      }

      // Check device online/offline status before creating user
      let deviceStatus = "offline";
      try {
        const deviceInfo = await tuyaService.getDeviceInfoById(deviceId);
        if (deviceInfo && deviceInfo.result) {
          deviceStatus =
            deviceInfo.result.online === true ? "online" : "offline";
        } else if (deviceInfo && deviceInfo.online !== undefined) {
          deviceStatus = deviceInfo.online === true ? "online" : "offline";
        }
      } catch (statusError) {
        logger.warn(
          "Failed to check device status, assuming offline:",
          statusError.message
        );
        deviceStatus = "offline";
      }

      // Map role to Tuya user_type: 10=admin, 20=common user, 50=home owner
      const tuyaUserType = tuyaService.mapRoleToUserType(role);

      // Enable arrival notifications automatically (back_home_notify_attr = 1)
      // This will notify admin and techsupport when user arrives
      const deviceUserData = {
        uid: tuyaUserId,
        nick_name: name,
        user_contact: email,
        user_type: tuyaUserType,
        sex: sex || 1, // Default to male
        back_home_notify_attr: 1, // Enable notifications automatically
      };

      // Optional fields
      if (birthday !== undefined) {
        deviceUserData.birthday = birthday;
      }
      if (height !== undefined) {
        deviceUserData.height = height;
      }
      if (weight !== undefined) {
        deviceUserData.weight = weight;
      }

      // Store API parameters for backup (before attempting device user creation)
      const apiParams = {
        name,
        email,
        password, // Store plain password for retry (will be hashed when creating user)
        role,
        department,
        tuya_user_id: tuyaUserId,
        sex: sex || 1,
        birthday,
        height,
        weight,
        back_home_notify_attr: back_home_notify_attr || 1,
        deviceUserData,
        deviceId,
      };

      let tuyaDeviceUser;
      let deviceUserCreationSuccess = false;
      let deviceUserError = null;

      // Only attempt to add device user if device is online
      if (deviceStatus === "online") {
        try {
          tuyaDeviceUser = await tuyaService.addDeviceUser(
            deviceId,
            deviceUserData
          );
          deviceUserCreationSuccess = true;
          logger.info("Device user added successfully in Tuya", {
            tuyaUserId: tuya_user_id,
            email,
            role,
          });
        } catch (tuyaError) {
          deviceUserError = tuyaError.message;
          logger.error("Failed to add device user in Tuya:", tuyaError.message);

          // If device was online but creation failed, still proceed with user creation
          // but mark sync as failed in backup
          deviceUserCreationSuccess = false;
        }
      } else {
        // Device is offline - skip device user creation but continue with user creation
        logger.warn(
          "Device is offline, skipping device user creation. Will retry when device comes online.",
          {
            deviceId,
            email,
          }
        );
        deviceUserCreationSuccess = false;
        deviceUserError = "Device is offline";
      }

      // Step 2: If device user creation successful, create login credentials in system
      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Insert user in database
      const [result] = await connection.query(
        `INSERT INTO users (username, email, password_hash, role, status, department, tuya_user_id, created_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, NOW())`,
        [name, email, passwordHash, role, department || null, tuyaUserId]
      );

      const newUserId = result.insertId;

      // Register on Fabric blockchain
      let fabricIdentity = null;
      try {
        const fabricUser = await fabricService.registerUser(name, role);
        if (fabricUser && fabricUser.fabricIdentity) {
          fabricIdentity = fabricUser.fabricIdentity;
          await connection.query(
            "UPDATE users SET fabric_identity = ? WHERE id = ?",
            [fabricIdentity, newUserId]
          );
        }
      } catch (fabricError) {
        logger.warn("Failed to register user on Fabric:", fabricError.message);
      }

      // Extract device user ID from Tuya response
      const tuyaDeviceUserId =
        tuyaDeviceUser?.user_id || tuyaDeviceUser?.lock_user_id || tuyaUserId;

      // Step 3: Create default PIN unlock method for the user
      // Generate a default 6-digit PIN (can be changed later)
      if (deviceUserCreationSuccess && tuyaDeviceUserId) {
        try {
          const defaultPIN = "123456"; // Default PIN - user can change this later
          const now = Math.floor(Date.now() / 1000);
          const tenYearsFromNow = now + 10 * 365 * 24 * 60 * 60; // 10 years

          const pinData = {
            name: `Default PIN - ${name}`,
            password: defaultPIN,
            password_type: "ticket",
            effective_time: now,
            invalid_time: tenYearsFromNow,
            type: 0, // Multiple uses
            deviceId: deviceId,
          };

          await tuyaService.createTempPassword(pinData);
          logger.info("Default PIN created for new user", {
            tuyaDeviceUserId,
            email,
          });
        } catch (pinError) {
          // Don't fail user creation if PIN creation fails
          logger.warn("Failed to create default PIN for user:", pinError.message);
        }
      }

      // Save API parameters to backup table for retry if device was offline
      const syncStatus = deviceUserCreationSuccess ? "synced" : "pending";
      await connection.query(
        `INSERT INTO user_creation_backup 
         (user_id, api_params, device_status, sync_status, error_message, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          newUserId,
          JSON.stringify(apiParams),
          deviceStatus,
          syncStatus,
          deviceUserError || null,
          req.user.id,
        ]
      );

      // Log the action
      await connection.query(
        `INSERT INTO system_logs (event_type, user_id, details, timestamp)
         VALUES ('user_created', ?, ?, NOW())`,
        [
          req.user.id,
          JSON.stringify({
            createdUserId: newUserId,
            role,
            createdBy: req.user.role,
            tuyaUserId: tuyaUserId,
            tuyaDeviceUserId: tuyaDeviceUserId,
            deviceStatus,
            syncStatus,
          }),
        ]
      );

      await connection.commit();

      // Notify admins and tech support about new user
      const notificationService = require("../services/notification.service");
      await notificationService.notifyAdminsAndTechSupport(
        notificationService.NOTIFICATION_TYPES.NEW_USER_ADDED,
        "New User Added",
        `A new ${role} user "${name}" (${email}) has been added to the system and Tuya device.`
      );

      logger.info("User created successfully", {
        userId: newUserId,
        email,
        role,
        tuyaUserId: tuyaUserId,
        createdBy: req.user.id,
      });

      const responseMessage = deviceUserCreationSuccess
        ? "User added to device and login credentials created successfully"
        : `User created successfully. ${
            deviceStatus === "offline"
              ? "Device is offline - user will be synced to device when it comes back online."
              : "Failed to add user to device - will retry automatically."
          }`;

      res.status(201).json({
        success: true,
        data: {
          id: newUserId.toString(),
          name,
          email,
          role,
          status: "active",
          department,
          tuyaUserId: tuyaUserId,
          tuyaDeviceUserId: tuyaDeviceUserId || null,
          deviceStatus,
          syncStatus,
          createdAt: new Date(),
        },
        message: responseMessage,
      });
    } catch (error) {
      await connection.rollback();
      logger.error("Error creating user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create user",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }
);

// Update user
// Requires: edit_user permission
router.put(
  "/:userId",
  authenticate,
  hasPermission(PERMISSIONS.EDIT_USER),
  preventTechSupportModifyAdmin,
  [
    param("userId").isInt(),
    body("name").optional().isString().isLength({ min: 2, max: 100 }),
    body("email").optional().isEmail(),
    body("role")
      .optional()
      .isIn(["admin", "teacher", "techsupport", "user", "visitor"]),
    body("status").optional().isIn(["active", "inactive", "pending"]),
    body("department").optional().isString(),
  ],
  validate,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { name, email, role, status, department } = req.body;

      const updates = [];
      const params = [];

      if (name) {
        updates.push("username = ?");
        params.push(name);
      }
      if (email) {
        updates.push("email = ?");
        params.push(email);
      }
      if (role) {
        updates.push("role = ?");
        params.push(role);
      }
      if (status) {
        updates.push("status = ?");
        params.push(status);
      }
      if (department !== undefined) {
        updates.push("department = ?");
        params.push(department);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No fields to update",
        });
      }

      updates.push("updated_at = NOW()");
      params.push(userId);

      await db.query(
        `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
        params
      );

      // Log the action
      await db.query(
        `INSERT INTO system_logs (event_type, user_id, details, timestamp)
         VALUES ('user_updated', ?, ?, NOW())`,
        [
          req.user.id,
          JSON.stringify({ updatedUserId: userId, updatedBy: req.user.role }),
        ]
      );

      logger.info("User updated", { userId, updatedBy: req.user.id });

      res.json({
        success: true,
        message: "User updated successfully",
      });
    } catch (error) {
      logger.error("Error updating user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update user",
      });
    }
  }
);

// Toggle user status (activate/deactivate)
// Requires: deactivate_user permission
router.post(
  "/:userId/toggle-status",
  authenticate,
  hasPermission(PERMISSIONS.DEACTIVATE_USER),
  preventTechSupportModifyAdmin,
  param("userId").isInt(),
  validate,
  async (req, res) => {
    try {
      const { userId } = req.params;

      // Get current status and role
      const [users] = await db.query(
        "SELECT status, role FROM users WHERE id = ?",
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      // Tech support cannot delete admins
      if (req.user.role === "techsupport" && user.role === "admin") {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          error: "Tech Support cannot delete admin accounts",
        });
      }

      const newStatus = users[0].status === "active" ? "inactive" : "active";

      await db.query(
        "UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?",
        [newStatus, userId]
      );

      // Log the action
      await db.query(
        `INSERT INTO system_logs (event_type, user_id, details, timestamp)
         VALUES ('user_status_changed', ?, ?, NOW())`,
        [
          req.user.id,
          JSON.stringify({
            targetUserId: userId,
            newStatus,
            changedBy: req.user.role,
          }),
        ]
      );

      logger.info("User status toggled", {
        userId,
        newStatus,
        changedBy: req.user.id,
      });

      res.json({
        success: true,
        data: {
          id: userId,
          status: newStatus,
        },
      });
    } catch (error) {
      logger.error("Error toggling user status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to toggle user status",
      });
    }
  }
);

// Toggle user status (activate/deactivate) - Tech Support specific
// Tech Support: Can toggle users but NOT admin users
router.post(
  "/techsupport/:userId/toggle-status",
  authenticate,
  requireAdminOrTechSupport,
  preventTechSupportModifyAdmin,
  param("userId").isInt(),
  validate,
  async (req, res) => {
    try {
      // Ensure only techsupport can access this endpoint
      if (req.user.role !== "techsupport") {
        return res.status(403).json({
          success: false,
          error: "Tech Support access required",
        });
      }

      const { userId } = req.params;

      // Get current status and role
      const [users] = await db.query(
        "SELECT status, role FROM users WHERE id = ?",
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      // Tech support cannot deactivate admins
      if (users[0].role === "admin") {
        return res.status(403).json({
          success: false,
          error: "Tech Support cannot modify admin accounts",
        });
      }

      const newStatus = users[0].status === "active" ? "inactive" : "active";

      await db.query(
        "UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?",
        [newStatus, userId]
      );

      // Log the action
      await db.query(
        `INSERT INTO system_logs (event_type, user_id, details, timestamp)
         VALUES ('user_status_changed', ?, ?, NOW())`,
        [
          req.user.id,
          JSON.stringify({
            targetUserId: userId,
            newStatus,
            changedBy: req.user.role,
          }),
        ]
      );

      logger.info("User status toggled by techsupport", {
        userId,
        newStatus,
        changedBy: req.user.id,
      });

      res.json({
        success: true,
        data: {
          id: userId,
          status: newStatus,
        },
        message: "User status updated successfully",
      });
    } catch (error) {
      logger.error("Error toggling user status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to toggle user status",
      });
    }
  }
);

// Reset user password (techsupport and admin)
// Tech Support: Can reset passwords but NOT admin passwords
router.post(
  "/techsupport/:userId/reset-password",
  authenticate,
  requireAdminOrTechSupport,
  preventTechSupportModifyAdmin,
  [param("userId").isInt()],
  validate,
  async (req, res) => {
    try {
      const { userId } = req.params;

      // Get user info to check role and get Tuya user ID
      const [users] = await db.query(
        "SELECT id, username, email, role, tuya_user_id FROM users WHERE id = ?",
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      const user = users[0];

      // Tech support cannot reset admin passwords
      if (req.user.role === "techsupport" && user.role === "admin") {
        return res.status(403).json({
          success: false,
          error: "Tech Support cannot modify admin accounts",
        });
      }

      // Set temporary password to 1234567
      const temporaryPassword = "1234567";
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);

      // Update password in database
      await db.query(
        "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?",
        [passwordHash, userId]
      );

      // Also create temporary password in Tuya lock
      let tuyaPasswordCreated = false;
      let tuyaPasswordError = null;

      try {
        const deviceId = process.env.TUYA_DEVICE_ID;
        if (deviceId) {
          // Set expiration to 10 years from now (no duration = very long time)
          const now = Math.floor(Date.now() / 1000);
          const tenYearsFromNow = now + 10 * 365 * 24 * 60 * 60; // 10 years in seconds

          // Create temporary password in Tuya lock
          // Temporary passwords are device-wide and can be used by anyone
          const passwordData = {
            name: `Reset Password - ${user.username} (${user.email})`,
            password: temporaryPassword,
            password_type: "ticket",
            effective_time: now,
            invalid_time: tenYearsFromNow,
            type: 0, // Multiple uses
            deviceId: deviceId,
          };

          await tuyaService.createTempPassword(passwordData);
          tuyaPasswordCreated = true;

          logger.info("Temporary password created in Tuya lock", {
            userId: userId,
            email: user.email,
            username: user.username,
          });
        } else {
          tuyaPasswordError = "TUYA_DEVICE_ID not configured";
          logger.warn(
            "TUYA_DEVICE_ID not set, skipping Tuya password creation",
            {
              userId: userId,
            }
          );
        }
      } catch (tuyaError) {
        tuyaPasswordError = tuyaError.message;
        logger.error(
          "Failed to create temporary password in Tuya lock:",
          tuyaError
        );
        // Don't fail the entire operation if Tuya password creation fails
      }

      // Log the action
      await db.query(
        `INSERT INTO system_logs (event_type, user_id, details, timestamp)
         VALUES ('user_password_reset', ?, ?, NOW())`,
        [
          req.user.id,
          JSON.stringify({
            targetUserId: userId,
            targetUserEmail: user.email,
            targetUserRole: user.role,
            resetBy: req.user.role,
            resetByUserId: req.user.id,
            tuyaPasswordCreated: tuyaPasswordCreated,
            tuyaPasswordError: tuyaPasswordError,
          }),
        ]
      );

      logger.info("User password reset by techsupport", {
        targetUserId: userId,
        targetUserEmail: user.email,
        resetBy: req.user.id,
        tuyaPasswordCreated: tuyaPasswordCreated,
      });

      const message = tuyaPasswordCreated
        ? "Password reset successfully. Temporary password: 1234567 (also set in lock)"
        : tuyaPasswordError
        ? `Password reset successfully. Temporary password: 1234567 (Note: Failed to set in lock: ${tuyaPasswordError})`
        : "Password reset successfully. Temporary password: 1234567";

      res.json({
        success: true,
        message: message,
        data: {
          id: userId,
          email: user.email,
          temporaryPassword: temporaryPassword,
          tuyaPasswordCreated: tuyaPasswordCreated,
          tuyaPasswordError: tuyaPasswordError || null,
        },
      });
    } catch (error) {
      logger.error("Error resetting user password:", error);
      res.status(500).json({
        success: false,
        error: "Failed to reset user password",
      });
    }
  }
);

// Update user permissions (admin only)
router.put(
  "/:userId/permissions",
  authenticate,
  requireAdmin,
  [param("userId").isInt(), body("permissions").isArray()],
  validate,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { permissions } = req.body;

      await fabricService.updateUserPermissions(
        userId,
        permissions,
        req.user.id
      );

      logger.info("User permissions updated", { userId });

      res.json({
        success: true,
        message: "Permissions updated successfully",
      });
    } catch (error) {
      logger.error("Error updating permissions:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update permissions",
      });
    }
  }
);

// Delete user
// Requires: delete_user permission
// Also deletes user from Tuya Cloud if they have a device user account
router.delete(
  "/:userId",
  authenticate,
  hasPermission(PERMISSIONS.DELETE_USER),
  preventTechSupportModifyAdmin,
  param("userId").isInt(),
  validate,
  async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const { userId } = req.params;

      // Don't allow deleting yourself
      if (parseInt(userId) === req.user.id) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: "Cannot delete your own account",
        });
      }

      // Get user info before deletion for logging and Tuya deletion
      const [users] = await connection.query(
        "SELECT username, email, role, tuya_user_id FROM users WHERE id = ?",
        [userId]
      );

      if (users.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      const user = users[0];

      // Tech support cannot delete admins
      if (req.user.role === "techsupport" && user.role === "admin") {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          error: "Tech Support cannot delete admin accounts",
        });
      }

      let tuyaDeletionResult = null;
      let tuyaDeletionError = null;
      let passwordDeletionResults = [];
      let passwordDeletionErrors = [];

      // Step 1: Check and delete temporary passwords associated with the user
      const deviceId = process.env.TUYA_DEVICE_ID;
      if (deviceId) {
        try {
          // Retrieve all temporary passwords associated with this user from the database
          const [tempPasswords] = await connection.query(
            "SELECT id, tuya_password_id FROM temporary_passwords WHERE target_user_id = ? AND tuya_password_id IS NOT NULL AND tuya_password_id != ''",
            [userId]
          );

          logger.info("Found temporary passwords for user", {
            userId,
            passwordCount: tempPasswords.length,
          });

          // For each password, check if it exists in TUYA and delete it
          for (const tempPassword of tempPasswords) {
            const passwordId = tempPassword.tuya_password_id;
            if (!passwordId) {
              continue;
            }

            try {
              // Check if password exists in TUYA cloud
              try {
                await tuyaService.getTempPassword(passwordId, deviceId);
                // If we get here, password exists in TUYA, so delete it
                await tuyaService.deleteTempPassword(passwordId, deviceId);
                passwordDeletionResults.push({
                  passwordId,
                  localId: tempPassword.id,
                  deleted: true,
                });
                logger.info("Temporary password deleted from TUYA", {
                  userId,
                  passwordId,
                  localId: tempPassword.id,
                });
              } catch (getError) {
                // If password doesn't exist (404 or similar), that's okay - it may have been already deleted
                const errorCode =
                  getError.response?.data?.code || getError.code;
                const errorMsg =
                  getError.response?.data?.msg || getError.message || "";

                if (
                  errorCode === 1106 ||
                  errorMsg.includes("1106") ||
                  errorMsg.includes("not found")
                ) {
                  // Password not found in TUYA - already deleted or never existed
                  logger.info(
                    "Temporary password not found in TUYA (may be already deleted)",
                    {
                      userId,
                      passwordId,
                      localId: tempPassword.id,
                    }
                  );
                  passwordDeletionResults.push({
                    passwordId,
                    localId: tempPassword.id,
                    deleted: false,
                    reason: "not_found_in_tuya",
                  });
                } else {
                  // Other error - log it but continue
                  passwordDeletionErrors.push({
                    passwordId,
                    localId: tempPassword.id,
                    error: getError.message,
                  });
                  logger.warn(
                    "Error checking/deleting temporary password from TUYA",
                    {
                      userId,
                      passwordId,
                      localId: tempPassword.id,
                      error: getError.message,
                    }
                  );
                }
              }
            } catch (deleteError) {
              // Error during deletion attempt
              passwordDeletionErrors.push({
                passwordId,
                localId: tempPassword.id,
                error: deleteError.message,
              });
              logger.error("Failed to delete temporary password from TUYA", {
                userId,
                passwordId,
                localId: tempPassword.id,
                error: deleteError.message,
              });
            }
          }
        } catch (error) {
          logger.error(
            "Error processing temporary passwords during user deletion",
            {
              userId,
              error: error.message,
            }
          );
          // Continue with user deletion even if password deletion fails
        }
      } else {
        logger.warn(
          "TUYA_DEVICE_ID not set, skipping temporary password deletion",
          {
            userId,
          }
        );
      }

      // Step 2: Delete from Tuya Cloud if user has a tuya_user_id
      if (user.tuya_user_id) {
        try {
          if (deviceId) {
            // First, try to find the device user by searching through device users
            // We need to find the device user_id (not the platform uid)
            try {
              // Get all device users and find the one matching this user's email or uid
              const deviceUsers = await tuyaService.getDeviceUsersById(
                deviceId,
                {
                  keyword: user.email || "",
                  role: "",
                  page_no: 1,
                  page_size: 100,
                }
              );

              const usersList =
                deviceUsers?.records ||
                deviceUsers?.list ||
                (Array.isArray(deviceUsers) ? deviceUsers : []);

              // Find the device user that matches by uid or user_contact
              const matchingDeviceUser = usersList.find(
                (du) =>
                  du.uid === user.tuya_user_id || du.user_contact === user.email
              );

              if (matchingDeviceUser && matchingDeviceUser.user_id) {
                // Delete the device user from Tuya
                tuyaDeletionResult = await tuyaService.deleteDeviceUser(
                  deviceId,
                  matchingDeviceUser.user_id
                );
                logger.info("User deleted from Tuya Cloud", {
                  userId,
                  tuyaUserId: user.tuya_user_id,
                  deviceUserId: matchingDeviceUser.user_id,
                  deletedBy: req.user.id,
                });
              } else {
                logger.warn(
                  "User has tuya_user_id but device user not found in Tuya",
                  {
                    userId,
                    tuyaUserId: user.tuya_user_id,
                    email: user.email,
                  }
                );
                tuyaDeletionError =
                  "Device user not found in Tuya (may have been already deleted)";
              }
            } catch (tuyaError) {
              tuyaDeletionError = tuyaError.message;
              logger.error("Failed to delete user from Tuya Cloud:", tuyaError);
              // Continue with database deletion even if Tuya deletion fails
            }
          } else {
            tuyaDeletionError = "TUYA_DEVICE_ID not configured";
            logger.warn("TUYA_DEVICE_ID not set, skipping Tuya user deletion", {
              userId,
            });
          }
        } catch (error) {
          tuyaDeletionError = error.message;
          logger.error("Error during Tuya user deletion:", error);
          // Continue with database deletion even if Tuya deletion fails
        }
      }

      // Delete from database
      await connection.query("DELETE FROM users WHERE id = ?", [userId]);

      // Log the action
      await connection.query(
        `INSERT INTO system_logs (event_type, user_id, details, timestamp)
         VALUES ('user_deleted', ?, ?, NOW())`,
        [
          req.user.id,
          JSON.stringify({
            deletedUser: {
              username: user.username,
              email: user.email,
              role: user.role,
            },
            passwordsDeleted: passwordDeletionResults.length,
            passwordDeletionResults: passwordDeletionResults,
            passwordDeletionErrors: passwordDeletionErrors,
            tuyaDeleted: tuyaDeletionResult !== null,
            tuyaError: tuyaDeletionError,
            deletedBy: req.user.role,
          }),
        ]
      );

      await connection.commit();

      logger.info("User deleted", {
        userId,
        deletedBy: req.user.id,
        passwordsDeleted: passwordDeletionResults.length,
        passwordErrors: passwordDeletionErrors.length,
        tuyaDeleted: tuyaDeletionResult !== null,
      });

      // Build response message
      const passwordMessages = [];
      if (passwordDeletionResults.length > 0) {
        const deletedCount = passwordDeletionResults.filter(
          (p) => p.deleted
        ).length;
        passwordMessages.push(
          `${deletedCount} temporary password(s) deleted from TUYA`
        );
      }
      if (passwordDeletionErrors.length > 0) {
        passwordMessages.push(
          `${passwordDeletionErrors.length} password deletion error(s)`
        );
      }

      let message = "User deleted successfully from database";
      if (passwordMessages.length > 0) {
        message += `. ${passwordMessages.join(". ")}.`;
      }
      if (tuyaDeletionResult !== null) {
        message += " User deleted from Tuya Cloud.";
      } else if (tuyaDeletionError) {
        message += ` Note: ${tuyaDeletionError}`;
      }

      res.json({
        success: true,
        message: message,
        data: {
          passwordsDeleted: passwordDeletionResults.length,
          passwordDeletionResults: passwordDeletionResults,
          passwordDeletionErrors:
            passwordDeletionErrors.length > 0 ? passwordDeletionErrors : null,
          tuyaDeleted: tuyaDeletionResult !== null,
          tuyaError: tuyaDeletionError || null,
        },
      });
    } catch (error) {
      await connection.rollback();
      logger.error("Error deleting user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete user",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }
);

// Get teachers list (for schedule creation)
router.get("/list/teachers", authenticate, async (req, res) => {
  try {
    const [teachers] = await db.query(
      "SELECT id, username, email FROM users WHERE role = 'teacher' AND status = 'active' ORDER BY username"
    );

    res.json({
      success: true,
      data: teachers.map((t) => ({
        id: t.id.toString(),
        name: t.username,
        email: t.email,
      })),
    });
  } catch (error) {
    logger.error("Error fetching teachers:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch teachers",
    });
  }
});

router.get("/tuya/enrolled", authenticate, requireStaff, async (req, res) => {
  try {
    console.log("[API] GET /users/tuya/enrolled - Fetching ALL Tuya users");

    const tuyaService = require("../services/tuya.service");
    const deviceId = process.env.TUYA_DEVICE_ID;

    if (!deviceId) {
      return res.json({
        success: true,
        data: [],
        message: "TUYA_DEVICE_ID not set in environment",
      });
    }

    // ✅ FIX: Fetch ALL users by using empty filters and large page size
    const keyword = ""; // Don't filter by keyword
    const role = "";     // Don't filter by role
    const pageSize = 100; // Increase page size to get all users

    // Fetch first page
    let allUsers = [];
    let currentPage = 1;
    let hasMorePages = true;

    // ✅ FIX: Loop through all pages to get ALL users
    while (hasMorePages && currentPage <= 10) { // Safety limit: max 10 pages
      console.log(`[API] Fetching page ${currentPage}...`);
      
      const result = await tuyaService.getDeviceUsersById(deviceId, {
        keyword: keyword,
        role: role,
        page_no: currentPage,
        page_size: pageSize,
      });

      if (!result) {
        console.error("[API] No result returned from Tuya API");
        break;
      }

      // ✅ FIX: Try multiple possible response formats
      const users = 
        result.records ||           // v1.1 API format
        result.list ||              // Alternative format
        result.result?.records ||   // Nested format
        result.result?.list ||      // Nested alternative
        (Array.isArray(result) ? result : []); // Array format

      console.log(`[API] Page ${currentPage}: Found ${users.length} users`);
      
      if (users.length === 0) {
        hasMorePages = false;
        break;
      }

      allUsers = allUsers.concat(users);

      // Check if there are more pages
      const total = result.total || result.result?.total || 0;
      const hasMore = (currentPage * pageSize) < total;
      
      if (!hasMore || users.length < pageSize) {
        hasMorePages = false;
      } else {
        currentPage++;
      }
    }

    console.log(`[API] Total users fetched: ${allUsers.length}`);

    // Map to include computed unlockMethods
    const mappedUsers = allUsers.map((user) => {
      const unlockMethods = [];

      if (user.unlock_detail && Array.isArray(user.unlock_detail)) {
        user.unlock_detail.forEach((detail) => {
          if (detail.unlock_list && Array.isArray(detail.unlock_list)) {
            detail.unlock_list.forEach((unlock) => {
              unlockMethods.push({
                type: detail.dp_code,
                unlockName: unlock.unlock_name || `SN: ${unlock.unlock_sn}`,
                unlockSn: unlock.unlock_sn,
              });
            });
          }
        });
      }

      return {
        ...user,
        tuyaUserId: user.user_id,
        unlockMethods,
      };
    });

    // Try to link with local users
    for (const user of mappedUsers) {
      if (user.user_contact) {
        const [matchedUsers] = await db.query(
          "SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1",
          [user.user_contact, user.user_contact]
        );
        if (matchedUsers.length > 0) {
          user.localUserId = matchedUsers[0].id.toString();
          user.localUserName = matchedUsers[0].username;
          user.localUserEmail = matchedUsers[0].email;
        }
      }
    }

    return res.json({
      success: true,
      data: mappedUsers,
      total: mappedUsers.length,
    });
  } catch (error) {
    console.error("[API] Error fetching Tuya users:", error);
    return res.status(500).json({
      success: false,
      data: [],
      error: error.message || "Failed to fetch Tuya users",
    });
  }
});

// Register user in Tuya platform (admin only)
router.post(
  "/tuya/register",
  authenticate,
  requireAdmin,
  [
    body("username").isString().notEmpty(),
    body("password").isString().isLength({ min: 6 }),
    body("country_code").isString().notEmpty(),
    body("creator").optional().isString(),
    body("user_nick_name").optional().isString(),
  ],
  validate,
  async (req, res) => {
    try {
      const tuyaService = require("../services/tuya.service");
      const { username, password, country_code, creator, user_nick_name } =
        req.body;

      const result = await tuyaService.registerUser({
        username,
        password,
        country_code,
        creator,
        user_nick_name,
      });

      res.json({
        success: true,
        data: {
          userId: result.user_id,
        },
        message: "User registered successfully in Tuya platform",
      });
    } catch (error) {
      logger.error("Error registering Tuya user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to register Tuya user",
        details: error.message,
      });
    }
  }
);

// Get Tuya user information by user ID (admin only)
router.get(
  "/tuya/user/:userId",
  authenticate,
  requireAdmin,
  [param("userId").isString().notEmpty()],
  validate,
  async (req, res) => {
    try {
      const tuyaService = require("../services/tuya.service");
      const { userId } = req.params;

      const userInfo = await tuyaService.getUserById(userId);

      res.json({
        success: true,
        data: {
          userId: userInfo.user_id,
          userName: userInfo.user_name,
          countryCode: userInfo.country_code,
        },
      });
    } catch (error) {
      logger.error("Error fetching Tuya user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch Tuya user",
        details: error.message,
      });
    }
  }
);

// Update Tuya device user (admin only)
// Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-member?id=Kbe2o84on6zgh#title-7-Modify%20a%20device%20user
// Endpoint: PUT /v1.0/smart-lock/devices/{device_id}/users/{user_id}
// Applicable lock types: Keepalive Wi-Fi lock, Wi-Fi lock with video talk
router.put(
  "/tuya/user/:userId",
  authenticate,
  requireAdmin,
  [
    param("userId").isString().notEmpty(),
    body("nick_name").optional().isString(),
    body("sex")
      .isInt({ min: 1, max: 2 })
      .withMessage("sex must be 1 (male) or 2 (female)"),
    body("birthday").optional().isInt({ min: 0 }),
    body("height").optional().isInt({ min: 0 }),
    body("weight").optional().isInt({ min: 0 }),
  ],
  validate,
  async (req, res) => {
    try {
      const deviceId = process.env.TUYA_DEVICE_ID;
      if (!deviceId) {
        return res.status(400).json({
          success: false,
          error: "TUYA_DEVICE_ID not set in environment",
        });
      }

      const { userId } = req.params;
      const { nick_name, sex, birthday, height, weight } = req.body;

      // Validate that sex is provided (required field)
      if (sex === undefined || sex === null) {
        return res.status(400).json({
          success: false,
          error: "sex is required (1 for male, 2 for female)",
        });
      }

      // userId should be the user_id returned when fetching the list of users
      logger.info("Updating Tuya device user", {
        deviceId,
        userId, // This should be the user_id from the user list
        hasNickName: !!nick_name,
        sex,
        hasBirthday: birthday !== undefined,
        hasHeight: height !== undefined,
        hasWeight: weight !== undefined,
      });

      const result = await tuyaService.updateDeviceUser(deviceId, userId, {
        nick_name,
        sex,
        birthday,
        height,
        weight,
      });

      if (result && result.success !== false) {
        // Log successful update
        logger.info("Tuya device user updated successfully", {
          deviceId,
          userId,
        });

        res.json({
          success: true,
          data: result,
          message: "User updated successfully",
        });
      } else {
        logger.warn("Tuya API returned unsuccessful result", {
          deviceId,
          userId,
          result,
        });
        res.status(500).json({
          success: false,
          error: "Failed to update Tuya device user",
          details: result?.msg || "Unknown error from Tuya API",
        });
      }
    } catch (error) {
      logger.error("Error updating Tuya device user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update Tuya device user",
        details: error.message,
      });
    }
  }
);

// Add existing user as device user in Tuya (admin only)
// This endpoint adds a user who already has Tuya platform credentials (uid) as a device user
router.post(
  "/:userId/tuya/device-user",
  authenticate,
  requireAdmin,
  [
    param("userId").isInt(),
    body("tuya_user_id")
      .isString()
      .notEmpty()
      .withMessage("tuya_user_id (uid) is required"),
    body("sex").optional().isInt({ min: 1, max: 2 }),
    body("birthday").optional().isInt({ min: 0 }),
    body("height").optional().isInt({ min: 0 }),
    body("weight").optional().isInt({ min: 0 }),
    body("back_home_notify_attr").optional().isInt({ min: 0, max: 1 }),
  ],
  validate,
  async (req, res) => {
    try {
      const deviceId = process.env.TUYA_DEVICE_ID;
      if (!deviceId) {
        return res.status(400).json({
          success: false,
          error: "TUYA_DEVICE_ID not set in environment",
        });
      }

      const { userId } = req.params;
      const {
        tuya_user_id,
        sex,
        birthday,
        height,
        weight,
        back_home_notify_attr,
      } = req.body;

      // Get user from database to get role and other info
      const [users] = await db.query(
        "SELECT id, username, email, role FROM users WHERE id = ?",
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      const user = users[0];

      // Map role to Tuya user_type: 10=admin, 20=common user, 50=home owner
      const tuyaUserType = tuyaService.mapRoleToUserType(user.role);

      const deviceUserData = {
        uid: tuya_user_id,
        nick_name: user.username,
        user_contact: user.email,
        user_type: tuyaUserType,
        sex: sex || 1, // Default to male
        back_home_notify_attr: back_home_notify_attr || 0,
      };

      // Optional fields
      if (birthday !== undefined) {
        deviceUserData.birthday = birthday;
      }
      if (height !== undefined) {
        deviceUserData.height = height;
      }
      if (weight !== undefined) {
        deviceUserData.weight = weight;
      }

      const result = await tuyaService.addDeviceUser(deviceId, deviceUserData);

      // Update user with Tuya user ID if not already set
      await db.query(
        "UPDATE users SET tuya_user_id = ? WHERE id = ? AND tuya_user_id IS NULL",
        [tuya_user_id, userId]
      );

      // Log the action
      await db.query(
        `INSERT INTO system_logs (event_type, user_id, details, timestamp)
         VALUES ('tuya_device_user_added', ?, ?, NOW())`,
        [
          req.user.id,
          JSON.stringify({
            targetUserId: userId,
            tuyaUserId: tuya_user_id,
            role: user.role,
            addedBy: req.user.role,
          }),
        ]
      );

      logger.info("User added as Tuya device user", {
        userId,
        tuyaUserId: tuya_user_id,
        role: user.role,
        addedBy: req.user.id,
      });

      res.json({
        success: true,
        data: result,
        message: "User added as device user successfully",
      });
    } catch (error) {
      logger.error("Error adding Tuya device user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to add Tuya device user",
        details: error.message,
      });
    }
  }
);

// Delete Tuya device user (admin only)
router.delete(
  "/tuya/user/:userId",
  authenticate,
  requireAdmin,
  [param("userId").isString().notEmpty()],
  validate,
  async (req, res) => {
    try {
      const deviceId = process.env.TUYA_DEVICE_ID;
      if (!deviceId) {
        return res.status(400).json({
          success: false,
          error: "TUYA_DEVICE_ID not set in environment",
        });
      }

      const { userId } = req.params;

      const result = await tuyaService.deleteDeviceUser(deviceId, userId);

      res.json({
        success: true,
        data: result,
        message: "User deleted successfully",
      });
    } catch (error) {
      logger.error("Error deleting Tuya device user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete Tuya device user",
        details: error.message,
      });
    }
  }
);

// Get detailed Tuya device user information (admin only)
// Uses v1.0 endpoint: GET /v1.0/devices/{device_id}/users/{user_id}
// Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-member?id=Kbe2o84on6zgh#title-8-Query%20device%20user%20information
router.get(
  "/tuya/user/:userId/details",
  authenticate,
  requireAdmin,
  [param("userId").isString().notEmpty()],
  validate,
  async (req, res) => {
    try {
      const deviceId = process.env.TUYA_DEVICE_ID;
      if (!deviceId) {
        return res.status(400).json({
          success: false,
          error: "TUYA_DEVICE_ID not set in environment",
        });
      }

      const { userId } = req.params;

      // Use the new endpoint: GET /v1.0/devices/{device_id}/users/{user_id}
      const result = await tuyaService.getDeviceUserById(deviceId, userId);

      if (!result) {
        return res.status(500).json({
          success: false,
          error: "Failed to fetch user information - no result returned",
        });
      }

      // Extract user data from result
      // Response format: { result: { device_id, nick_name, sex, birthday, height, weight, contact, user_id }, success: true, t: timestamp }
      const userData = result.result || result;

      if (!userData || !userData.user_id) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      // Try to link with local user by contact (email)
      let localUser = null;
      if (userData.contact) {
        const [matchedUsers] = await db.query(
          "SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1",
          [userData.contact, userData.contact]
        );
        if (matchedUsers.length > 0) {
          localUser = {
            id: matchedUsers[0].id.toString(),
            name: matchedUsers[0].username,
            email: matchedUsers[0].email,
          };
        }
      }

      // Try to get effective_flag and other fields from the user list (v1.1 endpoint)
      // This endpoint provides more complete user information including effective_flag
      let effectiveFlag = undefined;
      let userType = undefined;
      let uid = undefined;
      let avatarUrl = undefined;
      let unlockDetail = undefined;
      let unlockMethods = undefined;
      let timeScheduleInfo = undefined;
      let backHomeNotifyAttr = undefined;
      let offlineUnlock = undefined;

      try {
        // Fetch from user list to get effective_flag and other missing fields
        const listResult = await tuyaService.getDeviceUsersById(deviceId, {
          keyword: "",
          role: "",
          page_no: 1,
          page_size: 100,
        });

        if (listResult) {
          const users = listResult.records || listResult.list || (Array.isArray(listResult) ? listResult : []);
          const matchingUser = users.find((u) => u.user_id === userId || u.lock_user_id?.toString() === userId);

          if (matchingUser) {
            effectiveFlag = matchingUser.effective_flag;
            userType = matchingUser.user_type;
            uid = matchingUser.uid;
            avatarUrl = matchingUser.avatar_url;

            // Process unlock methods
            if (matchingUser.unlock_detail && Array.isArray(matchingUser.unlock_detail)) {
              unlockDetail = matchingUser.unlock_detail;
              unlockMethods = [];
              matchingUser.unlock_detail.forEach((detail) => {
                if (detail.unlock_list && Array.isArray(detail.unlock_list)) {
                  detail.unlock_list.forEach((unlock) => {
                    unlockMethods.push({
                      type: detail.dp_code,
                      unlockName: unlock.unlock_name || `SN: ${unlock.unlock_sn}`,
                      unlockSn: unlock.unlock_sn,
                      unlockId: unlock.unlock_id,
                      admin: unlock.admin,
                      photoUnlock: unlock.photo_unlock,
                      unlockAttr: unlock.unlock_attr,
                      opModeId: unlock.op_mode_id,
                    });
                  });
                }
              });
            }

            timeScheduleInfo = matchingUser.time_schedule_info;
            backHomeNotifyAttr = matchingUser.back_home_notify_attr;
            offlineUnlock = matchingUser.offline_unlock;
          }
        }
      } catch (listError) {
        // If fetching from list fails, continue with undefined values
        // Frontend will handle missing fields gracefully
        logger.warn("Failed to fetch additional user info from list:", listError.message);
      }

      // Format response to match expected frontend structure (TuyaUser interface)
      const responseData = {
        user_id: userData.user_id,
        lock_user_id: userData.user_id, // Use user_id as lock_user_id since endpoint doesn't provide it separately
        device_id: userData.device_id,
        nick_name: userData.nick_name || null,
        user_contact: userData.contact || null,
        contact: userData.contact || null,
        sex: userData.sex || null,
        birthday: userData.birthday || null,
        height: userData.height || null,
        weight: userData.weight || null,
        // Fields from user list (v1.1) if available
        user_type: userType,
        effective_flag: effectiveFlag,
        uid: uid,
        avatar_url: avatarUrl,
        unlock_detail: unlockDetail,
        unlockMethods: unlockMethods,
        time_schedule_info: timeScheduleInfo,
        back_home_notify_attr: backHomeNotifyAttr,
        offline_unlock: offlineUnlock,
        localUser,
      };

      res.json({
        success: true,
        data: responseData,
      });
    } catch (error) {
      logger.error("Error fetching Tuya user details:", error);

      // Check if it's a 404 error (user not found)
      if (error.response && error.response.status === 404) {
        return res.status(404).json({
          success: false,
          error: "User not found",
          details: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: "Failed to fetch user details",
        details: error.message,
      });
    }
  }
);

// Allocate unlocking method (password/card/fingerprint) to a Tuya device user
router.post(
  "/tuya/user/:userId/unlocking-methods",
  authenticate,
  requireStaff,
  [
    param("userId").isString().notEmpty(),
    // Required fields per documentation
    body("name").isString().notEmpty().withMessage("name is required (String)"),
    body("password")
      .isString()
      .isLength({ min: 6, max: 7 })
      .withMessage(
        "password must be 6-7 digits (6 for Zigbee/Bluetooth, 7 for Wi-Fi)"
      ),
    body("validFrom")
      .isISO8601()
      .withMessage("validFrom must be a valid ISO8601 date"),
    body("validUntil")
      .isISO8601()
      .withMessage("validUntil must be a valid ISO8601 date"),
    // Optional fields per documentation
    body("phone").optional().isString().withMessage("phone must be a string"),
    body("maxUsage")
      .optional()
      .isInt({ min: 0, max: 1 })
      .withMessage("maxUsage must be 0 (multiple) or 1 (once)"),
    body("time_zone")
      .optional()
      .isString()
      .withMessage("time_zone must be a string"),
    body("schedule_list")
      .optional()
      .isArray()
      .withMessage("schedule_list must be an array"),
    body("schedule_list.*.effective_time")
      .optional()
      .isInt({ min: 0, max: 1440 })
      .withMessage("schedule_list effective_time must be 0-1440 (minutes)"),
    body("schedule_list.*.invalid_time")
      .optional()
      .isInt({ min: 0, max: 1440 })
      .withMessage("schedule_list invalid_time must be 0-1440 (minutes)"),
    body("schedule_list.*.working_day")
      .optional()
      .isInt()
      .withMessage(
        "schedule_list working_day must be integer (1=Sun, 2=Mon, 4=Tue, 8=Wed, 16=Thu, 32=Fri, 64=Sat)"
      ),
    body("relate_dev_list")
      .optional()
      .isArray()
      .withMessage(
        "relate_dev_list must be an array (for Bluetooth locks only)"
      ),
  ],
  validate,
  async (req, res) => {
    try {
      const deviceId = process.env.TUYA_DEVICE_ID;
      if (!deviceId) {
        return res.status(400).json({
          success: false,
          error: "TUYA_DEVICE_ID not set in environment",
        });
      }

      const { userId } = req.params;
      const {
        name,
        password,
        validFrom,
        validUntil,
        maxUsage = 1,
        phone,
        time_zone,
        schedule_list,
        relate_dev_list,
      } = req.body;

      // Prepare request data for createTempPassword
      // Following documentation: POST /v1.0/devices/{device_id}/door-lock/temp-password
      const requestData = {
        name, // Required: String - Password name
        password, // Required: String - Plain password (6-7 digits) - will be encrypted automatically
        password_type: "ticket", // Required: String - "ticket"
        effective_time: Math.floor(new Date(validFrom).getTime() / 1000), // Required: Long - 10-digit timestamp in seconds
        invalid_time: Math.floor(new Date(validUntil).getTime() / 1000), // Required: Long - 10-digit timestamp in seconds
        type: maxUsage === 1 ? 1 : 0, // Optional: Integer - 1 = once, 0 = multiple uses (required for Zigbee locks)
        deviceId: deviceId, // Device ID from environment
      };

      // Optional: phone (String) - Mobile phone number
      if (phone !== undefined && phone !== null && phone !== "") {
        requestData.phone = String(phone);
      }

      // Optional: time_zone (String) - Required if using periodic password feature
      if (time_zone !== undefined && time_zone !== null) {
        requestData.time_zone = String(time_zone);
      } else if (schedule_list && schedule_list.length > 0) {
        // If schedule_list is provided, time_zone should be set (empty string if not provided)
        requestData.time_zone = "";
      }

      // Optional: schedule_list (List) - For periodic password feature
      // Format: [{ "effective_time": 720, "invalid_time": 1080, "working_day": 0 }]
      if (
        schedule_list &&
        Array.isArray(schedule_list) &&
        schedule_list.length > 0
      ) {
        requestData.schedule_list = schedule_list;
      }

      // Optional: relate_dev_list (array) - Only for Bluetooth lock accessories
      // Length is one digit. Only Bluetooth lock accessories are supported.
      if (
        relate_dev_list !== undefined &&
        relate_dev_list !== null &&
        Array.isArray(relate_dev_list) &&
        relate_dev_list.length > 0
      ) {
        requestData.relate_dev_list = relate_dev_list;
      }

      const result = await tuyaService.createTempPassword(requestData);

      res.json({
        success: true,
        message: "Temporary password created successfully",
        data: {
          passwordId: result.id || result.password_id,
          tuyaPasswordId: result.id || result.password_id,
          name,
          validFrom,
          validUntil,
        },
        // Include full Tuya API response for debugging
        tuyaResponse: {
          success: true,
          t: Date.now(),
          result: result,
        },
      });
    } catch (error) {
      logger.error("Error creating temporary password:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create temporary password",
        details: error.message,
      });
    }
  }
);

module.exports = router;
