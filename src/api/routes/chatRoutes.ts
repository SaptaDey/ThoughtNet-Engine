import { Router, Request, Response, RequestHandler } from 'express';
import { askLLM, LLM_QUERY_LOGS } from '../../services/llm';
import { authenticateBasic } from '../../middleware/auth';
import { createApiRateLimit } from '../../services/rateLimiter';
import catchAsync from '../../utils/catchAsync';
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

router.post('/chat', createApiRateLimit() as RequestHandler, authenticateBasic, catchAsync(async (req: Request, res: Response): Promise<void> => {
  const question = (req.body as { question: string }).question;
  if (!question) {
    res.status(400).json({ message: 'Question is required.' });
    return;
  }
  try {
    const answer = await askLLM(question);
    res.json({ answer });
  } catch (error) {
    logger.error(`Error processing chat request: ${error}`);
    res.status(500).json({ message: 'Error processing chat request.' });
  }
}) as RequestHandler);

export default router;
