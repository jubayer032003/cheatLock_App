// Structured Logging Service for Production Monitoring (ELK, Datadog, CloudWatch)
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4,
};

const CURRENT_LEVEL = process.env.LOG_LEVEL ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] ?? 1 : 1; // default to INFO

function log(levelName, message, meta = {}) {
  if (LOG_LEVELS[levelName] < CURRENT_LEVEL) return;

  const logPayload = {
    timestamp: new Date().toISOString(),
    level: levelName,
    message,
    ...meta,
  };

  // Standard output format as structured JSON
  console.log(JSON.stringify(logPayload));
}

export const logger = {
  debug: (msg, meta) => log("DEBUG", msg, meta),
  info: (msg, meta) => log("INFO", msg, meta),
  warn: (msg, meta) => log("WARN", msg, meta),
  error: (msg, meta) => log("ERROR", msg, meta),
  critical: (msg, meta) => log("CRITICAL", msg, meta),
};
