require("dotenv").config();
const express = require("express");
const cors = require("cors");
const dbInitializer = require("./services/dbInitializer.service");
const fabricService = require("./services/fabric.service");
const schedulerService = require("./services/scheduler.service");
const logger = require("./utils/logger");

// Suppress non-critical Fabric event service errors when discovery is disabled
const originalConsoleError = console.error;
const originalStdErrWrite = process.stderr.write.bind(process.stderr);

console.error = function (...args) {
  const message = String(args[0]?.message || args[0] || "");
  const stack = String(args[0]?.stack || "");
  const firstArg = String(args[0] || "");

  if (
    message.includes("No targets provided") ||
    stack.includes("No targets provided") ||
    firstArg.includes("No targets provided")
  ) {
    return;
  }

  originalConsoleError.apply(console, args);
};

process.stderr.write = function (chunk, encoding, callback) {
  const message = chunk?.toString() || "";
  if (
    message.includes("No targets provided") ||
    message.includes("[BlockEventSource]")
  ) {
    return true;
  }
  return originalStdErrWrite(chunk, encoding, callback);
};

// Import routes
const enrollmentRoutes = require("./routes/enrollment.routes");
const accessRoutes = require("./routes/access.routes");
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const labSchedulesRoutes = require("./routes/labSchedules.routes");
const moveRequestsRoutes = require("./routes/moveRequests.routes");
const laboratoriesRoutes = require("./routes/laboratories.routes");
const devicesRoutes = require("./routes/devices.routes");
const systemConfigRoutes = require("./routes/systemConfig.routes");
const logsRoutes = require("./routes/logs.routes");
const tuyaWebhookRoutes = require("./routes/tuya-webhook.routes");
const notificationPreferencesRoutes = require("./routes/notificationPreferences.routes");
const passwordRequestsRoutes = require("./routes/passwordRequests.routes");
const rolePrivilegesRoutes = require("./routes/rolePrivileges.routes");
const semesterRoutes = require("./routes/semester.routes");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      fabric: fabricService.contract ? "connected" : "disconnected",
      scheduler: schedulerService.isInitialized ? "running" : "stopped",
    },
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/access", accessRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/lab-schedules", labSchedulesRoutes);
app.use("/api/move-requests", moveRequestsRoutes);
app.use("/api/laboratories", laboratoriesRoutes);
app.use("/api/devices", devicesRoutes);
app.use("/api/config", systemConfigRoutes);
app.use("/api/logs", logsRoutes);
app.use("/api/tuya", tuyaWebhookRoutes);
app.use("/api/notifications", notificationPreferencesRoutes);
app.use("/api/password-requests", passwordRequestsRoutes);
app.use("/api/role-privileges", rolePrivilegesRoutes);
app.use("/api/admin", semesterRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);

  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

// Initialize services and start server
async function startServer() {
  try {
    logger.info("🚀 Starting Smart Door Lock System...");
    logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
    logger.info(
      `Database: ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || "3306"}`,
    );

    // ===================================
    // STEP 1: Initialize Database
    // ===================================
    logger.info("📊 STEP 1: Initializing Database...");
    try {
      await dbInitializer.initialize();
      logger.info("✓ Database initialized successfully");

      // Verify database setup
      const isValid = await dbInitializer.verify();
      if (!isValid) {
        logger.error("❌ Database verification failed");
        logger.error("Please check the database configuration and try again");
        process.exit(1);
      }
    } catch (dbError) {
      logger.error("❌ Database initialization failed:", dbError.message);
      logger.error("Cannot start server without database");
      process.exit(1);
    }

    // ===================================
    // STEP 2: Initialize Hyperledger Fabric
    // ===================================
    logger.info("⛓️  STEP 2: Initializing Hyperledger Fabric...");
    try {
      await fabricService.initialize();
      logger.info("✓ Hyperledger Fabric initialized");
    } catch (fabricError) {
      logger.error(
        "✗ Hyperledger Fabric initialization failed:",
        fabricError.message,
      );
      logger.warn("Server will start but Fabric features will be unavailable");
      logger.warn("Please check:");
      logger.warn("  1. Channel name in .env matches AWS instance");
      logger.warn("  2. Admin identity is enrolled in wallet");
      logger.warn("  3. Connection profile paths are correct");
      logger.warn("  4. AWS instance network is running and accessible");
    }

    // ===================================
    // STEP 3: Initialize Scheduler
    // ===================================
    logger.info("⏰ STEP 3: Initializing Scheduler...");
    try {
      await schedulerService.initialize();
      logger.info("✓ Scheduler initialized");
    } catch (schedulerError) {
      logger.error(
        "✗ Scheduler initialization failed:",
        schedulerError.message,
      );
      logger.warn("Server will start but scheduled tasks will not run");
    }

    // ===================================
    // STEP 4: Start Express Server
    // ===================================
    logger.info("🌐 STEP 4: Starting Express Server...");
    app.listen(PORT, () => {
      logger.info(`✓ Server running on port ${PORT}`);
      logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      logger.info("🎉 Smart Door Lock System is ready!");
      logger.info(`📡 API endpoint: http://localhost:${PORT}`);
      logger.info(
        `🔐 Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:5173"}`,
      );
      logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    });

    // ===================================
    // STEP 5: Setup Fabric Event Listeners
    // ===================================
    if (fabricService.contract) {
      try {
        logger.info("📡 Setting up Fabric event listeners...");

        await fabricService.addContractListener(
          "EnrollmentRequested",
          (event) => {
            logger.info("Fabric Event - Enrollment Requested:", event);
          },
        );

        await fabricService.addContractListener(
          "EnrollmentApproved",
          (event) => {
            logger.info("Fabric Event - Enrollment Approved:", event);
          },
        );

        await fabricService.addContractListener("AccessLogged", (event) => {
          logger.info("Fabric Event - Access Logged:", event);
        });

        logger.info("✓ Fabric event listeners registered");
      } catch (listenerError) {
        logger.warn(
          "Failed to setup Fabric event listeners:",
          listenerError.message,
        );
      }
    } else {
      logger.warn(
        "⚠️  Fabric event listeners skipped (Fabric not initialized)",
      );
    }
  } catch (error) {
    logger.error("❌ Failed to start server:", error);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully...");
  schedulerService.stop();
  await fabricService.disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully...");
  schedulerService.stop();
  await fabricService.disconnect();
  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;
