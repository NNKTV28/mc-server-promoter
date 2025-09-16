import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output with colors
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, service }) => {
    const serviceTag = service ? `[${service.toUpperCase()}]` : '';
    return `${timestamp} ${serviceTag} ${level}: ${message}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: 'info',
  defaultMeta: { service: 'alliance-server' },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),

    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),

    // Access log for HTTP requests
    new winston.transports.File({
      filename: path.join(logsDir, 'access.log'),
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, message }) => {
          return `${timestamp} ${message}`;
        })
      ),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),

    // Upload activity log
    new winston.transports.File({
      filename: path.join(logsDir, 'uploads.log'),
      level: 'info',
      format: fileFormat,
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3
    }),

    // Security events log
    new winston.transports.File({
      filename: path.join(logsDir, 'security.log'),
      level: 'warn',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    })
  ]
});

// Add console transport only if not in production
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Create specialized loggers for different components
export const accessLogger = winston.createLogger({
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'access.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, message }) => {
          return `${timestamp} ${message}`;
        })
      )
    })
  ]
});

export const uploadLogger = winston.createLogger({
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'uploads.log'),
      format: fileFormat
    })
  ]
});

export const securityLogger = winston.createLogger({
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'security.log'),
      format: fileFormat
    })
  ]
});

// Helper functions for different log types
export const logError = (message, error = null, context = {}) => {
  logger.error(message, { error: error?.stack || error, ...context });
};

export const logInfo = (message, context = {}) => {
  logger.info(message, context);
};

export const logWarn = (message, context = {}) => {
  logger.warn(message, context);
};

export const logDebug = (message, context = {}) => {
  logger.debug(message, context);
};

export const logAccess = (req, res, responseTime) => {
  const message = `${req.method} ${req.url} - ${res.statusCode} - ${responseTime}ms - ${req.ip} - "${req.get('user-agent') || 'unknown'}"`;
  accessLogger.info(message);
};

export const logUpload = (filename, originalName, size, user, success = true) => {
  uploadLogger.info('File upload', {
    filename,
    originalName,
    size,
    user: user?.username || 'anonymous',
    userId: user?.id,
    success,
    timestamp: new Date().toISOString()
  });
};

export const logSecurity = (event, level = 'warn', details = {}) => {
  securityLogger.log(level, `Security event: ${event}`, {
    event,
    ...details,
    timestamp: new Date().toISOString()
  });
};

// Console replacements that also log to files
export const consoleLog = (...args) => {
  const message = args.join(' ');
  console.log(...args);
  logger.info(message.replace(/[\x1b\[\d+m]/g, ''), { source: 'console' });
};

export const consoleError = (...args) => {
  const message = args.join(' ');
  console.error(...args);
  logger.error(message.replace(/[\x1b\[\d+m]/g, ''), { source: 'console' });
};

export const consoleWarn = (...args) => {
  const message = args.join(' ');
  console.warn(...args);
  logger.warn(message.replace(/[\x1b\[\d+m]/g, ''), { source: 'console' });
};

export default logger;