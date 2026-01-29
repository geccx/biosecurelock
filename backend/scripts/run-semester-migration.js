const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const MIGRATION_FILE = path.join(
  __dirname,
  "..",
  "database",
  "migrations",
  "create_semester_schedule_tables.sql",
);

async function runMigration() {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "railway",
      multipleStatements: true,
    });

    console.log("Connected to database");

    const migrationSQL = fs.readFileSync(MIGRATION_FILE, "utf8");
    console.log("Running migration: create_semester_schedule_tables.sql");

    await connection.query(migrationSQL);

    console.log(
      "✅ Semester schedule tables migration completed successfully.",
    );
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log("Database connection closed");
    }
  }
}

runMigration();
