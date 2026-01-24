"use strict";

const { Contract } = require("fabric-contract-api");

class DoorLockContract extends Contract {
  // Initialize the ledger
  async initLedger(ctx) {
    console.info("============= START : Initialize Ledger ===========");
    const initialData = {
      initialized: true,
      timestamp: new Date().toISOString(),
    };
    await ctx.stub.putState("INIT", Buffer.from(JSON.stringify(initialData)));
    console.info("============= END : Initialize Ledger ===========");
  }

  // Register a new user in the blockchain
  async registerUser(ctx, userId, username, email, role, fabricIdentity) {
    console.info("============= START : Register User ===========");

    // Get caller identity
    const clientIdentity = ctx.clientIdentity;
    const callerMSPID = clientIdentity.getMSPID();
    const callerID = clientIdentity.getID();

    // Check if caller has admin role
    const callerRole = await this._getCallerRole(ctx, callerID);
    if (callerRole !== "admin" && callerRole !== "system") {
      throw new Error("Only admins can register users");
    }

    const user = {
      userId,
      username,
      email,
      role,
      fabricIdentity,
      mspId: callerMSPID,
      registeredBy: callerID,
      registeredAt: new Date().toISOString(),
      isActive: true,
      permissions: this._getDefaultPermissions(role),
    };

    await ctx.stub.putState(
      `USER_${userId}`,
      Buffer.from(JSON.stringify(user))
    );

    // Emit event
    ctx.stub.setEvent(
      "UserRegistered",
      Buffer.from(
        JSON.stringify({
          userId,
          username,
          timestamp: user.registeredAt,
        })
      )
    );

    console.info("============= END : Register User ===========");
    return JSON.stringify(user);
  }

  // Request enrollment approval
  async requestEnrollment(
    ctx,
    enrollmentId,
    userId,
    enrollmentType,
    enrollmentData
  ) {
    console.info("============= START : Request Enrollment ===========");

    // Verify user exists
    const userBytes = await ctx.stub.getState(`USER_${userId}`);
    if (!userBytes || userBytes.length === 0) {
      throw new Error(`User ${userId} does not exist`);
    }

    const user = JSON.parse(userBytes.toString());

    // Check if user is active
    if (!user.isActive) {
      throw new Error("User account is not active");
    }

    const enrollment = {
      enrollmentId,
      userId,
      username: user.username,
      enrollmentType,
      enrollmentData,
      status: "pending",
      requestedAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
    };

    await ctx.stub.putState(
      `ENROLLMENT_${enrollmentId}`,
      Buffer.from(JSON.stringify(enrollment))
    );

    // Emit event
    ctx.stub.setEvent(
      "EnrollmentRequested",
      Buffer.from(
        JSON.stringify({
          enrollmentId,
          userId,
          enrollmentType,
          timestamp: enrollment.requestedAt,
        })
      )
    );

    console.info("============= END : Request Enrollment ===========");
    return JSON.stringify(enrollment);
  }

  // Approve enrollment request
  async approveEnrollment(ctx, enrollmentId, approverId) {
    console.info("============= START : Approve Enrollment ===========");

    // Get enrollment
    const enrollmentBytes = await ctx.stub.getState(
      `ENROLLMENT_${enrollmentId}`
    );
    if (!enrollmentBytes || enrollmentBytes.length === 0) {
      throw new Error(`Enrollment ${enrollmentId} does not exist`);
    }

    const enrollment = JSON.parse(enrollmentBytes.toString());

    // Verify approver exists and has permission
    const approverBytes = await ctx.stub.getState(`USER_${approverId}`);
    if (!approverBytes || approverBytes.length === 0) {
      throw new Error(`Approver ${approverId} does not exist`);
    }

    const approver = JSON.parse(approverBytes.toString());
    if (!approver.permissions.canApproveEnrollment) {
      throw new Error(
        "Approver does not have permission to approve enrollments"
      );
    }

    // Check if already approved or rejected
    if (enrollment.status !== "pending") {
      throw new Error(`Enrollment is already ${enrollment.status}`);
    }

    // Update enrollment
    enrollment.status = "approved";
    enrollment.approvedBy = approverId;
    enrollment.approverUsername = approver.username;
    enrollment.approvedAt = new Date().toISOString();

    await ctx.stub.putState(
      `ENROLLMENT_${enrollmentId}`,
      Buffer.from(JSON.stringify(enrollment))
    );

    // Emit event
    ctx.stub.setEvent(
      "EnrollmentApproved",
      Buffer.from(
        JSON.stringify({
          enrollmentId,
          userId: enrollment.userId,
          approvedBy: approverId,
          timestamp: enrollment.approvedAt,
        })
      )
    );

    console.info("============= END : Approve Enrollment ===========");
    return JSON.stringify(enrollment);
  }

  // Reject enrollment request
  async rejectEnrollment(ctx, enrollmentId, rejecterId, reason) {
    console.info("============= START : Reject Enrollment ===========");

    const enrollmentBytes = await ctx.stub.getState(
      `ENROLLMENT_${enrollmentId}`
    );
    if (!enrollmentBytes || enrollmentBytes.length === 0) {
      throw new Error(`Enrollment ${enrollmentId} does not exist`);
    }

    const enrollment = JSON.parse(enrollmentBytes.toString());

    // Verify rejecter has permission
    const rejecterBytes = await ctx.stub.getState(`USER_${rejecterId}`);
    if (!rejecterBytes || rejecterBytes.length === 0) {
      throw new Error(`Rejecter ${rejecterId} does not exist`);
    }

    const rejecter = JSON.parse(rejecterBytes.toString());
    if (!rejecter.permissions.canApproveEnrollment) {
      throw new Error("User does not have permission to reject enrollments");
    }

    if (enrollment.status !== "pending") {
      throw new Error(`Enrollment is already ${enrollment.status}`);
    }

    enrollment.status = "rejected";
    enrollment.rejectedBy = rejecterId;
    enrollment.rejecterUsername = rejecter.username;
    enrollment.rejectedAt = new Date().toISOString();
    enrollment.rejectionReason = reason;

    await ctx.stub.putState(
      `ENROLLMENT_${enrollmentId}`,
      Buffer.from(JSON.stringify(enrollment))
    );

    ctx.stub.setEvent(
      "EnrollmentRejected",
      Buffer.from(
        JSON.stringify({
          enrollmentId,
          userId: enrollment.userId,
          rejectedBy: rejecterId,
          timestamp: enrollment.rejectedAt,
        })
      )
    );

    console.info("============= END : Reject Enrollment ===========");
    return JSON.stringify(enrollment);
  }

  // Check access permission
  async checkAccessPermission(ctx, userId, accessType) {
    console.info("============= START : Check Access Permission ===========");

    // Get user
    const userBytes = await ctx.stub.getState(`USER_${userId}`);
    if (!userBytes || userBytes.length === 0) {
      throw new Error(`User ${userId} does not exist`);
    }

    const user = JSON.parse(userBytes.toString());

    // Check if user is active
    if (!user.isActive) {
      return JSON.stringify({
        allowed: false,
        reason: "User account is not active",
      });
    }

    // Check permissions based on access type
    let allowed = false;
    switch (accessType) {
      case "unlock":
        allowed = user.permissions.canUnlock;
        break;
      case "lock":
        allowed = user.permissions.canLock;
        break;
      case "remote_unlock":
        allowed = user.permissions.canRemoteUnlock;
        break;
      case "approve_enrollment":
        allowed = user.permissions.canApproveEnrollment;
        break;
      default:
        allowed = false;
    }

    const result = {
      allowed,
      userId: user.userId,
      username: user.username,
      role: user.role,
      accessType,
      checkedAt: new Date().toISOString(),
    };

    if (!allowed) {
      result.reason = `User does not have permission for ${accessType}`;
    }

    console.info("============= END : Check Access Permission ===========");
    return JSON.stringify(result);
  }

  // Log access attempt
  async logAccess(
    ctx,
    accessLogId,
    userId,
    accessMethod,
    accessType,
    success,
    metadata
  ) {
    console.info("============= START : Log Access ===========");

    // Get caller identity information (Hyperledger Fabric best practice)
    const clientIdentity = ctx.clientIdentity;
    const callerMSPID = clientIdentity.getMSPID();
    const callerID = clientIdentity.getID();
    
    // Try to get caller role from attributes or user record
    let callerRole = null;
    try {
      // Try to get role from certificate attributes
      callerRole = clientIdentity.getAttributeValue("role");
    } catch (err) {
      // If attribute not found, try to get from user record
      try {
        callerRole = await this._getCallerRole(ctx, callerID);
      } catch (err2) {
        console.warn("Could not determine caller role:", err2);
      }
    }

    // Get X.509 certificate information
    let certificateInfo = null;
    try {
      const cert = clientIdentity.getX509Certificate();
      if (cert) {
        certificateInfo = {
          subject: cert.subject.toString(),
          issuer: cert.issuer.toString(),
          serialNumber: cert.serialNumber,
          validFrom: cert.validFrom,
          validTo: cert.validTo,
        };
      }
    } catch (err) {
      console.warn("Could not extract certificate information:", err);
    }

    const accessLog = {
      accessLogId,
      userId,
      accessMethod,
      accessType,
      success,
      metadata: metadata || {},
      txId: ctx.stub.getTxID(),
      timestamp: new Date().toISOString(),
      // User identity information (Hyperledger Fabric best practice)
      mspId: callerMSPID,
      callerId: callerID,
      callerRole: callerRole || "unknown",
      certificateInfo: certificateInfo,
      // Transaction creator information
      creator: {
        mspId: callerMSPID,
        role: callerRole,
        id: callerID,
      },
    };

    await ctx.stub.putState(
      `ACCESS_LOG_${accessLogId}`,
      Buffer.from(JSON.stringify(accessLog))
    );

    // Emit event with user level information
    ctx.stub.setEvent(
      "AccessLogged",
      Buffer.from(
        JSON.stringify({
          accessLogId,
          userId,
          success,
          timestamp: accessLog.timestamp,
          callerRole: callerRole,
          mspId: callerMSPID,
        })
      )
    );

    console.info("============= END : Log Access ===========");
    return JSON.stringify(accessLog);
  }

  // Get user by ID
  async getUser(ctx, userId) {
    const userBytes = await ctx.stub.getState(`USER_${userId}`);
    if (!userBytes || userBytes.length === 0) {
      throw new Error(`User ${userId} does not exist`);
    }
    return userBytes.toString();
  }

  // Get enrollment by ID
  async getEnrollment(ctx, enrollmentId) {
    const enrollmentBytes = await ctx.stub.getState(
      `ENROLLMENT_${enrollmentId}`
    );
    if (!enrollmentBytes || enrollmentBytes.length === 0) {
      throw new Error(`Enrollment ${enrollmentId} does not exist`);
    }
    return enrollmentBytes.toString();
  }

  // Get all pending enrollments
  async getPendingEnrollments(ctx) {
    const startKey = "ENROLLMENT_";
    const endKey = "ENROLLMENT_~";
    const iterator = await ctx.stub.getStateByRange(startKey, endKey);

    const pendingEnrollments = [];
    let result = await iterator.next();

    while (!result.done) {
      if (result.value && result.value.value.toString()) {
        try {
          const enrollment = JSON.parse(result.value.value.toString("utf8"));
          if (enrollment.status === "pending") {
            pendingEnrollments.push(enrollment);
          }
        } catch (err) {
          console.error("Error parsing enrollment:", err);
        }
      }
      result = await iterator.next();
    }

    await iterator.close();
    return JSON.stringify(pendingEnrollments);
  }

  // Get access logs for a user
  async getAccessLogs(ctx, userId, startDate, endDate) {
    const startKey = "ACCESS_LOG_";
    const endKey = "ACCESS_LOG_~";
    const iterator = await ctx.stub.getStateByRange(startKey, endKey);

    const logs = [];
    let result = await iterator.next();

    while (!result.done) {
      if (result.value && result.value.value.toString()) {
        try {
          const log = JSON.parse(result.value.value.toString("utf8"));
          if (log.userId === userId) {
            if (startDate && log.timestamp < startDate) {
              result = await iterator.next();
              continue;
            }
            if (endDate && log.timestamp > endDate) {
              result = await iterator.next();
              continue;
            }
            logs.push(log);
          }
        } catch (err) {
          console.error("Error parsing log:", err);
        }
      }
      result = await iterator.next();
    }

    await iterator.close();
    return JSON.stringify(logs);
  }

  // Update user permissions
  async updateUserPermissions(ctx, userId, permissions, updaterId) {
    console.info("============= START : Update User Permissions ===========");

    // Verify updater has admin role
    const updaterBytes = await ctx.stub.getState(`USER_${updaterId}`);
    if (!updaterBytes || updaterBytes.length === 0) {
      throw new Error(`Updater ${updaterId} does not exist`);
    }

    const updater = JSON.parse(updaterBytes.toString());
    if (updater.role !== "admin") {
      throw new Error("Only admins can update user permissions");
    }

    // Get user
    const userBytes = await ctx.stub.getState(`USER_${userId}`);
    if (!userBytes || userBytes.length === 0) {
      throw new Error(`User ${userId} does not exist`);
    }

    const user = JSON.parse(userBytes.toString());
    user.permissions = { ...user.permissions, ...JSON.parse(permissions) };
    user.updatedBy = updaterId;
    user.updatedAt = new Date().toISOString();

    await ctx.stub.putState(
      `USER_${userId}`,
      Buffer.from(JSON.stringify(user))
    );

    ctx.stub.setEvent(
      "PermissionsUpdated",
      Buffer.from(
        JSON.stringify({
          userId,
          updatedBy: updaterId,
          timestamp: user.updatedAt,
        })
      )
    );

    console.info("============= END : Update User Permissions ===========");
    return JSON.stringify(user);
  }

  // Deactivate user
  async deactivateUser(ctx, userId, deactivatorId) {
    console.info("============= START : Deactivate User ===========");

    // Verify deactivator has admin role
    const deactivatorBytes = await ctx.stub.getState(`USER_${deactivatorId}`);
    if (!deactivatorBytes || deactivatorBytes.length === 0) {
      throw new Error(`Deactivator ${deactivatorId} does not exist`);
    }

    const deactivator = JSON.parse(deactivatorBytes.toString());
    if (deactivator.role !== "admin") {
      throw new Error("Only admins can deactivate users");
    }

    // Get user
    const userBytes = await ctx.stub.getState(`USER_${userId}`);
    if (!userBytes || userBytes.length === 0) {
      throw new Error(`User ${userId} does not exist`);
    }

    const user = JSON.parse(userBytes.toString());
    user.isActive = false;
    user.deactivatedBy = deactivatorId;
    user.deactivatedAt = new Date().toISOString();

    await ctx.stub.putState(
      `USER_${userId}`,
      Buffer.from(JSON.stringify(user))
    );

    ctx.stub.setEvent(
      "UserDeactivated",
      Buffer.from(
        JSON.stringify({
          userId,
          deactivatedBy: deactivatorId,
          timestamp: user.deactivatedAt,
        })
      )
    );

    console.info("============= END : Deactivate User ===========");
    return JSON.stringify(user);
  }

  // Helper: Get default permissions based on role
  _getDefaultPermissions(role) {
    switch (role) {
      case "admin":
        return {
          canUnlock: true,
          canLock: true,
          canRemoteUnlock: true,
          canApproveEnrollment: true,
          canManageSchedules: true,
          canViewLogs: true,
          canManageUsers: true,
        };
      case "user":
        return {
          canUnlock: true,
          canLock: true,
          canRemoteUnlock: false,
          canApproveEnrollment: false,
          canManageSchedules: false,
          canViewLogs: false,
          canManageUsers: false,
        };
      case "visitor":
        return {
          canUnlock: true,
          canLock: false,
          canRemoteUnlock: false,
          canApproveEnrollment: false,
          canManageSchedules: false,
          canViewLogs: false,
          canManageUsers: false,
        };
      default:
        return {
          canUnlock: false,
          canLock: false,
          canRemoteUnlock: false,
          canApproveEnrollment: false,
          canManageSchedules: false,
          canViewLogs: false,
          canManageUsers: false,
        };
    }
  }

  // Get all blockchain activities (access logs, enrollments, user registrations, etc.)
  async getAllActivities(ctx, startDate, endDate, limit) {
    console.info("============= START : Get All Activities ===========");

    const activities = [];
    const maxLimit = limit ? parseInt(limit) : 1000;

    // Get all access logs
    const accessLogStartKey = "ACCESS_LOG_";
    const accessLogEndKey = "ACCESS_LOG_~";
    const accessLogIterator = await ctx.stub.getStateByRange(accessLogStartKey, accessLogEndKey);
    let result = await accessLogIterator.next();

    while (!result.done && activities.length < maxLimit) {
      if (result.value && result.value.value.toString()) {
        try {
          const log = JSON.parse(result.value.value.toString("utf8"));
          if (startDate && log.timestamp < startDate) {
            result = await accessLogIterator.next();
            continue;
          }
          if (endDate && log.timestamp > endDate) {
            result = await accessLogIterator.next();
            continue;
          }
          activities.push({
            type: "access_log",
            activityType: log.success ? "Access Granted" : "Access Denied",
            id: log.accessLogId,
            userId: log.userId,
            timestamp: log.timestamp,
            txId: log.txId,
            details: {
              accessMethod: log.accessMethod,
              accessType: log.accessType,
              success: log.success,
              metadata: log.metadata,
            },
          });
        } catch (err) {
          console.error("Error parsing access log:", err);
        }
      }
      result = await accessLogIterator.next();
    }
    await accessLogIterator.close();

    // Get all enrollments
    const enrollmentStartKey = "ENROLLMENT_";
    const enrollmentEndKey = "ENROLLMENT_~";
    const enrollmentIterator = await ctx.stub.getStateByRange(enrollmentStartKey, enrollmentEndKey);
    result = await enrollmentIterator.next();

    while (!result.done && activities.length < maxLimit) {
      if (result.value && result.value.value.toString()) {
        try {
          const enrollment = JSON.parse(result.value.value.toString("utf8"));
          if (startDate && enrollment.requestedAt < startDate) {
            result = await enrollmentIterator.next();
            continue;
          }
          if (endDate && enrollment.requestedAt > endDate) {
            result = await enrollmentIterator.next();
            continue;
          }
          let activityType = "Enrollment Requested";
          if (enrollment.status === "approved") {
            activityType = "Enrollment Approved";
          } else if (enrollment.status === "rejected") {
            activityType = "Enrollment Rejected";
          }
          activities.push({
            type: "enrollment",
            activityType,
            id: enrollment.enrollmentId,
            userId: enrollment.userId,
            timestamp: enrollment.status === "approved" ? enrollment.approvedAt : 
                      enrollment.status === "rejected" ? enrollment.rejectedAt : 
                      enrollment.requestedAt,
            txId: null, // Enrollments don't store txId directly
            details: {
              enrollmentType: enrollment.enrollmentType,
              status: enrollment.status,
              approvedBy: enrollment.approvedBy,
              rejectedBy: enrollment.rejectedBy,
            },
          });
        } catch (err) {
          console.error("Error parsing enrollment:", err);
        }
      }
      result = await enrollmentIterator.next();
    }
    await enrollmentIterator.close();

    // Get user registrations (only recent ones based on registeredAt)
    const userStartKey = "USER_";
    const userEndKey = "USER_~";
    const userIterator = await ctx.stub.getStateByRange(userStartKey, userEndKey);
    result = await userIterator.next();

    while (!result.done && activities.length < maxLimit) {
      if (result.value && result.value.value.toString()) {
        try {
          const user = JSON.parse(result.value.value.toString("utf8"));
          if (user.registeredAt) {
            if (startDate && user.registeredAt < startDate) {
              result = await userIterator.next();
              continue;
            }
            if (endDate && user.registeredAt > endDate) {
              result = await userIterator.next();
              continue;
            }
            activities.push({
              type: "user_registration",
              activityType: "User Registered",
              id: user.userId,
              userId: user.userId,
              timestamp: user.registeredAt,
              txId: null,
              details: {
                username: user.username,
                email: user.email,
                role: user.role,
                registeredBy: user.registeredBy,
              },
            });
          }
        } catch (err) {
          console.error("Error parsing user:", err);
        }
      }
      result = await userIterator.next();
    }
    await userIterator.close();

    // Sort by timestamp (newest first)
    activities.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });

    // Limit results
    const limitedActivities = activities.slice(0, maxLimit);

    console.info("============= END : Get All Activities ===========");
    return JSON.stringify(limitedActivities);
  }

  // Helper: Get caller role
  async _getCallerRole(ctx, callerId) {
    try {
      const iterator = await ctx.stub.getStateByRange("USER_", "USER_~");
      let result = await iterator.next();

      while (!result.done) {
        if (result.value && result.value.value.toString()) {
          const user = JSON.parse(result.value.value.toString("utf8"));
          if (user.fabricIdentity === callerId) {
            await iterator.close();
            return user.role;
          }
        }
        result = await iterator.next();
      }

      await iterator.close();
      return "system";
    } catch (error) {
      console.error("Error getting caller role:", error);
      return "system";
    }
  }
}

module.exports = DoorLockContract;
