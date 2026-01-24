const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function runMigration(migrationFileName) {
  let connection;
  
  try {
    // Create connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "smart_door_lock",
      port: parseInt(process.env.DB_PORT || "3306"),
      multipleStatements: true,
    });

    console.log("✅ Connected to database:", process.env.DB_NAME || "smart_door_lock");

    // Determine which migration to run
    const fileName = migrationFileName || process.argv[2] || "add_recurrence_to_lab_schedules.sql";
    const migrationPath = path.join(__dirname, "../database/migrations", fileName);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, "utf8");

    console.log(`🔄 Running migration: ${fileName}`);
    console.log("⏳ Please wait...\n");
    
    // Execute migration
    await connection.query(migrationSQL);
    
    console.log("✅ Migration completed successfully!");
    
    // Verify the changes based on migration type
    if (fileName.includes("recurrence")) {
      console.log("\n📋 Verifying new columns...");
      const [columns] = await connection.query(`
        SELECT column_name, column_type, is_nullable, column_default
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE table_schema = ? 
          AND table_name = 'lab_schedules'
          AND column_name IN ('recurrence_type', 'days_of_week', 'recurrence_end_date')
      `, [process.env.DB_NAME || "smart_door_lock"]);

      if (columns.length > 0) {
        console.log("New columns added:");
        columns.forEach(col => {
          console.log(`  ✓ ${col.column_name} (${col.column_type})`);
        });
      } else {
        console.log("⚠️  Columns may already exist.");
      }

      // Check for indexes
      const [indexes] = await connection.query(`
        SELECT DISTINCT index_name
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_schema = ?
          AND table_name = 'lab_schedules'
          AND index_name IN ('idx_recurrence_type', 'idx_recurrence_end_date')
      `, [process.env.DB_NAME || "smart_door_lock"]);

      if (indexes.length > 0) {
        console.log("\n🔍 Indexes created:");
        indexes.forEach(idx => {
          console.log(`  ✓ ${idx.index_name}`);
        });
      }
    }
    
  } catch (error) {
    console.error("\n❌ Migration failed:", error.message);
    
    if (error.code === "ER_DUP_FIELDNAME") {
      console.log("💡 Note: Column may already exist. This is normal if migration was run before.");
    } else if (error.code === "ER_DUP_KEYNAME") {
      console.log("💡 Note: Index may already exist.");
    } else if (error.code === "ECONNREFUSED") {
      console.error("\n💡 Cannot connect to database. Check your .env file:");
      console.error(`   DB_HOST: ${process.env.DB_HOST}`);
      console.error(`   DB_USER: ${process.env.DB_USER}`);
      console.error(`   DB_NAME: ${process.env.DB_NAME}`);
      console.error(`   DB_PORT: ${process.env.DB_PORT}`);
    } else {
      throw error;
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log("\n🔌 Database connection closed");
    }
  }
}

// Run migration
if (require.main === module) {
  console.log("🚀 Starting migration...\n");
  
  runMigration()
    .then(() => {
      console.log("\n✨ All done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Error:", error.message);
      process.exit(1);
    });
}

module.exports = { runMigration };