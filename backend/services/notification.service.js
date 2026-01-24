const db = require("../models/mysql.models");
const logger = require("../utils/logger");

/**
 * Notification types
 */
const NOTIFICATION_TYPES = {
  SCHEDULE_APPROVED: "schedule_approved",
  SCHEDULE_DISAPPROVED: "schedule_disapproved",
  NEW_USER_ADDED: "new_user_added",
  DEVICE_ERROR: "device_error",
  ENROLLMENT_APPROVED: "enrollment_approved",
  ENROLLMENT_REJECTED: "enrollment_rejected",
  MOVE_REQUEST_APPROVED: "move_request_approved",
  MOVE_REQUEST_DENIED: "move_request_denied",
  MOVE_REQUEST_SUBMITTED: "move_request_submitted",
};

/**
 * Get user notification preferences
 * If preferences don't exist, create default preferences (all enabled)
 */
async function getUserNotificationPreferences(userId) {
  try {
    const [preferences] = await db.query(
      "SELECT * FROM user_notification_preferences WHERE user_id = ?",
      [userId]
    );

    if (preferences.length === 0) {
      // Create default preferences (all enabled)
      await db.query(
        `INSERT INTO user_notification_preferences 
         (user_id, schedule_approved, schedule_disapproved, new_user_added, device_error, 
          enrollment_approved, enrollment_rejected, move_request_approved, move_request_denied)
         VALUES (?, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)`,
        [userId]
      );

      const [newPreferences] = await db.query(
        "SELECT * FROM user_notification_preferences WHERE user_id = ?",
        [userId]
      );
      return newPreferences[0];
    }

    return preferences[0];
  } catch (error) {
    logger.error("Error getting user notification preferences:", error);
    // Return default preferences on error
    return {
      schedule_approved: true,
      schedule_disapproved: true,
      new_user_added: true,
      device_error: true,
      enrollment_approved: true,
      enrollment_rejected: true,
      move_request_approved: true,
      move_request_denied: true,
    };
  }
}

/**
 * Check if user wants to receive a specific notification type
 */
async function shouldNotifyUser(userId, notificationType) {
  try {
    const preferences = await getUserNotificationPreferences(userId);
    
    const preferenceMap = {
      [NOTIFICATION_TYPES.SCHEDULE_APPROVED]: preferences.schedule_approved,
      [NOTIFICATION_TYPES.SCHEDULE_DISAPPROVED]: preferences.schedule_disapproved,
      [NOTIFICATION_TYPES.NEW_USER_ADDED]: preferences.new_user_added,
      [NOTIFICATION_TYPES.DEVICE_ERROR]: preferences.device_error,
      [NOTIFICATION_TYPES.ENROLLMENT_APPROVED]: preferences.enrollment_approved,
      [NOTIFICATION_TYPES.ENROLLMENT_REJECTED]: preferences.enrollment_rejected,
      [NOTIFICATION_TYPES.MOVE_REQUEST_APPROVED]: preferences.move_request_approved,
      [NOTIFICATION_TYPES.MOVE_REQUEST_DENIED]: preferences.move_request_denied,
    };

    // Default to true for notification types without explicit preferences
    if (preferenceMap[notificationType] === undefined) {
      return true;
    }

    return preferenceMap[notificationType] === true;
  } catch (error) {
    logger.error("Error checking notification preference:", error);
    // Default to true on error
    return true;
  }
}

/**
 * Create and send a notification to a user
 */
async function createNotification(userId, type, title, message) {
  try {
    // Check if user wants this notification type
    const shouldNotify = await shouldNotifyUser(userId, type);
    
    if (!shouldNotify) {
      logger.info(`User ${userId} has disabled ${type} notifications`);
      return null;
    }

    // Insert notification
    const [result] = await db.query(
      `INSERT INTO notifications (user_id, type, title, message, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [userId, type, title, message]
    );

    logger.info(`Notification created for user ${userId}: ${type}`);
    return result.insertId;
  } catch (error) {
    logger.error("Error creating notification:", error);
    return null;
  }
}

/**
 * Notify multiple users
 */
async function notifyUsers(userIds, type, title, message) {
  const results = [];
  for (const userId of userIds) {
    const notificationId = await createNotification(userId, type, title, message);
    if (notificationId) {
      results.push({ userId, notificationId });
    }
  }
  return results;
}

/**
 * Notify all users with a specific role
 */
async function notifyUsersByRole(role, type, title, message) {
  try {
    const [users] = await db.query(
      "SELECT id FROM users WHERE role = ? AND status = 'active'",
      [role]
    );

    const userIds = users.map((u) => u.id);
    return await notifyUsers(userIds, type, title, message);
  } catch (error) {
    logger.error("Error notifying users by role:", error);
    return [];
  }
}

/**
 * Notify all admins and tech support
 */
async function notifyAdminsAndTechSupport(type, title, message) {
  try {
    const [users] = await db.query(
      "SELECT id FROM users WHERE role IN ('admin', 'techsupport') AND status = 'active'",
      []
    );

    const userIds = users.map((u) => u.id);
    return await notifyUsers(userIds, type, title, message);
  } catch (error) {
    logger.error("Error notifying admins and tech support:", error);
    return [];
  }
}

module.exports = {
  NOTIFICATION_TYPES,
  getUserNotificationPreferences,
  shouldNotifyUser,
  createNotification,
  notifyUsers,
  notifyUsersByRole,
  notifyAdminsAndTechSupport,
};

