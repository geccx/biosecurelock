const db = require("../models/mysql.models");
const tuyaService = require("../services/tuya.service");
const logger = require("../utils/logger");
const { formatDateForMySQLManila } = require("../utils/timezone.utils");

/**
 * Get all password requests (admin and techsupport only)
 */
exports.getPasswordRequests = async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT pr.*, 
             ls.lab_name, ls.start_time as schedule_start_time, ls.end_time as schedule_end_time,
             u.username as user_name, u.email as user_email,
             approver.username as approved_by_name
      FROM password_requests pr
      LEFT JOIN lab_schedules ls ON pr.schedule_id = ls.id
      LEFT JOIN users u ON pr.user_id = u.id
      LEFT JOIN users approver ON pr.approved_by = approver.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += " AND pr.status = ?";
      params.push(status);
    }

    query += " ORDER BY pr.created_at DESC";

    const [requests] = await db.query(query, params);

    res.json({
      success: true,
      data: requests.map((r) => ({
        id: r.id,
        scheduleId: r.schedule_id,
        userId: r.user_id,
        tuyaUserId: r.tuya_user_id,
        passwordName: r.password_name,
        password: r.password,
        validFrom: r.valid_from,
        validUntil: r.valid_until,
        maxUsage: r.max_usage,
        phone: r.phone,
        timeZone: r.time_zone,
        scheduleList: r.schedule_list ? JSON.parse(r.schedule_list) : null,
        relateDevList: r.relate_dev_list,
        status: r.status,
        approvedBy: r.approved_by,
        approvedByName: r.approved_by_name,
        approvedAt: r.approved_at,
        rejectedReason: r.rejected_reason,
        tuyaPasswordId: r.tuya_password_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        // Schedule info
        labName: r.lab_name,
        scheduleStartTime: r.schedule_start_time,
        scheduleEndTime: r.schedule_end_time,
        // User info
        userName: r.user_name,
        userEmail: r.user_email,
      })),
    });
  } catch (error) {
    logger.error("Error fetching password requests:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch password requests",
    });
  }
};

/**
 * Approve a password request and create the temporary password in Tuya
 */
exports.approvePasswordRequest = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { requestId } = req.params;
    const approvedBy = req.user.id;

    // Get password request with user info
    const [requests] = await connection.query(
      `SELECT pr.*, u.tuya_user_id as user_tuya_id
       FROM password_requests pr
       LEFT JOIN users u ON pr.user_id = u.id
       WHERE pr.id = ? AND pr.status = 'pending'`,
      [requestId]
    );

    if (requests.length === 0) {
      await connection.rollback();
      logger.warn("Password request not found or not pending", {
        requestId,
        status: "not found or not pending",
      });
      return res.status(404).json({
        success: false,
        error: "Pending password request not found",
      });
    }

    const request = requests[0];

    logger.info("Found password request to approve", {
      requestId,
      scheduleId: request.schedule_id,
      userId: request.user_id,
      passwordName: request.password_name,
      currentStatus: request.status,
    });
    const tuyaUserId = request.tuya_user_id || request.user_tuya_id;

    if (!tuyaUserId) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: "User is not linked to a Tuya device",
      });
    }

    // Prepare data for Tuya API
    // The createTempPassword service method automatically:
    // 1. Gets a password ticket (ticket_id and encrypted ticket_key)
    // 2. Decrypts ticket_key using Access Secret (AES-256-ECB)
    // 3. Encrypts the plain password using decrypted ticket_key (AES-128-ECB with PKCS7Padding)
    // 4. Creates the temporary password with ticket_id and encrypted password

    // Convert MySQL DATETIME to Unix timestamp (seconds)
    // request.valid_from and request.valid_until can be:
    // - Date objects (if MySQL driver returns Date objects)
    // - DATETIME strings from MySQL (YYYY-MM-DD HH:MM:SS)
    // - ISO strings

    let validFromDate, validUntilDate;

    // Handle different date formats from MySQL
    if (request.valid_from instanceof Date) {
      validFromDate = request.valid_from;
    } else if (typeof request.valid_from === "string") {
      validFromDate = new Date(request.valid_from);
    } else {
      await connection.rollback();
      logger.error("Invalid valid_from type in password request", {
        requestId,
        valid_from: request.valid_from,
        type: typeof request.valid_from,
      });
      return res.status(400).json({
        success: false,
        error: "Invalid date format in password request",
      });
    }

    if (request.valid_until instanceof Date) {
      validUntilDate = request.valid_until;
    } else if (typeof request.valid_until === "string") {
      validUntilDate = new Date(request.valid_until);
    } else {
      await connection.rollback();
      logger.error("Invalid valid_until type in password request", {
        requestId,
        valid_until: request.valid_until,
        type: typeof request.valid_until,
      });
      return res.status(400).json({
        success: false,
        error: "Invalid date format in password request",
      });
    }

    // Validate dates
    if (isNaN(validFromDate.getTime()) || isNaN(validUntilDate.getTime())) {
      await connection.rollback();
      logger.error("Invalid date values in password request", {
        requestId,
        valid_from: request.valid_from,
        valid_from_parsed: validFromDate,
        valid_until: request.valid_until,
        valid_until_parsed: validUntilDate,
      });
      return res.status(400).json({
        success: false,
        error: "Invalid date values in password request",
        details: {
          valid_from: request.valid_from,
          valid_until: request.valid_until,
        },
      });
    }

    // Log date conversion for debugging
    logger.info("Date conversion for password request", {
      requestId,
      valid_from_raw: request.valid_from,
      valid_from_type: typeof request.valid_from,
      valid_from_date: validFromDate.toISOString(),
      valid_from_timestamp: Math.floor(validFromDate.getTime() / 1000),
      valid_until_raw: request.valid_until,
      valid_until_type: typeof request.valid_until,
      valid_until_date: validUntilDate.toISOString(),
      valid_until_timestamp: Math.floor(validUntilDate.getTime() / 1000),
    });

    // Verify deviceId is set
    const deviceId = process.env.TUYA_DEVICE_ID;
    if (!deviceId) {
      await connection.rollback();
      logger.error("TUYA_DEVICE_ID not set in environment");
      return res.status(500).json({
        success: false,
        error: "TUYA_DEVICE_ID not configured",
      });
    }

    const passwordData = {
      name: request.password_name,
      password: request.password, // Plain password (6-7 digits) - will be encrypted automatically
      password_type: "ticket", // Uses ticket-based encryption (required)
      effective_time: Math.floor(validFromDate.getTime() / 1000), // Unix timestamp in seconds
      invalid_time: Math.floor(validUntilDate.getTime() / 1000), // Unix timestamp in seconds
      type: request.max_usage === 1 ? 1 : 0, // 1 = once, 0 = multiple uses
      deviceId: deviceId, // Required for createTempPassword
    };

    // Optional fields
    if (request.phone) {
      passwordData.phone = String(request.phone);
    }

    if (request.time_zone) {
      passwordData.time_zone = String(request.time_zone);
    }

    // Handle schedule_list - it's stored as JSON string in database
    if (request.schedule_list) {
      try {
        const scheduleList =
          typeof request.schedule_list === "string"
            ? JSON.parse(request.schedule_list)
            : request.schedule_list;
        if (Array.isArray(scheduleList) && scheduleList.length > 0) {
          passwordData.schedule_list = scheduleList;
        }
      } catch (parseError) {
        logger.warn("Failed to parse schedule_list:", parseError);
        // Continue without schedule_list if parsing fails
      }
    }

    // Handle relate_dev_list - convert comma-separated string to array if needed
    if (request.relate_dev_list) {
      if (typeof request.relate_dev_list === "string") {
        const devList = request.relate_dev_list
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0);
        if (devList.length > 0) {
          passwordData.relate_dev_list = devList;
        }
      } else if (Array.isArray(request.relate_dev_list)) {
        passwordData.relate_dev_list = request.relate_dev_list;
      }
    }

    // Call Tuya API to create temporary password
    let tuyaResult;
    try {
      logger.info("Calling Tuya API to create temporary password", {
        requestId,
        passwordData: {
          ...passwordData,
          password: "***REDACTED***", // Don't log plain password
        },
      });

      tuyaResult = await tuyaService.createTempPassword(passwordData);

      logger.info("Temporary password created in Tuya", {
        requestId,
        tuyaResult: tuyaResult
          ? {
              id: tuyaResult.id,
              password_id: tuyaResult.password_id,
              result: tuyaResult.result,
            }
          : null,
        fullResponse: JSON.stringify(tuyaResult, null, 2),
      });
    } catch (tuyaError) {
      await connection.rollback();
      logger.error("Failed to create password in Tuya:", {
        requestId,
        error: tuyaError.message,
        stack: tuyaError.stack,
        response: tuyaError.response?.data,
        status: tuyaError.response?.status,
      });
      return res.status(500).json({
        success: false,
        error: "Failed to create password in Tuya device",
        details: tuyaError.message || "Unknown error",
        tuyaError: tuyaError.response?.data || null,
      });
    }

    // Extract password ID from Tuya response
    // _makeRequest returns response.data.result directly, so tuyaResult is the result object
    // Structure: { id: "...", password_id: "...", ... } or just { id: "..." }
    // Check multiple possible fields in case the structure varies
    const tuyaPasswordId =
      tuyaResult?.password_id ||
      tuyaResult?.id ||
      (tuyaResult?.result &&
        (tuyaResult.result.password_id || tuyaResult.result.id)) ||
      null;

    logger.info("Extracting Tuya password ID from response", {
      requestId,
      tuyaResultType: typeof tuyaResult,
      tuyaResultKeys: tuyaResult ? Object.keys(tuyaResult) : [],
      hasPasswordId: !!tuyaResult?.password_id,
      hasId: !!tuyaResult?.id,
      hasResult: !!tuyaResult?.result,
      extractedId: tuyaPasswordId,
      fullResult: tuyaResult ? JSON.stringify(tuyaResult, null, 2) : null,
    });

    if (!tuyaPasswordId) {
      logger.warn(
        "Tuya API response did not include password ID - will still update status",
        {
          requestId,
          tuyaResult: tuyaResult ? JSON.stringify(tuyaResult, null, 2) : null,
        }
      );
      // Still update the status to approved even if we don't have the password ID
      // The password might have been created successfully but ID not returned
    }

    // Update password request status and save Tuya password ID
    const [updateResult] = await connection.query(
      `UPDATE password_requests 
       SET status = 'approved', 
           approved_by = ?, 
           approved_at = NOW(),
           tuya_password_id = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [approvedBy, tuyaPasswordId, requestId]
    );

    logger.info("Password request updated in database", {
      requestId,
      tuyaPasswordId,
      affectedRows: updateResult.affectedRows,
      changedRows: updateResult.changedRows,
    });

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      logger.error("No rows updated in password_requests table", {
        requestId,
        approvedBy,
        tuyaPasswordId,
      });
      return res.status(500).json({
        success: false,
        error: "Failed to update password request in database",
      });
    }

    await connection.commit();

    // Verify the update was successful by querying the record
    const [verifyRows] = await connection.query(
      `SELECT id, status, approved_by, approved_at, tuya_password_id, updated_at
       FROM password_requests 
       WHERE id = ?`,
      [requestId]
    );

    if (verifyRows.length > 0) {
      const updatedRecord = verifyRows[0];
      logger.info("Password request approved and verified in database", {
        requestId,
        approvedBy,
        tuyaPasswordId,
        savedStatus: updatedRecord.status,
        savedApprovedBy: updatedRecord.approved_by,
        savedTuyaPasswordId: updatedRecord.tuya_password_id,
        savedApprovedAt: updatedRecord.approved_at,
        savedUpdatedAt: updatedRecord.updated_at,
      });
    } else {
      logger.error(
        "Failed to verify password request update - record not found",
        {
          requestId,
        }
      );
    }

    res.json({
      success: true,
      message: "Password request approved and temporary password created",
      data: {
        requestId,
        tuyaPasswordId,
        status: "approved",
      },
    });
  } catch (error) {
    await connection.rollback();
    logger.error("Error approving password request:", error);
    res.status(500).json({
      success: false,
      error: "Failed to approve password request",
    });
  } finally {
    connection.release();
  }
};

/**
 * Reject a password request
 */
exports.rejectPasswordRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;
    const reviewedBy = req.user.id;

    // Get password request
    const [requests] = await db.query(
      "SELECT * FROM password_requests WHERE id = ? AND status = 'pending'",
      [requestId]
    );

    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Pending password request not found",
      });
    }

    // Update password request status
    await db.query(
      `UPDATE password_requests 
       SET status = 'rejected', 
           approved_by = ?, 
           approved_at = NOW(),
           rejected_reason = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [reviewedBy, reason || null, requestId]
    );

    logger.info("Password request rejected", { requestId, reviewedBy, reason });

    res.json({
      success: true,
      message: "Password request rejected",
    });
  } catch (error) {
    logger.error("Error rejecting password request:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reject password request",
    });
  }
};
