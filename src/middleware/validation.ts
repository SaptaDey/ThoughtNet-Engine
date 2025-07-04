import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

export interface ValidationConfig {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
}

export const createValidationMiddleware = (config: ValidationConfig) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      if (config.body && req.body) {
        req.body = config.body.parse(req.body);
      }

      // Validate query parameters
      if (config.query && req.query) {
        req.query = config.query.parse(req.query);
      }

      // Validate route parameters
      if (config.params && req.params) {
        req.params = config.params.parse(req.params);
      }

      // Validate headers
      if (config.headers && req.headers) {
        // Only validate specific headers, not all
        const headersToValidate: Record<string, any> = {};
        const headerSchema = config.headers as any;
        
        if (headerSchema.shape) {
          for (const key of Object.keys(headerSchema.shape)) {
            if (req.headers[key.toLowerCase()]) {
              headersToValidate[key] = req.headers[key.toLowerCase()];
            }
          }
          config.headers.parse(headersToValidate);
        }
      }

      next();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validationErrors
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal validation error'
        });
      }
    }
  };
};

// Common validation schemas
export const commonSchemas = {
  id: z.string().uuid('Invalid UUID format'),
  positiveInteger: z.number().int().positive('Must be a positive integer'),
  nonEmptyString: z.string().min(1, 'Cannot be empty').max(1000, 'Too long'),
  email: z.string().email('Invalid email format'),
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  }),
  sessionId: z.string().regex(/^[a-zA-Z0-9-_]{16,128}$/, 'Invalid session ID format'),
  ipAddress: z.string().ip('Invalid IP address'),
  userAgent: z.string().max(500, 'User agent too long')
};

// Sanitization helpers
export const sanitizers = {
  html: (input: string): string => {
    return input
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '');
  },
  
  cypher: (input: string): string => {
    // Remove potentially dangerous Cypher operations
    return input
      .replace(/\bDROP\b/gi, '')
      .replace(/\bDELETE\b/gi, '')
      .replace(/\bCALL\s+dbms\./gi, '')
      .replace(/\bCALL\s+db\./gi, '');
  },
  
  filename: (input: string): string => {
    return input
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .substring(0, 255);
  }
};

// Rate limiting schema
export const rateLimitSchema = z.object({
  windowMs: z.number().int().min(1000).max(3600000), // 1 second to 1 hour
  maxRequests: z.number().int().min(1).max(10000),
  keyGenerator: z.function().optional()
});

export default createValidationMiddleware;