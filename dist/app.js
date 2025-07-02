"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = void 0;
const express_1 = __importStar(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const config_1 = require("./config");
const rateLimiter_1 = require("./services/rateLimiter");
const security_1 = require("./middleware/security");
const winston_1 = __importDefault(require("winston"));
const mcpPublicRoutes_1 = __importDefault(require("./api/routes/mcpPublicRoutes"));
const mcpAdminRoutes_1 = __importDefault(require("./api/routes/mcpAdminRoutes"));
const debugRoutes_1 = __importDefault(require("./api/routes/debugRoutes"));
const healthRoutes_1 = __importDefault(require("./api/routes/healthRoutes"));
const chatRoutes_1 = __importDefault(require("./api/routes/chatRoutes"));
// Configure Winston logger
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
const createApp = () => {
    const app = (0, express_1.default)();
    // Security middleware
    app.use((0, helmet_1.default)({
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
    app.use((0, security_1.createSecurityMiddleware)({
        maxSessionAge: 30 * 60, // 30 minutes
    }));
    // Session validation middleware
    app.use((0, security_1.createSessionValidator)());
    // Body parsing middleware with limits
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
    // CORS configuration with security headers
    const allowedOriginsStr = config_1.settings.app.cors_allowed_origins_str;
    let allowedOrigins;
    if (allowedOriginsStr === '*') {
        // In production, warn about using wildcard
        if (process.env.NODE_ENV === 'production') {
            logger.warn('SECURITY WARNING: CORS is configured to allow all origins (*) in production. This may pose security risks.');
        }
        allowedOrigins = true; // Express cors uses true for all origins
    }
    else {
        allowedOrigins = allowedOriginsStr.split(',').map(origin => origin.trim()).filter(origin => origin.length > 0);
        if (allowedOrigins.length === 0) {
            logger.warn('APP_CORS_ALLOWED_ORIGINS_STR was not \'*\' and parsed to empty list. Defaulting to localhost only for security.');
            allowedOrigins = ['http://localhost:3000', 'https://localhost:3000'];
        }
    }
    app.use((0, cors_1.default)({
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
    const authRateLimit = (0, rateLimiter_1.createAuthRateLimit)();
    const apiRateLimit = (0, rateLimiter_1.createApiRateLimit)();
    const strictRateLimit = (0, rateLimiter_1.createStrictRateLimit)();
    // Chat endpoint - API rate limited
    app.use('/chat', chatRoutes_1.default);
    app.use('/health', healthRoutes_1.default);
    app.use('/debug', debugRoutes_1.default);
    // Include routers
    // MCP routes with rate limiting
    const mcpRouter = (0, express_1.Router)();
    mcpRouter.use(apiRateLimit);
    mcpRouter.use(mcpPublicRoutes_1.default);
    app.use('/mcp', mcpRouter);
    const adminMcpRouter = (0, express_1.Router)();
    adminMcpRouter.use(strictRateLimit);
    adminMcpRouter.use(mcpAdminRoutes_1.default);
    app.use('/admin/mcp', adminMcpRouter);
    logger.info(`${config_1.settings.app.name} v${config_1.settings.app.version} application instance created.`);
    return app;
};
exports.createApp = createApp;
