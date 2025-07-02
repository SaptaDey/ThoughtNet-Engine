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
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const neo4j_driver_1 = __importStar(require("neo4j-driver"));
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../../config");
const llm_1 = require("../../services/llm");
const router = (0, express_1.Router)();
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
router.get('/debug', (0, rateLimiter_1.createStrictRateLimit)(), auth_1.authenticateBasic, (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const start = process.hrtime.bigint();
    let neo4jStatus = 'down';
    let latency = -1;
    let driver;
    try {
        driver = neo4j_driver_1.default.driver(config_1.settings.neo4j.uri, neo4j_driver_1.auth.basic(config_1.settings.neo4j.user, config_1.settings.neo4j.password));
        const session = driver.session({ database: config_1.settings.neo4j.database });
        yield session.run('RETURN 1');
        yield session.close();
        neo4jStatus = 'up';
        const end = process.hrtime.bigint();
        latency = Number(end - start) / 1000000;
    }
    catch (error) {
        logger.error(`Neo4j connection failed for debug endpoint: ${error}`);
    }
    finally {
        if (driver) {
            yield driver.close();
        }
    }
    const logsHtml = llm_1.LLM_QUERY_LOGS.map(l => `<li><b>Prompt:</b> ${l.prompt.substring(0, 50)}<br><b>Response:</b> ${l.response.substring(0, 50)}</li>`).join('');
    const html = `<h1>Debug</h1><p>Neo4j status: ${neo4jStatus}, latency: ${latency.toFixed(2)} ms</p><h2>Last LLM Queries</h2><ul>${logsHtml}</ul>`;
    res.send(html);
})));
exports.default = router;
