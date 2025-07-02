import { Router, Request, Response, RequestHandler } from 'express';
import { authenticateBasic } from '../../middleware/auth';
import { createAuthRateLimit } from '../../services/rateLimiter';
import catchAsync from '../../utils/catchAsync';
import neo4j, { auth, Driver } from 'neo4j-driver';
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

router.get('/health', createAuthRateLimit(), authenticateBasic, catchAsync(async (req: Request, res: Response): Promise<void> => {
  logger.debug('Health check endpoint was called.');
  const payload: { status: string; neo4j?: string } = { status: 'ok' };
  let driver: Driver | undefined;
  try {
    driver = neo4j.driver(
      settings.neo4j.uri,
      auth.basic(settings.neo4j.user, settings.neo4j.password)
    );
    const session = driver.session({ database: settings.neo4j.database });
    await session.run('RETURN 1');
    await session.close();
    payload.neo4j = 'up';
    res.json(payload);
  } catch (error) {
    logger.error(`Neo4j connection failed: ${error}`);
    payload.neo4j = 'down';
    payload.status = 'unhealthy';
    res.status(500).json(payload);
  } finally {
    if (driver) {
      await driver.close();
    }
  }
}));

export default router;
