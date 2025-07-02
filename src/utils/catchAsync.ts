import { Request, Response, NextFunction, RequestHandler } from 'express';

interface SanitizedError {
  message: string;
  statusCode: number;
  isOperational: boolean;
}

const sanitizeError = (error: any): SanitizedError => {
  // Don't expose internal system information
  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /token/i,
    /key/i,
    /credential/i,
    /auth/i,
    /session/i,
    /mongo/i,
    /database/i,
    /neo4j/i,
    /localhost/i,
    /127\.0\.0\.1/i,
    /file:\/\//i,
    /Error: ENOENT/i
  ];

  let message = 'Internal server error';
  let statusCode = 500;
  let isOperational = false;

  if (error) {
    // Check if it's a known operational error
    if (error.statusCode && error.statusCode < 500) {
      statusCode = error.statusCode;
      isOperational = true;
    }

    // Only include the message if it doesn't contain sensitive information
    if (error.message && typeof error.message === 'string') {
      const containsSensitive = sensitivePatterns.some(pattern => 
        pattern.test(error.message)
      );
      
      if (!containsSensitive && isOperational) {
        message = error.message;
      } else if (error.name === 'ValidationError') {
        message = 'Validation failed';
        statusCode = 400;
        isOperational = true;
      } else if (error.name === 'CastError') {
        message = 'Invalid data format';
        statusCode = 400;
        isOperational = true;
      } else if (error.code === 11000) {
        message = 'Duplicate entry';
        statusCode = 409;
        isOperational = true;
      }
    }
  }

  return { message, statusCode, isOperational };
};

const catchAsync = (fn: RequestHandler): RequestHandler => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  Promise.resolve(fn(req, res, next)).catch((error: any) => {
    // Create sanitized error for logging
    const sanitizedForLogging = sanitizeError(error);
    
    // Log sanitized error information (server-side only)
    console.error('Caught async error:', {
      message: sanitizedForLogging.message,
      statusCode: sanitizedForLogging.statusCode,
      url: req.url,
      method: req.method,
      ip: req.ip ? req.ip.replace(/\d+\.\d+\.\d+\.\d+/, '[IP_MASKED]') : 'unknown',
      userAgent: req.get('User-Agent') ? '[USER_AGENT_PRESENT]' : 'none',
      timestamp: new Date().toISOString()
    });

    // Send sanitized error to client
    const sanitized = sanitizeError(error);
    
    res.status(sanitized.statusCode).json({
      success: false,
      message: sanitized.message,
      ...(process.env.NODE_ENV === 'development' && 
          process.env.EXPOSE_DEBUG_INFO === 'true' && { 
        debug: {
          originalMessage: sanitizedForLogging.message,
          statusCode: sanitized.statusCode,
          timestamp: new Date().toISOString()
        }
      })
    });
  });
};

export default catchAsync;