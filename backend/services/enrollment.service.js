const db = require("../models/mysql.models");
const tuyaService = require("./tuya.service");
const fabricService = require("./fabric.service");
const logger = require("../utils/logger");

class EnrollmentService {
  // Create enrollment request
  async createEnrollmentRequest(userId, enrollmentType, enrollmentData) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Validate enrollment type
      const validTypes = ["fingerprint", "rfid", "pin"];
      if (!validTypes.includes(enrollmentType)) {
        throw new Error("Invalid enrollment type");
      }

      // Check if user exists
      const [users] = await connection.query(
        "SELECT * FROM users WHERE id = ?",
        [userId]
      );

      if (users.length === 0) {
        throw new Error("User not found");
      }

      // Insert enrollment request
      const [result] = await connection.query(
        `INSERT INTO enrollment_requests 
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

      // Log system activity
      await connection.query(
        `INSERT INTO system_logs 
                (event_type, event_description, user_id, metadata, fabric_tx_id) 
                VALUES (?, ?, ?, ?, ?)`,
        [
          "enrollment_requested",
          `User ${userId} requested ${enrollmentType} enrollment`,
          userId,
          JSON.stringify({ enrollmentId, enrollmentType }),
          fabricResult?.txId || null,
        ]
      );

      await connection.commit();

      logger.info("Enrollment request created", {
        enrollmentId,
        userId,
        enrollmentType,
      });

      return {
        enrollmentId,
        userId,
        enrollmentType,
        status: "pending",
        fabricTxId: fabricResult?.txId,
      };
    } catch (error) {
      await connection.rollback();
      logger.error("Error creating enrollment request:", error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Approve enrollment
  async approveEnrollment(enrollmentId, approverId) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Get enrollment request
      const [enrollments] = await connection.query(
        "SELECT * FROM enrollment_requests WHERE id = ?",
        [enrollmentId]
      );

      if (enrollments.length === 0) {
        throw new Error("Enrollment request not found");
      }

      const enrollment = enrollments[0];

      if (enrollment.status !== "pending") {
        throw new Error(`Enrollment is already ${enrollment.status}`);
      }

      // Check approver has permission via Fabric
      const permission = await fabricService.checkAccessPermission(
        approverId,
        "approve_enrollment"
      );

      if (!permission.allowed) {
        throw new Error("Approver does not have permission");
      }

      // Approve on Hyperledger Fabric
      const fabricResult = await fabricService.approveEnrollment(
        enrollmentId,
        approverId
      );

      // Update enrollment status
      await connection.query(
        `UPDATE enrollment_requests 
                SET status = 'approved', approved_by = ?, approved_at = NOW() 
                WHERE id = ?`,
        [approverId, enrollmentId]
      );

      // For PIN enrollment, create in Tuya
      if (enrollment.enrollment_type === "pin") {
        try {
          const enrollmentData = JSON.parse(enrollment.enrollment_data);
          const deviceInfo = await tuyaService.getDeviceInfo();

          const passwordData = {
            password: enrollmentData.pin,
            name: enrollmentData.name || `User_${enrollment.user_id}`,
            type: "permanent",
            startTime: Math.floor(Date.now() / 1000),
            endTime: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year
          };

          const tuyaResult = await tuyaService.createTempPassword(passwordData);

          // Update with Tuya password ID
          await connection.query(
            "UPDATE enrollment_requests SET tuya_unlock_id = ?, enrolled_at = NOW() WHERE id = ?",
            [tuyaResult.password_id, enrollmentId]
          );

          logger.info("PIN created in Tuya", {
            enrollmentId,
            passwordId: tuyaResult.password_id,
          });
        } catch (tuyaError) {
          logger.error("Error creating PIN in Tuya:", tuyaError);
          // Don't fail the approval, just log the error
        }
      }

      // Log activity
      await connection.query(
        `INSERT INTO system_logs 
                (event_type, event_description, user_id, metadata, fabric_tx_id) 
                VALUES (?, ?, ?, ?, ?)`,
        [
          "enrollment_approved",
          `Enrollment ${enrollmentId} approved by admin ${approverId}`,
          enrollment.user_id,
          JSON.stringify({ enrollmentId, approverId }),
          fabricResult?.txId || null,
        ]
      );

      await connection.commit();

      logger.info("Enrollment approved", { enrollmentId, approverId });

      return {
        enrollmentId,
        status: "approved",
        fabricTxId: fabricResult?.txId,
        requiresPhysicalEnrollment: ["fingerprint", "rfid"].includes(
          enrollment.enrollment_type
        ),
      };
    } catch (error) {
      await connection.rollback();
      logger.error("Error approving enrollment:", error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Reject enrollment
  async rejectEnrollment(enrollmentId, rejecterId, reason) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Get enrollment
      const [enrollments] = await connection.query(
        "SELECT * FROM enrollment_requests WHERE id = ?",
        [enrollmentId]
      );

      if (enrollments.length === 0) {
        throw new Error("Enrollment request not found");
      }

      const enrollment = enrollments[0];

      if (enrollment.status !== "pending") {
        throw new Error(`Enrollment is already ${enrollment.status}`);
      }

      // Reject on Fabric
      const fabricResult = await fabricService.rejectEnrollment(
        enrollmentId,
        rejecterId,
        reason || "No reason provided"
      );

      // Update enrollment
      await connection.query(
        `UPDATE enrollment_requests 
                SET status = 'rejected', approved_by = ?, approved_at = NOW() 
                WHERE id = ?`,
        [rejecterId, enrollmentId]
      );

      // Log activity
      await connection.query(
        `INSERT INTO system_logs 
                (event_type, event_description, user_id, metadata, fabric_tx_id) 
                VALUES (?, ?, ?, ?, ?)`,
        [
          "enrollment_rejected",
          `Enrollment ${enrollmentId} rejected: ${reason}`,
          enrollment.user_id,
          JSON.stringify({ enrollmentId, rejecterId, reason }),
          fabricResult?.txId || null,
        ]
      );

      await connection.commit();

      logger.info("Enrollment rejected", { enrollmentId, rejecterId, reason });

      return {
        enrollmentId,
        status: "rejected",
        reason,
        fabricTxId: fabricResult?.txId,
      };
    } catch (error) {
      await connection.rollback();
      logger.error("Error rejecting enrollment:", error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Sync physical enrollment (after on-site fingerprint/RFID enrollment)
  async syncPhysicalEnrollment(enrollmentId, tuyaUnlockId) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Get enrollment
      const [enrollments] = await connection.query(
        "SELECT * FROM enrollment_requests WHERE id = ?",
        [enrollmentId]
      );

      if (enrollments.length === 0) {
        throw new Error("Enrollment not found");
      }

      const enrollment = enrollments[0];

      if (enrollment.status !== "approved") {
        throw new Error("Enrollment must be approved first");
      }

      // Sync with Tuya to get latest unlocking methods
      const tuyaCode = tuyaService._mapEnrollmentTypeToCode(
        enrollment.enrollment_type
      );
      await tuyaService.syncUnlockingMethods(tuyaCode);

      // Update enrollment with Tuya unlock ID
      await connection.query(
        `UPDATE enrollment_requests 
                SET tuya_unlock_id = ?, enrolled_at = NOW() 
                WHERE id = ?`,
        [tuyaUnlockId, enrollmentId]
      );

      // Log activity
      await connection.query(
        `INSERT INTO system_logs 
                (event_type, event_description, user_id, metadata) 
                VALUES (?, ?, ?, ?)`,
        [
          "physical_enrollment_synced",
          `Physical enrollment ${enrollmentId} synced with Tuya`,
          enrollment.user_id,
          JSON.stringify({ enrollmentId, tuyaUnlockId }),
        ]
      );

      await connection.commit();

      logger.info("Physical enrollment synced", {
        enrollmentId,
        tuyaUnlockId,
      });

      return {
        enrollmentId,
        tuyaUnlockId,
        status: "enrolled",
      };
    } catch (error) {
      await connection.rollback();
      logger.error("Error syncing physical enrollment:", error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get pending enrollments
  async getPendingEnrollments() {
    try {
      const [enrollments] = await db.query(
        `SELECT er.*, u.username, u.email 
                FROM enrollment_requests er
                JOIN users u ON er.user_id = u.id
                WHERE er.status = 'pending'
                ORDER BY er.created_at DESC`
      );

      return enrollments;
    } catch (error) {
      logger.error("Error fetching pending enrollments:", error);
      throw error;
    }
  }

  // Get user's enrollments
  async getUserEnrollments(userId) {
    try {
      const [enrollments] = await db.query(
        `SELECT er.*, a.username as approver_name
                FROM enrollment_requests er
                LEFT JOIN users a ON er.approved_by = a.id
                WHERE er.user_id = ?
                ORDER BY er.created_at DESC`,
        [userId]
      );

      return enrollments;
    } catch (error) {
      logger.error("Error fetching user enrollments:", error);
      throw error;
    }
  }

  // Delete enrollment
  async deleteEnrollment(enrollmentId, requesterId) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Get enrollment
      const [enrollments] = await connection.query(
        "SELECT * FROM enrollment_requests WHERE id = ?",
        [enrollmentId]
      );

      if (enrollments.length === 0) {
        throw new Error("Enrollment not found");
      }

      const enrollment = enrollments[0];

      // If already enrolled, delete from Tuya as well
      if (enrollment.tuya_unlock_id) {
        try {
          if (enrollment.enrollment_type === "pin") {
            await tuyaService.deleteTempPassword(enrollment.tuya_unlock_id);
          } else {
            await tuyaService.deleteUnlockMethod(
              enrollment.enrollment_type,
              enrollment.tuya_unlock_id,
              "home_user",
              enrollment.user_id
            );
          }
        } catch (tuyaError) {
          logger.error("Error deleting from Tuya:", tuyaError);
          // Continue with deletion even if Tuya fails
        }
      }

      // Delete from MySQL
      await connection.query("DELETE FROM enrollment_requests WHERE id = ?", [
        enrollmentId,
      ]);

      // Log activity
      await connection.query(
        `INSERT INTO system_logs 
                (event_type, event_description, user_id, metadata) 
                VALUES (?, ?, ?, ?)`,
        [
          "enrollment_deleted",
          `Enrollment ${enrollmentId} deleted`,
          requesterId,
          JSON.stringify({ enrollmentId, userId: enrollment.user_id }),
        ]
      );

      await connection.commit();

      logger.info("Enrollment deleted", { enrollmentId, requesterId });

      return { success: true };
    } catch (error) {
      await connection.rollback();
      logger.error("Error deleting enrollment:", error);
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = new EnrollmentService();
