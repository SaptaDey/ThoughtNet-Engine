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
const auth_1 = require("../../middleware/auth");
const rateLimiter_1 = require("../../services/rateLimiter");
const errorHandler_1 = require("../../middleware/errorHandler");
const neo4jUtils_1 = require("../../infrastructure/neo4jUtils");
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
// Public health check endpoint (no authentication required)
router.get('/health', (0, rateLimiter_1.createAuthRateLimit)(), (0, errorHandler_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    logger.debug('Health check endpoint was called.');
    const startTime = Date.now();
    const healthData = {
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
        const neo4jHealthy = yield (0, neo4jUtils_1.healthCheckNeo4j)();
        healthData.services.neo4j = {
            status: neo4jHealthy ? 'healthy' : 'unhealthy',
            checked_at: new Date().toISOString()
        };
        // If critical services are down, mark overall status as unhealthy
        if (!neo4jHealthy) {
            healthData.status = 'unhealthy';
        }
    }
    catch (error) {
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
})));
// Detailed health check for authenticated users
router.get('/health/detailed', (0, rateLimiter_1.createAuthRateLimit)(), auth_1.authenticateBasic, (0, errorHandler_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    logger.debug('Detailed health check endpoint was called.');
    const startTime = Date.now();
    const detailedHealth = {
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
            neo4j_uri: config_1.settings.neo4j.uri.replace(/\/\/.*@/, '//***:***@'), // Hide credentials
            app_port: config_1.settings.app.port,
            log_level: config_1.settings.app.log_level
        }
    };
    try {
        // Check Neo4j connectivity with more details
        const neo4jHealthy = yield (0, neo4jUtils_1.healthCheckNeo4j)();
        detailedHealth.services.neo4j = {
            status: neo4jHealthy ? 'healthy' : 'unhealthy',
            database: config_1.settings.neo4j.database,
            checked_at: new Date().toISOString()
        };
        if (!neo4jHealthy) {
            detailedHealth.status = 'unhealthy';
        }
    }
    catch (error) {
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
})));
exports.default = router;
