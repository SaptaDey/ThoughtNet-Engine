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
exports.Neo4jDatabaseManager = void 0;
const neo4j_driver_1 = __importStar(require("neo4j-driver"));
const config_1 = require("../config");
const winston_1 = __importDefault(require("winston"));
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
class Neo4jDatabaseManager {
    constructor() {
        this.maxPoolSize = 50;
        this.connectionTimeout = 30000; // 30 seconds
        this.maxTransactionRetryTime = 15000; // 15 seconds
        this.driver = neo4j_driver_1.default.driver(config_1.settings.neo4j.uri, neo4j_driver_1.auth.basic(config_1.settings.neo4j.user, config_1.settings.neo4j.password), {
            maxConnectionPoolSize: this.maxPoolSize,
            connectionAcquisitionTimeout: this.connectionTimeout,
            maxTransactionRetryTime: this.maxTransactionRetryTime,
            encrypted: 'ENCRYPTION_ON',
            trust: 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES',
            connectionTimeout: this.connectionTimeout
        });
        // Verify connectivity without exposing credentials
        this.driver.verifyConnectivity()
            .then(() => logger.info("Neo4j driver connected successfully."))
            .catch((error) => {
            var _a;
            // Sanitize error message to avoid credential exposure
            const sanitizedMessage = ((_a = error.message) === null || _a === void 0 ? void 0 : _a.replace(/password=[^&\s]*/gi, 'password=***')) || 'Connection failed';
            logger.error(`Neo4j driver connection failed: ${sanitizedMessage}`);
            // In production, we should exit on connection failure
            if (process.env.NODE_ENV === 'production') {
                process.exit(1);
            }
        });
    }
    executeQuery(query_1, parameters_1, database_1) {
        return __awaiter(this, arguments, void 0, function* (query, parameters, database, txType = "read") {
            let session;
            try {
                // Input validation and sanitization
                if (!query || typeof query !== 'string') {
                    throw new Error('Query must be a non-empty string');
                }
                // Basic Cypher injection protection
                const sanitizedQuery = this.sanitizeCypherQuery(query);
                session = this.driver.session({
                    database: database || config_1.settings.neo4j.database,
                    defaultAccessMode: txType === "read" ? neo4j_driver_1.default.session.READ : neo4j_driver_1.default.session.WRITE
                });
                const result = yield session[txType === "read" ? "readTransaction" : "writeTransaction"]((tx) => tx.run(sanitizedQuery, parameters));
                return result.records.map(record => record.toObject());
            }
            catch (error) {
                // Sanitize error message to avoid parameter exposure
                const sanitizedError = this.sanitizeErrorMessage(error);
                logger.error(`Error executing Neo4j query: ${sanitizedError}`);
                throw new Error(`Database query failed: ${sanitizedError}`);
            }
            finally {
                if (session) {
                    yield session.close();
                }
            }
        });
    }
    sanitizeCypherQuery(query) {
        // Remove potentially dangerous operations
        const dangerousPatterns = [
            /CALL\s+dbms\./gi,
            /CALL\s+db\./gi,
            /DROP\s+/gi,
            /DELETE\s+/gi,
            /REMOVE\s+/gi
        ];
        for (const pattern of dangerousPatterns) {
            if (pattern.test(query)) {
                throw new Error('Query contains potentially dangerous operations');
            }
        }
        return query.trim();
    }
    sanitizeErrorMessage(error) {
        if (!error || typeof error.message !== 'string') {
            return 'Unknown database error';
        }
        // Remove sensitive information from error messages
        return error.message
            .replace(/password=[^&\s]*/gi, 'password=***')
            .replace(/user=[^&\s]*/gi, 'user=***')
            .replace(/uri=[^&\s]*/gi, 'uri=***');
    }
    executeInTransaction(operations_1) {
        return __awaiter(this, arguments, void 0, function* (operations, txType = "write", database) {
            let session;
            try {
                session = this.driver.session({
                    database: database || config_1.settings.neo4j.database,
                    defaultAccessMode: txType === "read" ? neo4j_driver_1.default.session.READ : neo4j_driver_1.default.session.WRITE
                });
                if (txType === "read") {
                    return yield session.readTransaction(operations);
                }
                else {
                    return yield session.writeTransaction(operations);
                }
            }
            catch (error) {
                const sanitizedError = this.sanitizeErrorMessage(error);
                logger.error(`Error executing Neo4j transaction: ${sanitizedError}`);
                throw new Error(`Database transaction failed: ${sanitizedError}`);
            }
            finally {
                if (session) {
                    yield session.close();
                }
            }
        });
    }
    closeConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.driver.close();
                logger.info("Neo4j connection closed successfully");
            }
            catch (error) {
                const sanitizedError = this.sanitizeErrorMessage(error);
                logger.error(`Error closing Neo4j connection: ${sanitizedError}`);
            }
        });
    }
    healthCheck() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.driver.verifyConnectivity();
                return true;
            }
            catch (error) {
                return false;
            }
        });
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.driver.close();
            logger.info("Neo4j driver closed.");
        });
    }
}
exports.Neo4jDatabaseManager = Neo4jDatabaseManager;
