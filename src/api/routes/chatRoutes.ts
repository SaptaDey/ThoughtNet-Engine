import { Router, Request, Response } from 'express';
import { askLLM, LLM_QUERY_LOGS, getLLMServiceStatus } from '../../services/llm';
import { authenticateBasic } from '../../middleware/auth';
import { createApiRateLimit } from '../../services/rateLimiter';
import { catchAsync } from '../../middleware/errorHandler';
import { createValidationMiddleware, commonSchemas } from '../../middleware/validation';
import winston from 'winston';
import { settings } from '../../config';
import { z } from 'zod';

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

// Validation schemas
const chatRequestSchema = z.object({
  question: z.string()
    .min(1, 'Question cannot be empty')
    .max(5000, 'Question too long (max 5000 characters)')
    .refine(
      (val) => val.trim().length > 0,
      'Question cannot be only whitespace'
    ),
  context: z.string().max(2000, 'Context too long').optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(4096).optional()
});

const chatHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0)
});

// Chat endpoint with proper validation
router.post('/chat', 
  createApiRateLimit(),
  authenticateBasic, 
  createValidationMiddleware({ body: chatRequestSchema }),
  catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { question, context, temperature, max_tokens } = req.body;
    
    logger.info(`Chat request received: ${question.substring(0, 100)}...`);
    
    try {
      // Check LLM service status before processing
      const serviceStatus = getLLMServiceStatus();
      if (serviceStatus.state === 'OPEN') {
        res.status(503).json({ 
          success: false,
          message: 'LLM service is currently unavailable. Please try again later.',
          service_status: serviceStatus
        });
        return;
      }

      const fullPrompt = context ? `Context: ${context}\n\nQuestion: ${question}` : question;
      const answer = await askLLM(fullPrompt);
      
      res.json({ 
        success: true,
        data: {
          answer,
          question,
          timestamp: new Date().toISOString(),
          service_status: serviceStatus
        }
      });
    } catch (error: any) {
      logger.error(`Error processing chat request: ${error.message}`);
      res.status(500).json({ 
        success: false,
        message: 'Error processing chat request.',
        error_code: 'CHAT_PROCESSING_ERROR'
      });
    }
  })
);

// Get chat history endpoint
router.get('/chat/history',
  createApiRateLimit(),
  authenticateBasic,
  createValidationMiddleware({ query: chatHistoryQuerySchema }),
  catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { limit, offset } = req.query as any;
    
    logger.debug(`Chat history requested: limit=${limit}, offset=${offset}`);
    
    const totalLogs = LLM_QUERY_LOGS.length;
    const paginatedLogs = LLM_QUERY_LOGS
      .slice(Math.max(0, totalLogs - offset - limit), Math.max(0, totalLogs - offset))
      .reverse(); // Most recent first
    
    res.json({
      success: true,
      data: {
        logs: paginatedLogs,
        pagination: {
          limit,
          offset,
          total: totalLogs,
          has_more: offset + limit < totalLogs
        }
      }
    });
  })
);

// Get LLM service status endpoint
router.get('/chat/status',
  createApiRateLimit(),
  authenticateBasic,
  catchAsync(async (req: Request, res: Response): Promise<void> => {
    const serviceStatus = getLLMServiceStatus();
    
    res.json({
      success: true,
      data: {
        service_status: serviceStatus,
        total_queries: LLM_QUERY_LOGS.length,
        last_query_time: LLM_QUERY_LOGS.length > 0 
          ? LLM_QUERY_LOGS[LLM_QUERY_LOGS.length - 1].timestamp
          : null
      }
    });
  })
);

export default router;
