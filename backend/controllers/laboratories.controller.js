const db = require("../models/mysql.models");
const tuyaService = require("../services/tuya.service");
const logger = require("../utils/logger");

/**
 * Get all laboratories
 */
exports.getAllLaboratories = async (req, res) => {
  try {
    const [laboratories] = await db.query(
      `SELECT l.*, 
        (SELECT COUNT(*) FROM lab_schedules ls WHERE ls.lab_name = l.name AND ls.status = 'scheduled') as assigned_schedules,
        (SELECT MAX(timestamp) FROM access_logs al WHERE al.laboratory_id = l.id) as last_accessed
       FROM laboratories l
       ORDER BY l.name`
    );

    res.json({
      success: true,
      data: laboratories.map((lab) => ({
        id: lab.id.toString(),
        name: lab.name,
        location: lab.location,
        capacity: lab.capacity,
        lockStatus: lab.lock_status,
        currentOccupancy: lab.current_occupancy || 0,
        lastAccessed: lab.last_accessed,
        assignedSchedules: lab.assigned_schedules || 0,
        deviceId: lab.device_id,
      })),
    });
  } catch (error) {
    logger.error("Error fetching laboratories:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch laboratories",
    });
  }
};

/**
 * Get a single laboratory by ID
 */
exports.getLaboratoryById = async (req, res) => {
  try {
    const { labId } = req.params;

    const [laboratories] = await db.query(
      `SELECT l.*, 
        (SELECT COUNT(*) FROM lab_schedules ls WHERE ls.lab_name = l.name AND ls.status = 'scheduled') as assigned_schedules
       FROM laboratories l
       WHERE l.id = ?`,
      [labId]
    );

    if (laboratories.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Laboratory not found",
      });
    }

    const lab = laboratories[0];
    res.json({
      success: true,
      data: {
        id: lab.id.toString(),
        name: lab.name,
        location: lab.location,
        capacity: lab.capacity,
        lockStatus: lab.lock_status,
        currentOccupancy: lab.current_occupancy || 0,
        assignedSchedules: lab.assigned_schedules || 0,
        deviceId: lab.device_id,
      },
    });
  } catch (error) {
    logger.error("Error fetching laboratory:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch laboratory",
    });
  }
};

/**
 * Create a new laboratory
 */
exports.createLaboratory = async (req, res) => {
  try {
    const { name, location, capacity, deviceId } = req.body;

    // Check for duplicate name
    const [existing] = await db.query(
      "SELECT id FROM laboratories WHERE name = ?",
      [name]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: "A laboratory with this name already exists",
      });
    }

    // Use default capacity if not provided
    const labCapacity = capacity || 30;

    // Validate capacity if provided
    if (capacity !== undefined && (capacity < 1 || capacity > 1000)) {
      return res.status(400).json({
        success: false,
        error: "Capacity must be between 1 and 1000",
      });
    }

    // Insert new laboratory
    const [result] = await db.query(
      `INSERT INTO laboratories (name, location, capacity, lock_status, current_occupancy, device_id, created_at)
       VALUES (?, ?, ?, 'locked', 0, ?, NOW())`,
      [name.trim(), location.trim(), labCapacity, deviceId?.trim() || null]
    );

    logger.info("Laboratory created", { labId: result.insertId, name });

    // Fetch the created laboratory with all computed fields
    const [newLab] = await db.query(
      `SELECT l.*, 
        (SELECT COUNT(*) FROM lab_schedules ls WHERE ls.lab_name = l.name AND ls.status = 'scheduled') as assigned_schedules
       FROM laboratories l
       WHERE l.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      data: {
        id: newLab[0].id.toString(),
        name: newLab[0].name,
        location: newLab[0].location,
        capacity: newLab[0].capacity,
        lockStatus: newLab[0].lock_status,
        currentOccupancy: newLab[0].current_occupancy || 0,
        assignedSchedules: newLab[0].assigned_schedules || 0,
        deviceId: newLab[0].device_id,
      },
    });
  } catch (error) {
    logger.error("Error creating laboratory:", error);
    
    // Handle MySQL duplicate entry error
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        success: false,
        error: "A laboratory with this name already exists",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to create laboratory",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Update a laboratory
 */
exports.updateLaboratory = async (req, res) => {
  try {
    const { labId } = req.params;
    const { name, location, capacity, deviceId } = req.body;

    // Check if laboratory exists
    const [existing] = await db.query(
      "SELECT id, name FROM laboratories WHERE id = ?",
      [labId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Laboratory not found",
      });
    }

    // Check for duplicate name if name is being updated
    if (name && name.trim() !== existing[0].name) {
      const [duplicate] = await db.query(
        "SELECT id FROM laboratories WHERE name = ? AND id != ?",
        [name.trim(), labId]
      );

      if (duplicate.length > 0) {
        return res.status(400).json({
          success: false,
          error: "A laboratory with this name already exists",
        });
      }
    }

    // Validate capacity if provided
    if (capacity !== undefined) {
      if (capacity < 1 || capacity > 1000) {
        return res.status(400).json({
          success: false,
          error: "Capacity must be between 1 and 1000",
        });
      }
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name.trim());
    }
    if (location !== undefined) {
      updates.push("location = ?");
      params.push(location.trim());
    }
    if (capacity !== undefined) {
      updates.push("capacity = ?");
      params.push(capacity);
    }
    if (deviceId !== undefined) {
      // Handle empty string as null
      updates.push("device_id = ?");
      params.push(deviceId?.trim() || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No fields to update",
      });
    }

    updates.push("updated_at = NOW()");
    params.push(labId);

    await db.query(`UPDATE laboratories SET ${updates.join(", ")} WHERE id = ?`, params);

    logger.info("Laboratory updated", { labId });

    // Fetch updated laboratory with computed fields
    const [updated] = await db.query(
      `SELECT l.*, 
        (SELECT COUNT(*) FROM lab_schedules ls WHERE ls.lab_name = l.name AND ls.status = 'scheduled') as assigned_schedules
       FROM laboratories l
       WHERE l.id = ?`,
      [labId]
    );

    res.json({
      success: true,
      message: "Laboratory updated successfully",
      data: {
        id: updated[0].id.toString(),
        name: updated[0].name,
        location: updated[0].location,
        capacity: updated[0].capacity,
        lockStatus: updated[0].lock_status,
        currentOccupancy: updated[0].current_occupancy || 0,
        assignedSchedules: updated[0].assigned_schedules || 0,
        deviceId: updated[0].device_id,
      },
    });
  } catch (error) {
    logger.error("Error updating laboratory:", error);
    
    // Handle MySQL duplicate entry error
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        success: false,
        error: "A laboratory with this name already exists",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to update laboratory",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Toggle lock status for a laboratory
 */
exports.toggleLock = async (req, res) => {
  try {
    const { labId } = req.params;

    // Get current lock status
    const [laboratories] = await db.query(
      "SELECT lock_status, device_id FROM laboratories WHERE id = ?",
      [labId]
    );

    if (laboratories.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Laboratory not found",
      });
    }

    const lab = laboratories[0];
    const newStatus = lab.lock_status === "locked" ? "unlocked" : "locked";

    // Try to control physical lock via Tuya
    if (lab.device_id) {
      try {
        if (newStatus === "unlocked") {
          await tuyaService.unlockDoor(lab.device_id);
        }
        // Note: Tuya smart locks typically auto-lock, but we can send a command if needed
      } catch (tuyaError) {
        logger.warn("Failed to control physical lock:", tuyaError);
        // Continue with database update even if physical control fails
      }
    }

    // Update database
    await db.query(
      "UPDATE laboratories SET lock_status = ?, updated_at = NOW() WHERE id = ?",
      [newStatus, labId]
    );

    logger.info("Laboratory lock toggled", { labId, newStatus });

    res.json({
      success: true,
      data: {
        id: labId,
        lockStatus: newStatus,
      },
    });
  } catch (error) {
    logger.error("Error toggling lock:", error);
    res.status(500).json({
      success: false,
      error: "Failed to toggle lock",
    });
  }
};

/**
 * Lock all laboratories
 */
exports.lockAll = async (req, res) => {
  try {
    await db.query("UPDATE laboratories SET lock_status = 'locked', updated_at = NOW()");

    logger.info("All laboratories locked");

    res.json({
      success: true,
      message: "All laboratories locked",
    });
  } catch (error) {
    logger.error("Error locking all laboratories:", error);
    res.status(500).json({
      success: false,
      error: "Failed to lock all laboratories",
    });
  }
};

/**
 * Unlock all laboratories
 */
exports.unlockAll = async (req, res) => {
  try {
    await db.query("UPDATE laboratories SET lock_status = 'unlocked', updated_at = NOW()");

    logger.info("All laboratories unlocked");

    res.json({
      success: true,
      message: "All laboratories unlocked",
    });
  } catch (error) {
    logger.error("Error unlocking all laboratories:", error);
    res.status(500).json({
      success: false,
      error: "Failed to unlock all laboratories",
    });
  }
};

/**
 * Delete a laboratory
 */
exports.deleteLaboratory = async (req, res) => {
  try {
    const { labId } = req.params;

    // Check if laboratory exists
    const [laboratories] = await db.query(
      "SELECT id, name FROM laboratories WHERE id = ?",
      [labId]
    );

    if (laboratories.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Laboratory not found",
      });
    }

    const lab = laboratories[0];

    // Check for dependencies - schedules
    const [schedules] = await db.query(
      "SELECT COUNT(*) as count FROM lab_schedules WHERE lab_name = ? AND status IN ('pending', 'scheduled')",
      [lab.name]
    );

    if (schedules[0].count > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete laboratory. It has ${schedules[0].count} active schedule(s). Please remove or complete all schedules first.`,
      });
    }

    // Check for access logs (optional - we might want to keep logs even after deletion)
    // For now, we'll allow deletion even if there are logs

    // Delete the laboratory
    await db.query("DELETE FROM laboratories WHERE id = ?", [labId]);

    logger.info("Laboratory deleted", { labId, name: lab.name });

    res.json({
      success: true,
      message: "Laboratory deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting laboratory:", error);
    
    // Handle foreign key constraint errors
    if (error.code === "ER_ROW_IS_REFERENCED_2" || error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        success: false,
        error: "Cannot delete laboratory. It is referenced by other records (schedules, access logs, etc.).",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to delete laboratory",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

