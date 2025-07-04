import { Router, Request, Response } from 'express';
import { authenticateBasic } from '../../middleware/auth';
import { createAuthRateLimit } from '../../services/rateLimiter';
import { catchAsync } from '../../middleware/errorHandler';
import { healthCheckNeo4j } from '../../infrastructure/neo4jUtils';
import winston from 'winston';
import { settings } from '../../config';

const router = Router();

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

// Public health check endpoint (no authentication required)
router.get('/health', createAuthRateLimit(), catchAsync(async (req: Request, res: Response): Promise<void> => {
  logger.debug('Health check endpoint was called.');
  
  const startTime = Date.now();
  const healthData: any = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid,
    version: process.env.npm_package_version || '1.0.0',
    node_version: process.version,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024)
    },
    services: {}
  };

  try {
    // Check Neo4j connectivity
    const neo4jHealthy = await healthCheckNeo4j();
    healthData.services.neo4j = {
      status: neo4jHealthy ? 'healthy' : 'unhealthy',
      checked_at: new Date().toISOString()
    };

    // If critical services are down, mark overall status as unhealthy
    if (!neo4jHealthy) {
      healthData.status = 'unhealthy';
    }

  } catch (error: any) {
    logger.error(`Health check failed: ${error.message}`);
    healthData.status = 'unhealthy';
    healthData.services.neo4j = {
      status: 'error',
      error: 'Connection check failed',
      checked_at: new Date().toISOString()
    };
  }

  healthData.response_time_ms = Date.now() - startTime;

  const statusCode = healthData.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json({
    success: healthData.status === 'healthy',
    data: healthData
  });
}));

// Detailed health check for authenticated users
router.get('/health/detailed', createAuthRateLimit(), authenticateBasic, catchAsync(async (req: Request, res: Response): Promise<void> => {
  logger.debug('Detailed health check endpoint was called.');
  
  const startTime = Date.now();
  const detailedHealth: any = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    memory: process.memoryUsage(),
    cpu_usage: process.cpuUsage(),
    services: {},
    configuration: {
      neo4j_uri: settings.neo4j.uri.replace(/\/\/.*@/, '//***:***@'), // Hide credentials
      app_port: settings.app.port,
      log_level: settings.app.log_level
    }
  };

  try {
    // Check Neo4j connectivity with more details
    const neo4jHealthy = await healthCheckNeo4j();
    detailedHealth.services.neo4j = {
      status: neo4jHealthy ? 'healthy' : 'unhealthy',
      database: settings.neo4j.database,
      checked_at: new Date().toISOString()
    };

    if (!neo4jHealthy) {
      detailedHealth.status = 'unhealthy';
    }

  } catch (error: any) {
    logger.error(`Detailed health check failed: ${error.message}`);
    detailedHealth.status = 'unhealthy';
    detailedHealth.services.neo4j = {
      status: 'error',
      error: 'Connection check failed',
      checked_at: new Date().toISOString()
    };
  }

  detailedHealth.response_time_ms = Date.now() - startTime;

  const statusCode = detailedHealth.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json({
    success: detailedHealth.status === 'healthy',
    data: detailedHealth
  });
}));

export default router;
