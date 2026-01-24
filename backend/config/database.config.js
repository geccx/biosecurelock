module.exports = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "smart_lock_db",
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || "10"),
  queueLimit: 0,
  waitForConnections: true,

  // Table names
  tables: {
    users: "users",
    enrollmentRequests: "enrollment_requests",
    accessSchedules: "access_schedules",
    accessLogs: "access_logs",
    systemLogs: "system_logs",
    temporaryPasswords: "temporary_passwords",
  },
};
