const semesterService = require("../services/semester.service");
const db = require("../models/mysql.models");
const dbConfig = require("../config/database.config");
const logger = require("../utils/logger");

const SEMESTERS_TABLE = dbConfig.tables.semesters;
const SCHEDULE_TEMPLATES_TABLE = dbConfig.tables.scheduleTemplates;
const SCHEDULE_INSTANCES_TABLE = dbConfig.tables.scheduleInstances;

/**
 * Create semester
 * POST /api/admin/semesters
 */
exports.createSemester = async (req, res) => {
  try {
    const { name, academicYear, startDate, endDate } = req.body;
    const createdBy = req.user.id;

    const semester = await semesterService.createSemester(
      { name, academicYear, startDate, endDate },
      createdBy,
    );
    res.status(201).json({
      success: true,
      data: semester,
    });
  } catch (error) {
    logger.error("Error creating semester:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create semester",
    });
  }
};

/**
 * List semesters
 * GET /api/admin/semesters
 */
exports.listSemesters = async (req, res) => {
  try {
    const { status, academicYear, limit, offset } = req.query;
    const semesters = await semesterService.listSemesters({
      status,
      academicYear,
      limit,
      offset,
    });
    res.json({
      success: true,
      data: semesters,
    });
  } catch (error) {
    logger.error("Error listing semesters:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch semesters",
    });
  }
};

/**
 * Get semester by ID
 * GET /api/admin/semesters/:id
 */
exports.getSemester = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const semester = await semesterService.getSemesterById(id);
    if (!semester) {
      return res.status(404).json({
        success: false,
        error: "Semester not found",
      });
    }
    res.json({
      success: true,
      data: semester,
    });
  } catch (error) {
    logger.error("Error fetching semester:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch semester",
    });
  }
};

/**
 * Update semester (only draft or approved)
 * PUT /api/admin/semesters/:id
 */
exports.updateSemester = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const semester = await semesterService.getSemesterById(id);
    if (!semester) {
      return res.status(404).json({
        success: false,
        error: "Semester not found",
      });
    }
    if (semester.status === "active" || semester.status === "completed") {
      return res.status(400).json({
        success: false,
        error: "Cannot update semester that is active or completed",
      });
    }
    const { name, academicYear, startDate, endDate } = req.body;
    const updated = await semesterService.updateSemester(id, {
      name,
      academicYear,
      startDate,
      endDate,
    });
    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    logger.error("Error updating semester:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update semester",
    });
  }
};

/**
 * Delete semester (only draft with no templates)
 * DELETE /api/admin/semesters/:id
 */
exports.deleteSemester = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const semester = await semesterService.getSemesterById(id);
    if (!semester) {
      return res.status(404).json({
        success: false,
        error: "Semester not found",
      });
    }
    if (semester.status !== "draft") {
      return res.status(400).json({
        success: false,
        error: "Only draft semesters can be deleted",
      });
    }
    const [templates] = await db.query(
      `SELECT id FROM ${SCHEDULE_TEMPLATES_TABLE} WHERE semester_id = ? LIMIT 1`,
      [id],
    );
    if (templates.length > 0) {
      return res.status(400).json({
        success: false,
        error:
          "Cannot delete semester that has schedule templates. Remove templates first.",
      });
    }
    const deleted = await semesterService.deleteSemester(id);
    if (!deleted) {
      return res.status(500).json({
        success: false,
        error: "Failed to delete semester",
      });
    }
    res.json({
      success: true,
      message: "Semester deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting semester:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete semester",
    });
  }
};

/**
 * Approve semester
 * PUT /api/admin/semesters/:id/approve
 */
exports.approveSemester = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const approvedBy = req.user.id;
    const semester = await semesterService.getSemesterById(id);
    if (!semester) {
      return res.status(404).json({
        success: false,
        error: "Semester not found",
      });
    }
    if (semester.status !== "draft") {
      return res.status(400).json({
        success: false,
        error: "Only draft semesters can be approved",
      });
    }
    const updated = await semesterService.approveSemester(id, approvedBy);
    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    logger.error("Error approving semester:", error);
    res.status(500).json({
      success: false,
      error: "Failed to approve semester",
    });
  }
};
