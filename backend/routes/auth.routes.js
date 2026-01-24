const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../models/mysql.models");
const fabricService = require("../services/fabric.service");
const logger = require("../utils/logger");
const { createSystemLog } = require("../utils/logging.utils");
const { body, validationResult } = require("express-validator");

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

// Register new user
router.post(
  "/register",
  [
    body("username").isString().isLength({ min: 3, max: 100 }),
    body("email").isEmail(),
    body("password").isString().isLength({ min: 8 }),
    body("role").optional().isIn(["admin", "user", "visitor"]),
  ],
  validate,
  async (req, res) => {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const { username, email, password, role = "user" } = req.body;

      // Check if user exists
      const [existing] = await connection.query(
        "SELECT id FROM users WHERE email = ? OR username = ?",
        [email, username]
      );

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          error: "User already exists",
        });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Insert user
      const [result] = await connection.query(
        "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
        [username, email, passwordHash, role]
      );

      const userId = result.insertId;

      // Register on Fabric
      const fabricUser = await fabricService.registerUser(username, role);

      // Update with fabric identity
      await connection.query(
        "UPDATE users SET fabric_identity = ? WHERE id = ?",
        [fabricUser.fabricIdentity, userId]
      );

      // Register on blockchain
      await fabricService.registerUserOnChain(
        userId,
        username,
        email,
        role,
        fabricUser.fabricIdentity
      );

      await connection.commit();

      logger.info("User registered", { userId, username });

      // Generate JWT
      const token = jwt.sign(
        { id: userId, username, email, role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          userId,
          username,
          email,
          role,
          token,
        },
      });
    } catch (error) {
      await connection.rollback();
      logger.error("Registration error:", error);
      res.status(500).json({
        success: false,
        error: "Registration failed",
      });
    } finally {
      connection.release();
    }
  }
);

// Login
router.post(
  "/login",
  [body("email").isEmail(), body("password").isString()],
  validate,
  async (req, res) => {
    try {
      const { email, password } = req.body;

      // Get user
      const [users] = await db.query("SELECT * FROM users WHERE email = ?", [
        email,
      ]);

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          error: "Invalid credentials",
        });
      }

      const user = users[0];

      // Check if user account is active
      if (user.status !== "active") {
        return res.status(403).json({
          success: false,
          error:
            "Your account has been deactivated. Please contact an administrator.",
        });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);

      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: "Invalid credentials",
        });
      }

      // Generate JWT
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      logger.info("User logged in", { userId: user.id });

      // Log login event to system_logs
      try {
        await createSystemLog("user_login", {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        }, {
          eventDescription: `User ${user.username} (${user.role}) logged in`,
          details: {
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get("user-agent"),
          },
        });
      } catch (logError) {
        // Don't fail login if logging fails
        logger.error("Failed to log login event:", logError);
      }

      res.json({
        success: true,
        data: {
          userId: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          token,
        },
      });
    } catch (error) {
      logger.error("Login error:", error);
      res.status(500).json({
        success: false,
        error: "Login failed",
      });
    }
  }
);

// Logout - logs the logout event
router.post(
  "/logout",
  async (req, res) => {
    try {
      // Get user from token if available
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          
          // Log logout event to system_logs
          try {
            await createSystemLog("user_logout", {
              id: decoded.id,
              username: decoded.username,
              email: decoded.email,
              role: decoded.role,
            }, {
              eventDescription: `User ${decoded.username} (${decoded.role}) logged out`,
              details: {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get("user-agent"),
              },
            });
          } catch (logError) {
            // Don't fail logout if logging fails
            logger.error("Failed to log logout event:", logError);
          }
        } catch (jwtError) {
          // Token invalid or expired, just continue
          logger.debug("Invalid token on logout:", jwtError.message);
        }
      }

      res.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      logger.error("Logout error:", error);
      res.status(500).json({
        success: false,
        error: "Logout failed",
      });
    }
  }
);

module.exports = router;
