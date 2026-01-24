const db = require("../models/mysql.models");
const logger = require("../utils/logger");

class LabSchedulesController {
  // Create a new lab schedule
  async createSchedule(req, res) {
    const connection = await db.getConnection();
    
    try {
      const {
        labName,
        teacherId,
        startTime,
        endTime,
        subject,
        recurrenceType = "one-time",
        daysOfWeek = [],
        recurrenceEndDate
      } = req.body;

      // Validation for weekly schedules
      if (recurrenceType === "weekly" && daysOfWeek.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Please select at least one day of the week for weekly schedules"
        });
      }

      await connection.beginTransaction();

      // Get teacher name
      const [teachers] = await connection.query(
        "SELECT username FROM users WHERE id = ?",
        [teacherId]
      );
      const teacherName = teachers.length > 0 ? teachers[0].username : null;

      // For weekly schedules, store time as TIME type
      // For one-time schedules, store as DATETIME
      let finalStartTime, finalEndTime;
      
      if (recurrenceType === "weekly") {
        // Just store the time part (HH:MM:SS)
        finalStartTime = startTime.length === 5 ? `${startTime}:00` : startTime;
        finalEndTime = endTime.length === 5 ? `${endTime}:00` : endTime;
      } else {
        // Convert ISO string to MySQL datetime
        finalStartTime = new Date(startTime);
        finalEndTime = new Date(endTime);
      }

      const [result] = await connection.query(
        `INSERT INTO lab_schedules 
        (lab_name, teacher_id, teacher_name, start_time, end_time, subject, 
         recurrence_type, days_of_week, recurrence_end_date, status, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)`,
        [
          labName,
          teacherId,
          teacherName,
          finalStartTime,
          finalEndTime,
          subject || null,
          recurrenceType,
          JSON.stringify(daysOfWeek),
          recurrenceEndDate || null,
          req.user.id
        ]
      );

      await connection.commit();

      logger.info("Lab schedule created", {
        scheduleId: result.insertId,
        teacherId,
        recurrenceType
      });

      res.json({
        success: true,
        message: "Schedule created successfully",
        data: {
          id: result.insertId,
          labName,
          teacherId,
          teacherName,
          startTime,
          endTime,
          subject,
          recurrenceType,
          daysOfWeek,
          recurrenceEndDate,
          status: "scheduled"
        }
      });
    } catch (error) {
      await connection.rollback();
      logger.error("Error creating lab schedule:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create schedule"
      });
    } finally {
      connection.release();
    }
  }

  // Get all schedules with filters
  async getAllSchedules(req, res) {
    try {
      const {
        status,
        teacherId,
        labName,
        startDate,
        endDate,
        limit = 50,
        offset = 0
      } = req.query;

      let query = `
        SELECT 
          s.*,
          u.username as teacher_name
        FROM lab_schedules s
        LEFT JOIN users u ON s.teacher_id = u.id
        WHERE 1=1
      `;
      const params = [];

      // Apply filters
      if (status) {
        query += " AND s.status = ?";
        params.push(status);
      }

      if (teacherId) {
        query += " AND s.teacher_id = ?";
        params.push(teacherId);
      }

      if (labName) {
        query += " AND s.lab_name LIKE ?";
        params.push(`%${labName}%`);
      }

      // For date filtering, handle both one-time and weekly schedules
      if (startDate || endDate) {
        query += " AND (";
        query += " s.recurrence_type = 'weekly'"; // Include all weekly schedules
        
        if (startDate && endDate) {
          query += " OR (s.recurrence_type = 'one-time' AND s.start_time BETWEEN ? AND ?)";
          params.push(startDate, endDate);
        } else if (startDate) {
          query += " OR (s.recurrence_type = 'one-time' AND s.start_time >= ?)";
          params.push(startDate);
        } else if (endDate) {
          query += " OR (s.recurrence_type = 'one-time' AND s.start_time <= ?)";
          params.push(endDate);
        }
        
        query += ")";
      }

      // If user only has VIEW_OWN_SCHEDULES permission, filter by teacher
      if (!req.user.permissions.includes("view_all_schedules") && 
          req.user.permissions.includes("view_own_schedules")) {
        query += " AND s.teacher_id = ?";
        params.push(req.user.id);
      }

      query += " ORDER BY s.created_at DESC LIMIT ? OFFSET ?";
      params.push(parseInt(limit), parseInt(offset));

      const [schedules] = await db.query(query, params);

      // Format the response
      const formattedSchedules = schedules.map(schedule => ({
        id: schedule.id,
        labName: schedule.lab_name,
        teacherId: schedule.teacher_id,
        teacherName: schedule.teacher_name,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        subject: schedule.subject,
        status: schedule.status,
        recurrenceType: schedule.recurrence_type,
        daysOfWeek: schedule.days_of_week ? JSON.parse(schedule.days_of_week) : [],
        recurrenceEndDate: schedule.recurrence_end_date,
        createdBy: schedule.created_by,
        createdAt: schedule.created_at
      }));

      res.json({
        success: true,
        data: formattedSchedules,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: formattedSchedules.length
        }
      });
    } catch (error) {
      logger.error("Error fetching lab schedules:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch schedules"
      });
    }
  }

  // Get schedules for a specific teacher
  async getTeacherSchedules(req, res) {
    try {
      const teacherId = req.params.teacherId || req.user.id;

      // Check permission
      if (teacherId != req.user.id && 
          !req.user.permissions.includes("view_all_schedules")) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to view other teachers' schedules"
        });
      }

      const [schedules] = await db.query(
        `SELECT 
          s.*,
          u.username as teacher_name
        FROM lab_schedules s
        LEFT JOIN users u ON s.teacher_id = u.id
        WHERE s.teacher_id = ?
        ORDER BY s.created_at DESC`,
        [teacherId]
      );

      const formattedSchedules = schedules.map(schedule => ({
        id: schedule.id,
        labName: schedule.lab_name,
        teacherId: schedule.teacher_id,
        teacherName: schedule.teacher_name,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        subject: schedule.subject,
        status: schedule.status,
        recurrenceType: schedule.recurrence_type,
        daysOfWeek: schedule.days_of_week ? JSON.parse(schedule.days_of_week) : [],
        recurrenceEndDate: schedule.recurrence_end_date,
        createdBy: schedule.created_by,
        createdAt: schedule.created_at
      }));

      res.json({
        success: true,
        data: formattedSchedules
      });
    } catch (error) {
      logger.error("Error fetching teacher schedules:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch teacher schedules"
      });
    }
  }

  // Get a single schedule by ID
  async getScheduleById(req, res) {
    try {
      const { scheduleId } = req.params;

      const [schedules] = await db.query(
        `SELECT 
          s.*,
          u.username as teacher_name
        FROM lab_schedules s
        LEFT JOIN users u ON s.teacher_id = u.id
        WHERE s.id = ?`,
        [scheduleId]
      );

      if (schedules.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Schedule not found"
        });
      }

      const schedule = schedules[0];
      res.json({
        success: true,
        data: {
          id: schedule.id,
          labName: schedule.lab_name,
          teacherId: schedule.teacher_id,
          teacherName: schedule.teacher_name,
          startTime: schedule.start_time,
          endTime: schedule.end_time,
          subject: schedule.subject,
          status: schedule.status,
          recurrenceType: schedule.recurrence_type,
          daysOfWeek: schedule.days_of_week ? JSON.parse(schedule.days_of_week) : [],
          recurrenceEndDate: schedule.recurrence_end_date,
          createdBy: schedule.created_by,
          createdAt: schedule.created_at
        }
      });
    } catch (error) {
      logger.error("Error fetching schedule:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch schedule"
      });
    }
  }

  // Update a schedule
  async updateSchedule(req, res) {
    const connection = await db.getConnection();
    
    try {
      const { scheduleId } = req.params;
      const updates = [];
      const values = [];

      // Build dynamic update query
      const allowedFields = [
        'labName', 'teacherId', 'startTime', 'endTime', 'subject',
        'status', 'recurrenceType', 'daysOfWeek', 'recurrenceEndDate'
      ];

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          const dbField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
          
          if (field === 'daysOfWeek') {
            updates.push(`${dbField} = ?`);
            values.push(JSON.stringify(req.body[field]));
          } else if (field === 'startTime' || field === 'endTime') {
            updates.push(`${dbField} = ?`);
            // Handle time format based on recurrence type
            const recurrenceType = req.body.recurrenceType || 'one-time';
            if (recurrenceType === 'weekly') {
              const timeValue = req.body[field];
              values.push(timeValue.length === 5 ? `${timeValue}:00` : timeValue);
            } else {
              values.push(new Date(req.body[field]));
            }
          } else {
            updates.push(`${dbField} = ?`);
            values.push(req.body[field]);
          }
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No fields to update"
        });
      }

      values.push(scheduleId);

      await connection.beginTransaction();

      await connection.query(
        `UPDATE lab_schedules SET ${updates.join(", ")} WHERE id = ?`,
        values
      );

      await connection.commit();

      logger.info("Lab schedule updated", { scheduleId });

      res.json({
        success: true,
        message: "Schedule updated successfully"
      });
    } catch (error) {
      await connection.rollback();
      logger.error("Error updating lab schedule:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update schedule"
      });
    } finally {
      connection.release();
    }
  }

  // Delete a schedule
  async deleteSchedule(req, res) {
    try {
      const { scheduleId } = req.params;

      const [result] = await db.query(
        "DELETE FROM lab_schedules WHERE id = ?",
        [scheduleId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Schedule not found"
        });
      }

      logger.info("Lab schedule deleted", { scheduleId });

      res.json({
        success: true,
        message: "Schedule deleted successfully"
      });
    } catch (error) {
      logger.error("Error deleting lab schedule:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete schedule"
      });
    }
  }

  // Approve a pending schedule
  async approveSchedule(req, res) {
    try {
      const { scheduleId } = req.params;

      await db.query(
        "UPDATE lab_schedules SET status = 'scheduled' WHERE id = ? AND status = 'pending'",
        [scheduleId]
      );

      logger.info("Lab schedule approved", { scheduleId, approvedBy: req.user.id });

      res.json({
        success: true,
        message: "Schedule approved successfully"
      });
    } catch (error) {
      logger.error("Error approving schedule:", error);
      res.status(500).json({
        success: false,
        message: "Failed to approve schedule"
      });
    }
  }

  // Disapprove a pending schedule
  async disapproveSchedule(req, res) {
    try {
      const { scheduleId } = req.params;
      const { reason } = req.body;

      await db.query(
        "UPDATE lab_schedules SET status = 'cancelled' WHERE id = ? AND status = 'pending'",
        [scheduleId]
      );

      logger.info("Lab schedule disapproved", {
        scheduleId,
        disapprovedBy: req.user.id,
        reason
      });

      res.json({
        success: true,
        message: "Schedule disapproved successfully"
      });
    } catch (error) {
      logger.error("Error disapproving schedule:", error);
      res.status(500).json({
        success: false,
        message: "Failed to disapprove schedule"
      });
    }
  }
}

module.exports = new LabSchedulesController();