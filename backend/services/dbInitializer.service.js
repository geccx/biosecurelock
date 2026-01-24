const mysql = require("mysql2/promise");
const fs = require("fs").promises;
const path = require("path");
const logger = require("../utils/logger");

class DatabaseInitializer {
  constructor() {
    this.dbConfig = {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "3306"),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD,
      multipleStatements: true,
      connectTimeout: 60000,
    };
    this.databaseName = process.env.DB_NAME || "railway";
  }

  /**
   * Initialize database - create database and tables if they don't exist
   */
  async initialize() {
    let connection = null;

    try {
      logger.info("🔄 Starting database initialization...");
      logger.info(`Database config: ${this.dbConfig.host}:${this.dbConfig.port}`);

      // Step 1: Connect to MySQL server (without specifying database)
      logger.info("📡 Connecting to MySQL server...");
      connection = await mysql.createConnection(this.dbConfig);
      logger.info("✓ Connected to MySQL server");

      // Step 2: Create database if it doesn't exist
      logger.info(`🗄️  Creating database '${this.databaseName}' if not exists...`);
      await connection.query(
        `CREATE DATABASE IF NOT EXISTS \`${this.databaseName}\``
      );
      logger.info(`✓ Database '${this.databaseName}' ready`);

      // Step 3: Use the database
      await connection.query(`USE \`${this.databaseName}\``);
      logger.info(`✓ Using database '${this.databaseName}'`);

      // Step 4: Read and execute the initialization SQL file
      const sqlFilePath = path.join(__dirname, "../database/init-db.sql");
      logger.info(`📄 Reading SQL file: ${sqlFilePath}`);

      let sqlContent;
      try {
        sqlContent = await fs.readFile(sqlFilePath, "utf8");
        logger.info(`✓ SQL file read successfully (${sqlContent.length} bytes)`);
      } catch (fileError) {
        logger.error("❌ Failed to read SQL file:", fileError.message);
        throw new Error(`Cannot read initialization SQL file: ${fileError.message}`);
      }

      // Step 5: Execute SQL statements
      logger.info("⚙️  Executing database initialization SQL...");
      
      // Split by semicolons but be careful with delimiter changes
      const statements = this.splitSQLStatements(sqlContent);
      logger.info(`📋 Found ${statements.length} SQL statements to execute`);

      let executedCount = 0;
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (trimmed && !trimmed.startsWith("--")) {
          try {
            await connection.query(trimmed);
            executedCount++;
          } catch (execError) {
            // Log but continue for non-critical errors (like duplicate entries)
            if (!execError.message.includes("Duplicate entry")) {
              logger.warn(`⚠️  SQL execution warning: ${execError.message}`);
            }
          }
        }
      }

      logger.info(`✓ Executed ${executedCount} SQL statements`);

      // Step 6: Verify tables were created
      const [tables] = await connection.query("SHOW TABLES");
      logger.info(`✓ Database initialized with ${tables.length} tables`);
      
      if (tables.length > 0) {
        logger.info("📊 Tables created:");
        tables.forEach((table) => {
          const tableName = Object.values(table)[0];
          logger.info(`   - ${tableName}`);
        });
      }

      logger.info("✅ Database initialization completed successfully!");
      return true;
    } catch (error) {
      logger.error("❌ Database initialization failed:", error.message);
      logger.error("Stack trace:", error.stack);
      throw error;
    } finally {
      if (connection) {
        await connection.end();
        logger.info("🔌 Database connection closed");
      }
    }
  }

  /**
   * Split SQL content into individual statements
   * Handles multi-line statements and comments
   */
  splitSQLStatements(sqlContent) {
    const statements = [];
    let currentStatement = "";
    let inDelimiter = false;

    // Remove comments and split by lines
    const lines = sqlContent.split("\n");

    for (let line of lines) {
      // Remove inline comments
      const commentIndex = line.indexOf("--");
      if (commentIndex !== -1) {
        line = line.substring(0, commentIndex);
      }

      line = line.trim();

      // Skip empty lines
      if (!line) continue;

      // Handle DELIMITER changes
      if (line.toUpperCase().startsWith("DELIMITER")) {
        inDelimiter = !inDelimiter;
        continue;
      }

      currentStatement += line + " ";

      // Check for statement end (semicolon)
      if (line.endsWith(";") && !inDelimiter) {
        statements.push(currentStatement.trim());
        currentStatement = "";
      }
    }

    // Add any remaining statement
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }

    return statements;
  }

  /**
   * Verify database connection and tables
   */
  async verify() {
    let connection = null;

    try {
      connection = await mysql.createConnection({
        ...this.dbConfig,
        database: this.databaseName,
      });

      const [tables] = await connection.query("SHOW TABLES");
      logger.info(`✓ Database verification: ${tables.length} tables found`);

      // Check for critical tables
      const criticalTables = [
        "users",
        "enrollments",
        "laboratories",
        "lab_schedules",
        "access_logs",
        "system_config",
      ];

      const existingTables = tables.map((t) => Object.values(t)[0]);
      const missingTables = criticalTables.filter(
        (t) => !existingTables.includes(t)
      );

      if (missingTables.length > 0) {
        logger.error(`❌ Missing critical tables: ${missingTables.join(", ")}`);
        return false;
      }

      logger.info("✓ All critical tables exist");
      return true;
    } catch (error) {
      logger.error("❌ Database verification failed:", error.message);
      return false;
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }
}

module.exports = new DatabaseInitializer();