const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function runMigration() {
  let connection;
  
  try {
    // Create connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "smart_door_lock",
      multipleStatements: true,
    });

    console.log("Connected to database");

    // Read migration file
    const migrationPath = path.join(__dirname, "../database/migrations/add_pending_status.sql");
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");

    console.log("Running migration: add_pending_status.sql");
    
    // Execute migration
    await connection.query(migrationSQL);
    
    console.log("✅ Migration completed successfully!");
    console.log("The 'pending' status has been added to the lab_schedules table.");
    
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    if (error.code === "ER_DUP_FIELDNAME") {
      console.log("Note: The 'pending' status may already exist in the ENUM.");
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log("Database connection closed");
    }
  }
}

runMigration();

