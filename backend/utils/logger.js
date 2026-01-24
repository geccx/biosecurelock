const winston = require("winston");
const path = require("path");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
    // Filter out non-critical Fabric event service errors
    winston.format((info) => {
      const message = info.message || '';
      const stack = info.stack || '';
      
      // Suppress "No targets provided" errors (non-critical when discovery is disabled)
      if (message.includes('No targets provided') || stack.includes('No targets provided')) {
        return false; // Don't log this
      }
      
      return info;
    })()
  ),
  defaultMeta: { service: "smart-door-lock" },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          (info) =>
            `${info.timestamp} ${info.level}: ${info.message}` +
            (info.stack ? `\n${info.stack}` : "") +
            (Object.keys(info).length > 4
              ? `\n${JSON.stringify(info, null, 2)}`
              : "")
        )
      ),
    }),
    // Write all logs to file
    new winston.transports.File({
      filename: path.join(__dirname, "../../logs/error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(__dirname, "../../logs/combined.log"),
    }),
  ],
});

// Create logs directory if it doesn't exist
const fs = require("fs");
const logsDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

module.exports = logger;
