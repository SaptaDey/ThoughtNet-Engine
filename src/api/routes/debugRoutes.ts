import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { authenticateBasic } from '../../middleware/auth';
import { createStrictRateLimit } from '../../services/rateLimiter';
import catchAsync from '../../utils/catchAsync';
import neo4j, { auth, Driver } from 'neo4j-driver';
import winston from 'winston';
import { settings } from '../../config';
import { LLM_QUERY_LOGS } from '../../services/llm';

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

router.get('/debug', createStrictRateLimit(), authenticateBasic, catchAsync(async (req: Request, res: Response): Promise<void> => {
  const start = process.hrtime.bigint();
  let neo4jStatus = 'down';
  let latency = -1;
  let driver: Driver | undefined;

  try {
    driver = neo4j.driver(
      settings.neo4j.uri,
      auth.basic(settings.neo4j.user, settings.neo4j.password)
    );
    const session = driver.session({ database: settings.neo4j.database });
    await session.run('RETURN 1');
    await session.close();
    neo4jStatus = 'up';
    const end = process.hrtime.bigint();
    latency = Number(end - start) / 1_000_000;
  } catch (error) {
    logger.error(`Neo4j connection failed for debug endpoint: ${error}`);
  }
  finally {
    if (driver) {
      await driver.close();
    }
  }

  const logsHtml = LLM_QUERY_LOGS.map(l => `<li><b>Prompt:</b> ${l.prompt.substring(0, 50)}<br><b>Response:</b> ${l.response.substring(0, 50)}</li>`).join('');

  const html = `<h1>Debug</h1><p>Neo4j status: ${neo4jStatus}, latency: ${latency.toFixed(2)} ms</p><h2>Last LLM Queries</h2><ul>${logsHtml}</ul>`;
  res.send(html);
}));

export default router;
