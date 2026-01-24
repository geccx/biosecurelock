const db = require("../models/mysql.models");
const logger = require("../utils/logger");
const notificationService = require("../services/notification.service");

/**
 * Get current user's notification preferences
 */
exports.getMyPreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const preferences = await notificationService.getUserNotificationPreferences(
      userId
    );

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    logger.error("Error fetching notification preferences:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch notification preferences",
    });
  }
};

/**
 * Update current user's notification preferences
 */
exports.updateMyPreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      schedule_approved,
      schedule_disapproved,
      new_user_added,
      device_error,
      enrollment_approved,
      enrollment_rejected,
      move_request_approved,
      move_request_denied,
    } = req.body;

    // Check if preferences exist
    const [existing] = await db.query(
      "SELECT id FROM user_notification_preferences WHERE user_id = ?",
      [userId]
    );

    if (existing.length === 0) {
      // Create new preferences
      await db.query(
        `INSERT INTO user_notification_preferences 
         (user_id, schedule_approved, schedule_disapproved, new_user_added, device_error,
          enrollment_approved, enrollment_rejected, move_request_approved, move_request_denied)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          schedule_approved !== undefined ? schedule_approved : true,
          schedule_disapproved !== undefined ? schedule_disapproved : true,
          new_user_added !== undefined ? new_user_added : true,
          device_error !== undefined ? device_error : true,
          enrollment_approved !== undefined ? enrollment_approved : true,
          enrollment_rejected !== undefined ? enrollment_rejected : true,
          move_request_approved !== undefined ? move_request_approved : true,
          move_request_denied !== undefined ? move_request_denied : true,
        ]
      );
    } else {
      // Update existing preferences
      const updateFields = [];
      const updateValues = [];

      if (schedule_approved !== undefined) {
        updateFields.push("schedule_approved = ?");
        updateValues.push(schedule_approved);
      }
      if (schedule_disapproved !== undefined) {
        updateFields.push("schedule_disapproved = ?");
        updateValues.push(schedule_disapproved);
      }
      if (new_user_added !== undefined) {
        updateFields.push("new_user_added = ?");
        updateValues.push(new_user_added);
      }
      if (device_error !== undefined) {
        updateFields.push("device_error = ?");
        updateValues.push(device_error);
      }
      if (enrollment_approved !== undefined) {
        updateFields.push("enrollment_approved = ?");
        updateValues.push(enrollment_approved);
      }
      if (enrollment_rejected !== undefined) {
        updateFields.push("enrollment_rejected = ?");
        updateValues.push(enrollment_rejected);
      }
      if (move_request_approved !== undefined) {
        updateFields.push("move_request_approved = ?");
        updateValues.push(move_request_approved);
      }
      if (move_request_denied !== undefined) {
        updateFields.push("move_request_denied = ?");
        updateValues.push(move_request_denied);
      }

      if (updateFields.length > 0) {
        updateValues.push(userId);
        await db.query(
          `UPDATE user_notification_preferences 
           SET ${updateFields.join(", ")}, updated_at = NOW()
           WHERE user_id = ?`,
          updateValues
        );
      }
    }

    // Fetch updated preferences
    const preferences = await notificationService.getUserNotificationPreferences(
      userId
    );

    logger.info("Notification preferences updated", { userId });

    res.json({
      success: true,
      message: "Notification preferences updated successfully",
      data: preferences,
    });
  } catch (error) {
    logger.error("Error updating notification preferences:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update notification preferences",
    });
  }
};

/**
 * Get user's notifications
 */
exports.getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0, unread_only = false } = req.query;

    let query = "SELECT * FROM notifications WHERE user_id = ?";
    const params = [userId];

    // Handle both boolean and string values for unread_only
    if (unread_only === "true" || unread_only === true) {
      query += " AND `read` = FALSE";
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const [notifications] = await db.query(query, params);

    // Get total count
    let countQuery = "SELECT COUNT(*) as total FROM notifications WHERE user_id = ?";
    const countParams = [userId];
    // Handle both boolean and string values for unread_only
    if (unread_only === "true" || unread_only === true) {
      countQuery += " AND `read` = FALSE";
    }
    const [countResult] = await db.query(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      success: true,
      data: notifications,
      total,
    });
  } catch (error) {
    logger.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch notifications",
    });
  }
};

/**
 * Mark notification as read
 */
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    // Verify notification belongs to user
    const [notifications] = await db.query(
      "SELECT id FROM notifications WHERE id = ? AND user_id = ?",
      [notificationId, userId]
    );

    if (notifications.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    await db.query(
      "UPDATE notifications SET `read` = TRUE WHERE id = ? AND user_id = ?",
      [notificationId, userId]
    );

    res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    logger.error("Error marking notification as read:", error);
    res.status(500).json({
      success: false,
      error: "Failed to mark notification as read",
    });
  }
};

/**
 * Mark all notifications as read
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await db.query(
      "UPDATE notifications SET `read` = TRUE WHERE user_id = ? AND `read` = FALSE",
      [userId]
    );

    res.json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    logger.error("Error marking all notifications as read:", error);
    res.status(500).json({
      success: false,
      error: "Failed to mark all notifications as read",
    });
  }
};

/**
 * Get all notifications (admin and techsupport only)
 */
exports.getAllNotifications = async (req, res) => {
  try {
    const userRole = req.user.role;
    
    // Only admin and techsupport can see all notifications
    if (userRole !== "admin" && userRole !== "techsupport") {
      return res.status(403).json({
        success: false,
        error: "Access denied. Only admins and tech support can view all notifications.",
      });
    }

    const { limit = 100, offset = 0, unread_only = false, user_id } = req.query;

    let query = `
      SELECT n.*, u.username as user_name, u.email as user_email 
      FROM notifications n
      LEFT JOIN users u ON n.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Handle both boolean and string values for unread_only
    if (unread_only === "true" || unread_only === true) {
      query += " AND n.`read` = FALSE";
    }

    if (user_id) {
      query += " AND n.user_id = ?";
      params.push(parseInt(user_id));
    }

    query += " ORDER BY n.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const [notifications] = await db.query(query, params);

    // Get total count
    let countQuery = "SELECT COUNT(*) as total FROM notifications WHERE 1=1";
    const countParams = [];
    // Handle both boolean and string values for unread_only
    if (unread_only === "true" || unread_only === true) {
      countQuery += " AND `read` = FALSE";
    }
    if (user_id) {
      countQuery += " AND user_id = ?";
      countParams.push(parseInt(user_id));
    }
    const [countResult] = await db.query(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      success: true,
      data: notifications,
      total,
    });
  } catch (error) {
    logger.error("Error fetching all notifications:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch notifications",
    });
  }
};

/**
 * Delete notification (admin only)
 */
exports.deleteNotification = async (req, res) => {
  try {
    const userRole = req.user.role;
    const { notificationId } = req.params;

    // Only admin can delete notifications
    if (userRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Access denied. Only admins can delete notifications.",
      });
    }

    const [result] = await db.query(
      "DELETE FROM notifications WHERE id = ?",
      [notificationId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    res.json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete notification",
    });
  }
};

/**
 * Delete all notifications (admin only)
 */
exports.deleteAllNotifications = async (req, res) => {
  try {
    const userRole = req.user.role;

    // Only admin can delete all notifications
    if (userRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Access denied. Only admins can delete all notifications.",
      });
    }

    const { user_id } = req.query;
    
    if (user_id) {
      await db.query("DELETE FROM notifications WHERE user_id = ?", [user_id]);
    } else {
      await db.query("DELETE FROM notifications");
    }

    res.json({
      success: true,
      message: "Notifications deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting all notifications:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete notifications",
    });
  }
};

/**
 * Mark notification as read (admin can mark any notification)
 */
exports.markNotificationAsRead = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;
    const { notificationId } = req.params;

    // Check if notification exists
    const [notifications] = await db.query(
      "SELECT id, user_id FROM notifications WHERE id = ?",
      [notificationId]
    );

    if (notifications.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    // Admin can mark any notification as read, others can only mark their own
    if (userRole !== "admin" && notifications[0].user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    await db.query(
      "UPDATE notifications SET `read` = TRUE WHERE id = ?",
      [notificationId]
    );

    res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    logger.error("Error marking notification as read:", error);
    res.status(500).json({
      success: false,
      error: "Failed to mark notification as read",
    });
  }
};

