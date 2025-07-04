import express, { Request, Response, NextFunction, RequestHandler, Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { settings } from './config';
import { authenticateBasic } from './middleware/auth';
import { createAuthRateLimit, createApiRateLimit, createStrictRateLimit } from './services/rateLimiter';
import { createSecurityMiddleware, createSessionValidator } from './middleware/security';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

import neo4j, { auth, Driver } from 'neo4j-driver';
import winston from 'winston';
import { askLLM, LLM_QUERY_LOGS } from './services/llm';


import mcpPublicRoutes from './api/routes/mcpPublicRoutes';
import mcpAdminRoutes from './api/routes/mcpAdminRoutes';
import debugRoutes from './api/routes/debugRoutes';
import healthRoutes from './api/routes/healthRoutes';
import chatRoutes from './api/routes/chatRoutes';

// Configure Winston logger
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


export const createApp = () => {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // Trust proxy for rate limiting
  app.set('trust proxy', 1);

  // Additional security middleware
  app.use(createSecurityMiddleware({
    maxSessionAge: 30 * 60, // 30 minutes
  }) as RequestHandler);

  // Session validation middleware
  app.use(createSessionValidator() as RequestHandler);

  // Body parsing middleware with limits and validation
  app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
      // Validate JSON structure
      try {
        JSON.parse(buf.toString());
      } catch (e) {
        throw new Error('Invalid JSON');
      }
    }
  }));
  
  app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb' 
  }));

  // Add request correlation ID
  app.use((req: Request, res: Response, next: NextFunction) => {
    (req as any).correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader('X-Correlation-ID', (req as any).correlationId);
    next();
  });

  // CORS configuration with security headers
  const allowedOriginsStr = settings.app.cors_allowed_origins_str;
  let allowedOrigins: string[] | boolean;

  if (allowedOriginsStr === '*') {
    // In production, warn about using wildcard
    if (process.env.NODE_ENV === 'production') {
      logger.warn('SECURITY WARNING: CORS is configured to allow all origins (*) in production. This may pose security risks.');
    }
    allowedOrigins = true; // Express cors uses true for all origins
  } else {
    allowedOrigins = allowedOriginsStr.split(',').map(origin => origin.trim()).filter(origin => origin.length > 0);
    if (allowedOrigins.length === 0) {
      logger.warn('APP_CORS_ALLOWED_ORIGINS_STR was not \'*\' and parsed to empty list. Defaulting to localhost only for security.');
      allowedOrigins = ['http://localhost:3000', 'https://localhost:3000'];
    }
  }

  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset'
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining', 
      'X-RateLimit-Reset'
    ],
    maxAge: 86400, // 24 hours
  }));

  logger.info(`CORS middleware configured with origins: ${Array.isArray(allowedOrigins) ? allowedOrigins.join(', ') : 'all origins (*)'}`);

  // Rate limiting middleware
  const authRateLimit = createAuthRateLimit();
  const apiRateLimit = createApiRateLimit();
  const strictRateLimit = createStrictRateLimit();

  // Chat endpoint - API rate limited
  app.use('/chat', chatRoutes);

  app.use('/health', healthRoutes);

  app.use('/debug', debugRoutes);

  // Include routers
  // MCP routes with rate limiting
  const mcpRouter = Router();
  mcpRouter.use(apiRateLimit as RequestHandler);
  mcpRouter.use(mcpPublicRoutes as RequestHandler);
  app.use('/mcp', mcpRouter);

  const adminMcpRouter = Router();
  adminMcpRouter.use(strictRateLimit as RequestHandler);
  adminMcpRouter.use(mcpAdminRoutes as RequestHandler);
  app.use('/admin/mcp', adminMcpRouter);

  // 404 handler for unmatched routes
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  logger.info(`${settings.app.name} v${settings.app.version} application instance created.`);

  return app;
};