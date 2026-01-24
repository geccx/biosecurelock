module.exports = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "railway",
  port: parseInt(process.env.DB_PORT || "3306"),
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || "10"),
  queueLimit: 0,
  waitForConnections: true,
  connectTimeout: 60000, // 60 seconds
  acquireTimeout: 60000,
  timeout: 60000,

  // Table names - MUST match the actual database schema
  tables: {
    users: "users",
    enrollments: "enrollments", // Changed from enrollment_requests
    laboratories: "laboratories",
    labSchedules: "lab_schedules",
    scheduleMoveRequests: "schedule_move_requests",
    accessLogs: "access_logs",
    systemLogs: "system_logs",
    devices: "devices",
    systemConfig: "system_config",
    accessSchedules: "access_schedules",
    temporaryPasswords: "temporary_passwords",
    userNotificationPreferences: "user_notification_preferences",
    notifications: "notifications",
    userCreationBackup: "user_creation_backup",
    passwordRequests: "password_requests",
    rolePrivileges: "role_privileges",
  },
};