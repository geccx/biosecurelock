const db = require("../models/mysql.models");
const dbConfig = require("../config/database.config");
const logger = require("../utils/logger");

const SEMESTERS_TABLE = dbConfig.tables.semesters;

/**
 * List semesters with optional filters
 * @param {Object} filters - { status, academicYear, limit, offset }
 */
async function listSemesters(filters = {}) {
  const { status, academicYear, limit = 50, offset = 0 } = filters;
  let sql = `SELECT s.*, 
    u.username AS created_by_name,
    approver.username AS approved_by_name
    FROM ${SEMESTERS_TABLE} s
    LEFT JOIN users u ON s.created_by = u.id
    LEFT JOIN users approver ON s.approved_by = approver.id
    WHERE 1=1`;
  const params = [];

  if (status) {
    sql += " AND s.status = ?";
    params.push(status);
  }
  if (academicYear) {
    sql += " AND s.academic_year = ?";
    params.push(academicYear);
  }

  sql += " ORDER BY s.start_date DESC";
  sql += " LIMIT ? OFFSET ?";
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const [rows] = await db.query(sql, params);
  return rows.map(rowToSemester);
}

/**
 * Get a single semester by ID
 */
async function getSemesterById(id) {
  const [rows] = await db.query(
    `SELECT s.*, 
      u.username AS created_by_name,
      approver.username AS approved_by_name
      FROM ${SEMESTERS_TABLE} s
      LEFT JOIN users u ON s.created_by = u.id
      LEFT JOIN users approver ON s.approved_by = approver.id
      WHERE s.id = ?`,
    [id],
  );
  if (rows.length === 0) return null;
  return rowToSemester(rows[0]);
}

/**
 * Create a semester
 * @param {Object} data - { name, academicYear, startDate, endDate }
 * @param {number} createdBy - user id
 */
async function createSemester(data, createdBy) {
  const { name, academicYear, startDate, endDate } = data;

  const [result] = await db.query(
    `INSERT INTO ${SEMESTERS_TABLE} 
     (name, academic_year, start_date, end_date, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', ?, NOW(), NOW())`,
    [name, academicYear, startDate, endDate, createdBy],
  );
  return getSemesterById(result.insertId);
}

/**
 * Update a semester (only draft or approved can be updated; active/completed are restricted in controller)
 */
async function updateSemester(id, data) {
  const { name, academicYear, startDate, endDate } = data;
  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push("name = ?");
    params.push(name);
  }
  if (academicYear !== undefined) {
    updates.push("academic_year = ?");
    params.push(academicYear);
  }
  if (startDate !== undefined) {
    updates.push("start_date = ?");
    params.push(startDate);
  }
  if (endDate !== undefined) {
    updates.push("end_date = ?");
    params.push(endDate);
  }

  if (updates.length === 0) return getSemesterById(id);

  params.push(id);
  await db.query(
    `UPDATE ${SEMESTERS_TABLE} SET ${updates.join(", ")}, updated_at = NOW() WHERE id = ?`,
    params,
  );
  return getSemesterById(id);
}

/**
 * Delete a semester (only if draft and no templates/instances - enforced in controller)
 */
async function deleteSemester(id) {
  const [result] = await db.query(
    `DELETE FROM ${SEMESTERS_TABLE} WHERE id = ?`,
    [id],
  );
  return result.affectedRows > 0;
}

/**
 * Approve a semester
 * @param {number} id - semester id
 * @param {number} approvedBy - user id
 */
async function approveSemester(id, approvedBy) {
  await db.query(
    `UPDATE ${SEMESTERS_TABLE} 
     SET status = 'approved', approved_by = ?, approved_at = NOW(), updated_at = NOW() 
     WHERE id = ?`,
    [approvedBy, id],
  );
  return getSemesterById(id);
}

/**
 * Map DB row to API-friendly object
 */
function rowToSemester(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    academicYear: row.academic_year,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByName: row.created_by_name,
    approvedByName: row.approved_by_name,
  };
}

module.exports = {
  listSemesters,
  getSemesterById,
  createSemester,
  updateSemester,
  deleteSemester,
  approveSemester,
};
