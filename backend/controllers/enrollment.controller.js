const tuyaService = require("../services/tuya.service");
const tuyaIntegration = require("../services/tuya-integration.service");
const fabricService = require("../services/fabric.service");
const db = require("../models/mysql.models");
const logger = require("../utils/logger");
const { createSystemLog } = require("../utils/logging.utils");

class EnrollmentController {
  // Request new enrollment (User submits request)
  async requestEnrollment(req, res) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const { userId, enrollmentType, enrollmentData } = req.body;
      const requesterId = req.user.id; // From auth middleware

      // Validate enrollment type
      if (!["fingerprint", "rfid", "pin"].includes(enrollmentType)) {
        return res.status(400).json({
          success: false,
          error: "Invalid enrollment type",
        });
      }

      // Check if user exists
      const [users] = await connection.query(
        "SELECT * FROM users WHERE id = ?",
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      // Only allow users to request enrollment for themselves (unless admin)
      if (requesterId !== userId && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Unauthorized",
        });
      }

      // Insert enrollment request in MySQL
      const [result] = await connection.query(
        `INSERT INTO enrollments 
         (user_id, enrollment_type, enrollment_data, status) 
         VALUES (?, ?, ?, 'pending')`,
        [userId, enrollmentType, JSON.stringify(enrollmentData)]
      );

      const enrollmentId = result.insertId;

      // Request enrollment on Hyperledger Fabric
      const fabricResult = await fabricService.requestEnrollment(
        enrollmentId,
        userId,
        enrollmentType,
        enrollmentData
      );

      // Log system activity with user level information
      await createSystemLog("enrollment_requested", req.user, {
        eventDescription: `User ${userId} requested ${enrollmentType} enrollment`,
        details: { enrollmentId, enrollmentType },
        fabricTxId: fabricResult.txId || null,
        connection: connection,
      });

      await connection.commit();

      logger.info("Enrollment request created", {
        enrollmentId,
        userId,
        enrollmentType,
      });

      res.status(201).json({
        success: true,
        message: "Enrollment request submitted successfully",
        data: {
          enrollmentId,
          userId,
          enrollmentType,
          status: "pending",
          fabricTxId: fabricResult.txId,
        },
      });
    } catch (error) {
      await connection.rollback();
      logger.error("Error requesting enrollment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to request enrollment",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  // Get all enrollments (Admin/Tech Support)
  async getAllEnrollments(req, res) {
    try {
      const [enrollments] = await db.query(
        `SELECT er.*, u.username, u.email, a.username as approver_name
         FROM enrollments er
         JOIN users u ON er.user_id = u.id
         LEFT JOIN users a ON er.approved_by = a.id
         ORDER BY er.created_at DESC`
      );

      res.json({
        success: true,
        data: enrollments,
      });
    } catch (error) {
      logger.error("Error fetching all enrollments:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch enrollments",
      });
    }
  }

  // Get all pending enrollments (Admin/Tech Support)
  async getPendingEnrollments(req, res) {
    try {
      // Check admin permission via Fabric
      const permission = await fabricService.checkAccessPermission(
        req.user.id,
        "manage_enrollments"
      );

      if (!permission.allowed && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions",
        });
      }

      // Get from MySQL
      const [enrollments] = await db.query(
        `SELECT e.*, u.username, u.email 
         FROM enrollments e
         JOIN users u ON e.user_id = u.id
         WHERE e.status = 'pending'
         ORDER BY e.created_at DESC`
      );

      res.json({
        success: true,
        data: enrollments,
      });
    } catch (error) {
      logger.error("Error fetching pending enrollments:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch enrollments",
      });
    }
  }

  // Approve enrollment request (Admin only)
  async approveEnrollment(req, res) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const { enrollmentId } = req.params;
      const approverId = req.user.id;

      // Check admin permission via Fabric
      const permission = await fabricService.checkAccessPermission(
        approverId,
        "approve_enrollment"
      );

      if (!permission.allowed && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions",
        });
      }

      // Get enrollment request
      const [enrollments] = await connection.query(
        "SELECT * FROM enrollments WHERE id = ?",
        [enrollmentId]
      );

      if (enrollments.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Enrollment request not found",
        });
      }

      const enrollment = enrollments[0];

      if (enrollment.status !== "pending") {
        return res.status(400).json({
          success: false,
          error: `Enrollment is already ${enrollment.status}`,
        });
      }

      // Approve on Hyperledger Fabric
      const fabricResult = await fabricService.approveEnrollment(
        enrollmentId,
        approverId
      );

      // Update MySQL
      await connection.query(
        `UPDATE enrollments 
         SET status = 'approved', approved_by = ?, approved_at = NOW() 
         WHERE id = ?`,
        [approverId, enrollmentId]
      );

      // Log activity with user level information
      await createSystemLog("enrollment_approved", req.user, {
        eventDescription: `Enrollment ${enrollmentId} approved by admin ${approverId}`,
        details: { enrollmentId, approverId, targetUserId: enrollment.user_id },
        fabricTxId: fabricResult.txId || null,
        connection: connection,
      });

      await connection.commit();

      // Sync enrollment with Tuya based on type
      try {
        const enrollmentData = JSON.parse(enrollment.enrollment_data);
        const syncResult = await tuyaIntegration.syncUserEnrollment(
          enrollment.user_id,
          enrollment.enrollment_type,
          enrollmentData
        );

        // Update enrollment with Tuya unlock ID
        await connection.query(
          "UPDATE enrollments SET tuya_unlock_id = ?, status = 'synced' WHERE id = ?",
          [syncResult.tuyaUnlockId || syncResult.tuyaPasswordId, enrollmentId]
        );
      } catch (tuyaError) {
        logger.error("Error syncing enrollment with Tuya:", tuyaError);
        // For fingerprint/RFID, physical enrollment is required
        // Don't fail the approval, but mark as needing physical sync
        if (
          enrollment.enrollment_type === "fingerprint" ||
          enrollment.enrollment_type === "rfid"
        ) {
          logger.info(
            "Fingerprint/RFID enrollment approved, physical sync required",
            {
              enrollmentId,
            }
          );
        }
      }

      // Send notification to the user
      const notificationService = require("../services/notification.service");
      await notificationService.createNotification(
        enrollment.user_id,
        notificationService.NOTIFICATION_TYPES.ENROLLMENT_APPROVED,
        "Enrollment Approved",
        `Your ${enrollment.enrollment_type} enrollment request has been approved.${enrollment.enrollment_type === "fingerprint" || enrollment.enrollment_type === "rfid" ? " Physical enrollment required at device location." : ""}`
      );

      logger.info("Enrollment approved", { enrollmentId, approverId });

      res.json({
        success: true,
        message: "Enrollment approved successfully",
        data: {
          enrollmentId,
          status: "approved",
          fabricTxId: fabricResult.txId,
          note:
            enrollment.enrollment_type === "fingerprint" ||
            enrollment.enrollment_type === "rfid"
              ? "Physical enrollment required at device location"
              : "PIN created successfully",
        },
      });
    } catch (error) {
      await connection.rollback();
      logger.error("Error approving enrollment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to approve enrollment",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  // Reject enrollment request (Admin only)
  async rejectEnrollment(req, res) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const { enrollmentId } = req.params;
      const { reason } = req.body;
      const rejecterId = req.user.id;

      // Check permission via Fabric
      const permission = await fabricService.checkAccessPermission(
        rejecterId,
        "approve_enrollment"
      );

      if (!permission.allowed && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions",
        });
      }

      // Get enrollment
      const [enrollments] = await connection.query(
        "SELECT * FROM enrollment_requests WHERE id = ?",
        [enrollmentId]
      );

      if (enrollments.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Enrollment request not found",
        });
      }

      const enrollment = enrollments[0];

      if (enrollment.status !== "pending") {
        return res.status(400).json({
          success: false,
          error: `Enrollment is already ${enrollment.status}`,
        });
      }

      // Reject on Fabric
      const fabricResult = await fabricService.rejectEnrollment(
        enrollmentId,
        rejecterId,
        reason || "No reason provided"
      );

      // Update MySQL
      await connection.query(
        `UPDATE enrollments 
         SET status = 'rejected', approved_by = ?, approved_at = NOW() 
         WHERE id = ?`,
        [rejecterId, enrollmentId]
      );

      // Log activity
      // Log activity with user level information
      await createSystemLog("enrollment_rejected", req.user, {
        eventDescription: `Enrollment ${enrollmentId} rejected: ${reason}`,
        details: {
          enrollmentId,
          rejecterId,
          reason,
          targetUserId: enrollment.user_id,
        },
        fabricTxId: fabricResult.txId || null,
        connection: connection,
      });

      await connection.commit();

      // Send notification to the user
      const notificationService = require("../services/notification.service");
      const message = reason
        ? `Your ${enrollment.enrollment_type} enrollment request has been rejected. Reason: ${reason}`
        : `Your ${enrollment.enrollment_type} enrollment request has been rejected.`;
      await notificationService.createNotification(
        enrollment.user_id,
        notificationService.NOTIFICATION_TYPES.ENROLLMENT_REJECTED,
        "Enrollment Rejected",
        message
      );

      logger.info("Enrollment rejected", { enrollmentId, rejecterId, reason });

      res.json({
        success: true,
        message: "Enrollment rejected",
        data: {
          enrollmentId,
          status: "rejected",
          reason,
          fabricTxId: fabricResult.txId,
        },
      });
    } catch (error) {
      await connection.rollback();
      logger.error("Error rejecting enrollment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to reject enrollment",
      });
    } finally {
      connection.release();
    }
  }

  // Sync physical enrollment (After on-site fingerprint/RFID enrollment)
  async syncPhysicalEnrollment(req, res) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const { enrollmentId } = req.params;

      // Get enrollment
      const [enrollments] = await connection.query(
        "SELECT * FROM enrollments WHERE id = ?",
        [enrollmentId]
      );

      if (enrollments.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Enrollment not found",
        });
      }

      const enrollment = enrollments[0];

      if (enrollment.status !== "approved") {
        return res.status(400).json({
          success: false,
          error: "Enrollment must be approved first",
        });
      }

      // Sync with Tuya to get latest unlocking methods
      // Use the enrollment type to determine which code to sync
      const tuyaCode = tuyaService._mapEnrollmentTypeToCode(
        enrollment.enrollment_type
      );
      await tuyaService.syncUnlockingMethods(tuyaCode);

      // Use Tuya integration service to sync
      const enrollmentData = JSON.parse(enrollment.enrollment_data);
      const syncResult = await tuyaIntegration.syncUserEnrollment(
        enrollment.user_id,
        enrollment.enrollment_type,
        enrollmentData
      );

      // Update enrollment with Tuya unlock ID
      await connection.query(
        `UPDATE enrollments 
         SET tuya_unlock_id = ?, status = 'synced', enrolled_at = NOW() 
         WHERE id = ?`,
        [syncResult.tuyaUnlockId || syncResult.tuyaPasswordId, enrollmentId]
      );

      // Log activity
      // Log activity with user level information
      await createSystemLog(
        "physical_enrollment_synced",
        { id: enrollment.user_id, role: enrollment.user?.role || null },
        {
          eventDescription: `Physical enrollment ${enrollmentId} synced with Tuya`,
          details: {
            enrollmentId,
            tuyaUnlockId: syncResult.tuyaUnlockId || syncResult.tuyaPasswordId,
            unlockType: syncResult.unlockType,
          },
          connection: connection,
        }
      );

      await connection.commit();

      logger.info("Physical enrollment synced", {
        enrollmentId,
        tuyaUnlockId: syncResult.tuyaUnlockId || syncResult.tuyaPasswordId,
      });

      res.json({
        success: true,
        message: "Physical enrollment synced successfully",
        data: {
          enrollmentId,
          tuyaUnlockId: syncResult.tuyaUnlockId || syncResult.tuyaPasswordId,
          unlockType: syncResult.unlockType,
          status: "synced",
        },
      });
    } catch (error) {
      await connection.rollback();
      logger.error("Error syncing physical enrollment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to sync enrollment",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  // Get user's enrollments
  async getUserEnrollments(req, res) {
    try {
      const { userId } = req.params;
      const requesterId = req.user.id;

      // Check permission
      if (requesterId !== parseInt(userId) && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Unauthorized",
        });
      }

      const [enrollments] = await db.query(
        `SELECT e.*, a.username as approver_name
         FROM enrollments e
         LEFT JOIN users a ON e.approved_by = a.id
         WHERE e.user_id = ?
         ORDER BY e.created_at DESC`,
        [userId]
      );

      res.json({
        success: true,
        data: enrollments,
      });
    } catch (error) {
      logger.error("Error fetching user enrollments:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch enrollments",
      });
    }
  }

  // Reset enrollment (Tech Support can reset PIN/RFID)
  async resetEnrollment(req, res) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const { enrollmentId } = req.params;
      const { newData } = req.body;
      const resetBy = req.user.id;

      const [enrollments] = await connection.query(
        "SELECT * FROM enrollments WHERE id = ?",
        [enrollmentId]
      );

      if (enrollments.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Enrollment not found",
        });
      }

      const enrollment = enrollments[0];

      // Reset PIN in Tuya if it's a PIN enrollment
      if (enrollment.enrollment_type === "pin" && enrollment.tuya_unlock_id) {
        try {
          // Delete old password
          await tuyaService.deleteTempPassword(enrollment.tuya_unlock_id);

          // Create new password if provided
          if (newData && newData.pin) {
            const passwordData = {
              password: newData.pin,
              name: `User_${enrollment.user_id}_reset`,
              type: "permanent",
              startTime: Math.floor(Date.now() / 1000),
              endTime: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
            };
            const tuyaResult = await tuyaService.createTempPassword(
              passwordData
            );

            await connection.query(
              "UPDATE enrollments SET tuya_unlock_id = ?, enrollment_data = ? WHERE id = ?",
              [tuyaResult.password_id, JSON.stringify(newData), enrollmentId]
            );
          }
        } catch (tuyaError) {
          logger.error("Error resetting PIN in Tuya:", tuyaError);
        }
      }

      // Log the reset
      await connection.query(
        // Log with user level information
        await createSystemLog(
          "enrollment_reset",
          { id: resetBy, role: req.user?.role || null },
          {
            details: {
              enrollmentId,
              enrollmentType: enrollment.enrollment_type,
            },
            connection: connection,
          }
        )
      );

      await connection.commit();

      logger.info("Enrollment reset", { enrollmentId, resetBy });

      res.json({
        success: true,
        message: "Enrollment reset successfully",
      });
    } catch (error) {
      await connection.rollback();
      logger.error("Error resetting enrollment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to reset enrollment",
      });
    } finally {
      connection.release();
    }
  }

  // Delete enrollment (Admin or user before approval)
  async deleteEnrollment(req, res) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const { enrollmentId } = req.params;
      const requesterId = req.user.id;

      const [enrollments] = await connection.query(
        "SELECT * FROM enrollments WHERE id = ?",
        [enrollmentId]
      );

      if (enrollments.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Enrollment not found",
        });
      }

      const enrollment = enrollments[0];

      // Only admin can delete enrollments
      if (req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Only admins can delete enrollments",
        });
      }

      // Delete from Tuya if synced
      if (enrollment.tuya_unlock_id && enrollment.status === "synced") {
        try {
          await tuyaIntegration.deleteUserEnrollment(
            enrollment.user_id,
            enrollment.enrollment_type
          );
        } catch (tuyaError) {
          logger.error("Error deleting from Tuya:", tuyaError);
          // Continue with deletion even if Tuya fails
        }
      }

      // Delete from MySQL
      await connection.query("DELETE FROM enrollments WHERE id = ?", [
        enrollmentId,
      ]);

      await connection.commit();

      logger.info("Enrollment deleted", { enrollmentId, requesterId });

      res.json({
        success: true,
        message: "Enrollment deleted successfully",
      });
    } catch (error) {
      await connection.rollback();
      logger.error("Error deleting enrollment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete enrollment",
      });
    } finally {
      connection.release();
    }
  }
}

module.exports = new EnrollmentController();
