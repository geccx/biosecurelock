const fabricService = require("../services/fabric.service");
const logger = require("../utils/logger");

// Check if user has specific permission on blockchain
const checkFabricPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
      }

      logger.info("Checking Fabric permission", {
        userId,
        permission: requiredPermission,
      });

      // Check permission on Hyperledger Fabric
      const permission = await fabricService.checkAccessPermission(
        userId,
        requiredPermission
      );

      if (!permission || !permission.allowed) {
        logger.warn("Fabric permission denied", {
          userId,
          permission: requiredPermission,
          reason: permission?.reason,
        });

        return res.status(403).json({
          success: false,
          error: "Insufficient blockchain permissions",
          fabricResponse: permission,
        });
      }

      logger.info("Fabric permission granted", {
        userId,
        permission: requiredPermission,
      });

      // Attach permission check result to request
      req.fabricPermission = permission;
      next();
    } catch (error) {
      logger.error("Fabric permission check error:", error);

      // If Fabric is down, decide whether to fail closed or open
      // For production, you might want to fail closed (deny access)
      return res.status(500).json({
        success: false,
        error: "Failed to verify blockchain permissions",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
};

// Verify user exists on blockchain
const verifyFabricUser = async (req, res, next) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "User not authenticated",
      });
    }

    logger.info("Verifying user on Fabric", { userId });

    // Get user from blockchain
    const fabricUser = await fabricService.getUser(userId);

    if (!fabricUser) {
      logger.warn("User not found on Fabric", { userId });
      return res.status(403).json({
        success: false,
        error: "User not registered on blockchain",
      });
    }

    // Check if user is active
    if (!fabricUser.isActive) {
      logger.warn("User is not active on Fabric", { userId });
      return res.status(403).json({
        success: false,
        error: "User account is not active on blockchain",
      });
    }

    logger.info("User verified on Fabric", {
      userId,
      username: fabricUser.username,
    });

    // Attach fabric user data to request
    req.fabricUser = fabricUser;
    next();
  } catch (error) {
    logger.error("Fabric user verification error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to verify user on blockchain",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Log action on blockchain
const logFabricAction = (actionType) => {
  return async (req, res, next) => {
    // Store original res.json to intercept response
    const originalJson = res.json.bind(res);

    res.json = async (data) => {
      try {
        // Only log successful actions
        if (data.success) {
          const userId = req.user?.id;

          if (userId) {
            // Log asynchronously, don't wait
            fabricService
              .logAccess(Date.now(), userId, actionType, req.method, true, {
                path: req.path,
                ip: req.ip,
                userAgent: req.get("user-agent"),
              })
              .catch((error) => {
                logger.error("Error logging action to Fabric:", error);
              });
          }
        }
      } catch (error) {
        logger.error("Error in Fabric logging middleware:", error);
      }

      // Send response
      return originalJson(data);
    };

    next();
  };
};

module.exports = {
  checkFabricPermission,
  verifyFabricUser,
  logFabricAction,
};
