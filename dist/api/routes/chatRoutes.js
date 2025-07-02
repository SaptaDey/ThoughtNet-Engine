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
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../../config");
const router = (0, express_1.Router)();
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
router.post('/chat', (0, rateLimiter_1.createApiRateLimit)(), auth_1.authenticateBasic, (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const question = req.body.question;
    if (!question) {
        res.status(400).json({ message: 'Question is required.' });
        return;
    }
    try {
        const answer = yield (0, llm_1.askLLM)(question);
        res.json({ answer });
    }
    catch (error) {
        logger.error(`Error processing chat request: ${error}`);
        res.status(500).json({ message: 'Error processing chat request.' });
    }
})));
exports.default = router;
