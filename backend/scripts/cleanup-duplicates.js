const mysql = require("mysql2/promise");
require("dotenv").config();

async function cleanupDuplicates() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "smart_door_lock",
      port: parseInt(process.env.DB_PORT || "3306"),
    });

    console.log("✅ Connected to database");
    console.log("🔍 Checking for duplicate laboratories...\n");

    // Find duplicates
    const [duplicates] = await connection.query(`
      SELECT name, COUNT(*) as count, GROUP_CONCAT(id ORDER BY id) as ids
      FROM laboratories 
      GROUP BY name 
      HAVING count > 1
    `);

    if (duplicates.length === 0) {
      console.log("✅ No duplicate laboratories found!");
      
      // Show current labs
      const [labs] = await connection.query(
        "SELECT id, name, location, capacity FROM laboratories ORDER BY id"
      );
      console.log(`\n📋 Current laboratories (${labs.length} total):`);
      labs.forEach(lab => {
        console.log(`  ${lab.id}. ${lab.name} - ${lab.location} (Capacity: ${lab.capacity})`);
      });
      return;
    }

    console.log(`⚠️  Found ${duplicates.length} duplicate lab name(s):\n`);
    duplicates.forEach(d => {
      console.log(`  ${d.name} - ${d.count} copies (IDs: ${d.ids})`);
    });

    console.log("\n🧹 Cleaning up duplicates (keeping oldest record)...\n");

    let totalDeleted = 0;

    for (const dup of duplicates) {
      console.log(`Processing: ${dup.name}`);
      
      // Get the oldest record ID (first in the list)
      const ids = dup.ids.split(',').map(id => parseInt(id));
      const keepId = ids[0]; // Keep the first (oldest) ID
      const deleteIds = ids.slice(1); // Delete the rest
      
      console.log(`  Keeping lab ID: ${keepId}`);
      console.log(`  Deleting IDs: ${deleteIds.join(', ')}`);
      
      // Delete duplicates
      const [result] = await connection.query(
        `DELETE FROM laboratories WHERE id IN (?)`,
        [deleteIds]
      );
      
      totalDeleted += result.affectedRows;
      console.log(`  ✓ Removed ${result.affectedRows} duplicate(s)\n`);
    }

    console.log(`✅ Cleanup completed! Removed ${totalDeleted} duplicate lab(s)\n`);

    // Show final list
    const [finalLabs] = await connection.query(
      "SELECT id, name, location, capacity FROM laboratories ORDER BY id"
    );
    console.log(`📋 Final laboratories (${finalLabs.length} total):`);
    finalLabs.forEach(lab => {
      console.log(`  ${lab.id}. ${lab.name} - ${lab.location} (Capacity: ${lab.capacity})`);
    });

  } catch (error) {
    console.error("\n❌ Cleanup failed!");
    console.error("Error:", error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log("\n🔌 Database connection closed");
    }
  }
}

if (require.main === module) {
  console.log("🚀 Starting cleanup process...\n");
  
  cleanupDuplicates()
    .then(() => {
      console.log("\n✨ All done!");
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

module.exports = { cleanupDuplicates };