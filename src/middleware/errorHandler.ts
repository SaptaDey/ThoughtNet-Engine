import { Request, Response, NextFunction } from 'express';
import winston from 'winston';
import { settings } from '../config';

const logger = winston.createLogger({
  level: settings.app.log_level.toLowerCase(),
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)
  ),
  transports: [
    new winston.transports.Console()
  ],
});

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
  details?: any;
}

export class ValidationError extends Error implements AppError {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  isOperational = true;

  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error implements AppError {
  statusCode = 401;
  code = 'AUTHENTICATION_ERROR';
  isOperational = true;

  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error implements AppError {
  statusCode = 403;
  code = 'AUTHORIZATION_ERROR';
  isOperational = true;

  constructor(message: string = 'Access denied') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error implements AppError {
  statusCode = 404;
  code = 'NOT_FOUND_ERROR';
  isOperational = true;

  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends Error implements AppError {
  statusCode = 429;
  code = 'RATE_LIMIT_ERROR';
  isOperational = true;

  constructor(message: string = 'Too many requests') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class DatabaseError extends Error implements AppError {
  statusCode = 500;
  code = 'DATABASE_ERROR';
  isOperational = true;

  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ExternalServiceError extends Error implements AppError {
  statusCode = 502;
  code = 'EXTERNAL_SERVICE_ERROR';
  isOperational = true;

  constructor(message: string, public service?: string) {
    super(message);
    this.name = 'ExternalServiceError';
  }
}

// Error response formatter
const formatErrorResponse = (error: AppError, includeStack = false) => {
  const response: any = {
    success: false,
    error: {
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      statusCode: error.statusCode || 500
    }
  };

  if (error.details) {
    response.error.details = error.details;
  }

  if (includeStack && error.stack) {
    response.error.stack = error.stack;
  }

  // Add correlation ID for tracking
  response.error.correlationId = generateCorrelationId();

  return response;
};

const generateCorrelationId = (): string => {
  return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Sanitize sensitive information from error messages
const sanitizeErrorMessage = (message: string): string => {
  return message
    .replace(/password=[^&\s]*/gi, 'password=***')
    .replace(/token=[^&\s]*/gi, 'token=***')
    .replace(/key=[^&\s]*/gi, 'key=***')
    .replace(/secret=[^&\s]*/gi, 'secret=***');
};

// Global error handler middleware
export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }

  const isDevelopment = process.env.NODE_ENV === 'development';
  let statusCode = 500;
  let formattedError: AppError;

  // Handle known error types
  if (error.name === 'ValidationError' || error.statusCode === 400) {
    formattedError = new ValidationError(sanitizeErrorMessage(error.message), error.details);
  } else if (error.name === 'UnauthorizedError' || error.statusCode === 401) {
    formattedError = new AuthenticationError(sanitizeErrorMessage(error.message));
  } else if (error.statusCode === 403) {
    formattedError = new AuthorizationError(sanitizeErrorMessage(error.message));
  } else if (error.statusCode === 404) {
    formattedError = new NotFoundError(sanitizeErrorMessage(error.message));
  } else if (error.statusCode === 429) {
    formattedError = new RateLimitError(sanitizeErrorMessage(error.message));
  } else if (error.name === 'Neo4jError' || error.name === 'DatabaseError') {
    formattedError = new DatabaseError('Database operation failed', error);
  } else {
    // Generic server error
    formattedError = {
      name: 'InternalServerError',
      message: isDevelopment ? sanitizeErrorMessage(error.message) : 'Internal server error',
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      isOperational: false
    } as AppError;
  }

  statusCode = formattedError.statusCode || 500;

  // Log error with appropriate level
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  const logMessage = `${req.method} ${req.path} - ${statusCode} - ${formattedError.message}`;
  
  logger[logLevel](logMessage, {
    error: {
      name: error.name,
      message: error.message,
      stack: isDevelopment ? error.stack : undefined
    },
    request: {
      method: req.method,
      url: req.url,
      headers: isDevelopment ? req.headers : { 'user-agent': req.headers['user-agent'] },
      ip: req.ip,
      correlationId: (req as any).correlationId
    }
  });

  // Send error response
  const errorResponse = formatErrorResponse(formattedError, isDevelopment);
  res.status(statusCode).json(errorResponse);
};

// Async error wrapper to catch promise rejections
export const catchAsync = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler for unmatched routes
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Route ${req.method} ${req.path} not found`);
  next(error);
};

// Health check endpoint error handling
export const healthCheckErrorHandler = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Basic health check logic
    res.status(200).json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid
    });
  } catch (error) {
    next(new DatabaseError('Health check failed'));
  }
};

export default errorHandler;