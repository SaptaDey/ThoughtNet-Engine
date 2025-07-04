"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const llm_1 = require("../../services/llm");
const auth_1 = require("../../middleware/auth");
const rateLimiter_1 = require("../../services/rateLimiter");
const errorHandler_1 = require("../../middleware/errorHandler");
const validation_1 = require("../../middleware/validation");
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../../config");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
// Validation schemas
const chatRequestSchema = zod_1.z.object({
    question: zod_1.z.string()
        .min(1, 'Question cannot be empty')
        .max(5000, 'Question too long (max 5000 characters)')
        .refine((val) => val.trim().length > 0, 'Question cannot be only whitespace'),
    context: zod_1.z.string().max(2000, 'Context too long').optional(),
    temperature: zod_1.z.number().min(0).max(2).optional(),
    max_tokens: zod_1.z.number().int().min(1).max(4096).optional()
});
const chatHistoryQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().min(1).max(50).default(10),
    offset: zod_1.z.coerce.number().int().min(0).default(0)
});
// Chat endpoint with proper validation
router.post('/chat', (0, rateLimiter_1.createApiRateLimit)(), auth_1.authenticateBasic, (0, validation_1.createValidationMiddleware)({ body: chatRequestSchema }), (0, errorHandler_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { question, context, temperature, max_tokens } = req.body;
    logger.info(`Chat request received: ${question.substring(0, 100)}...`);
    try {
        // Check LLM service status before processing
        const serviceStatus = (0, llm_1.getLLMServiceStatus)();
        if (serviceStatus.state === 'OPEN') {
            res.status(503).json({
                success: false,
                message: 'LLM service is currently unavailable. Please try again later.',
                service_status: serviceStatus
            });
            return;
        }
        const fullPrompt = context ? `Context: ${context}\n\nQuestion: ${question}` : question;
        const answer = yield (0, llm_1.askLLM)(fullPrompt);
        res.json({
            success: true,
            data: {
                answer,
                question,
                timestamp: new Date().toISOString(),
                service_status: serviceStatus
            }
        });
    }
    catch (error) {
        logger.error(`Error processing chat request: ${error.message}`);
        res.status(500).json({
            success: false,
            message: 'Error processing chat request.',
            error_code: 'CHAT_PROCESSING_ERROR'
        });
    }
})));
// Get chat history endpoint
router.get('/chat/history', (0, rateLimiter_1.createApiRateLimit)(), auth_1.authenticateBasic, (0, validation_1.createValidationMiddleware)({ query: chatHistoryQuerySchema }), (0, errorHandler_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { limit, offset } = req.query;
    logger.debug(`Chat history requested: limit=${limit}, offset=${offset}`);
    const totalLogs = llm_1.LLM_QUERY_LOGS.length;
    const paginatedLogs = llm_1.LLM_QUERY_LOGS
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
})));
// Get LLM service status endpoint
router.get('/chat/status', (0, rateLimiter_1.createApiRateLimit)(), auth_1.authenticateBasic, (0, errorHandler_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const serviceStatus = (0, llm_1.getLLMServiceStatus)();
    res.json({
        success: true,
        data: {
            service_status: serviceStatus,
            total_queries: llm_1.LLM_QUERY_LOGS.length,
            last_query_time: llm_1.LLM_QUERY_LOGS.length > 0
                ? llm_1.LLM_QUERY_LOGS[llm_1.LLM_QUERY_LOGS.length - 1].timestamp
                : null
        }
    });
})));
exports.default = router;
