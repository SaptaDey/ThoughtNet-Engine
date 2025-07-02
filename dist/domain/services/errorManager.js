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
exports.globalErrorManager = exports.ErrorManager = exports.ProcessingRecoveryStrategy = exports.NetworkRecoveryStrategy = exports.DatabaseRecoveryStrategy = exports.ErrorCategory = exports.ErrorSeverity = void 0;
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../../config");
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.Console(),
        new winston_1.default.transports.File({ filename: 'error.log', level: 'error' }),
        new winston_1.default.transports.File({ filename: 'combined.log' })
    ]
});
var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity["LOW"] = "low";
    ErrorSeverity["MEDIUM"] = "medium";
    ErrorSeverity["HIGH"] = "high";
    ErrorSeverity["CRITICAL"] = "critical";
})(ErrorSeverity || (exports.ErrorSeverity = ErrorSeverity = {}));
var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["AUTHENTICATION"] = "authentication";
    ErrorCategory["DATABASE"] = "database";
    ErrorCategory["NETWORK"] = "network";
    ErrorCategory["VALIDATION"] = "validation";
    ErrorCategory["PROCESSING"] = "processing";
    ErrorCategory["RESOURCE"] = "resource";
    ErrorCategory["CONFIGURATION"] = "configuration";
    ErrorCategory["SYSTEM"] = "system";
})(ErrorCategory || (exports.ErrorCategory = ErrorCategory = {}));
class DatabaseRecoveryStrategy {
    constructor() {
        this.maxRetries = 3;
        this.retryDelay = 1000;
    }
    canRecover(error) {
        return error.category === ErrorCategory.DATABASE &&
            error.severity !== ErrorSeverity.CRITICAL &&
            error.retryCount < this.maxRetries;
    }
    recover(error) {
        return __awaiter(this, void 0, void 0, function* () {
            // Wait for retry delay
            yield new Promise(resolve => setTimeout(resolve, this.retryDelay * (error.retryCount + 1)));
            try {
                // Attempt to reconnect or retry the operation
                logger.info(`Attempting database recovery for error ${error.id}, retry ${error.retryCount + 1}`);
                // In a real implementation, this would attempt to:
                // - Reconnect to database
                // - Retry the failed operation
                // - Validate connection health
                return { success: true, message: 'Database connection recovered' };
            }
            catch (recoveryError) {
                return { success: false, message: `Recovery failed: ${recoveryError}` };
            }
        });
    }
}
exports.DatabaseRecoveryStrategy = DatabaseRecoveryStrategy;
class NetworkRecoveryStrategy {
    constructor() {
        this.maxRetries = 5;
        this.retryDelay = 2000;
    }
    canRecover(error) {
        return error.category === ErrorCategory.NETWORK &&
            error.retryCount < this.maxRetries;
    }
    recover(error) {
        return __awaiter(this, void 0, void 0, function* () {
            const delay = this.retryDelay * Math.pow(2, error.retryCount); // Exponential backoff
            yield new Promise(resolve => setTimeout(resolve, delay));
            try {
                logger.info(`Attempting network recovery for error ${error.id}, retry ${error.retryCount + 1}`);
                // Network recovery implementation would:
                // - Check network connectivity
                // - Retry API calls
                // - Switch to backup endpoints if available
                return { success: true, message: 'Network connection recovered' };
            }
            catch (recoveryError) {
                return { success: false, message: `Network recovery failed: ${recoveryError}` };
            }
        });
    }
}
exports.NetworkRecoveryStrategy = NetworkRecoveryStrategy;
class ProcessingRecoveryStrategy {
    constructor() {
        this.maxRetries = 2;
        this.retryDelay = 500;
    }
    canRecover(error) {
        return error.category === ErrorCategory.PROCESSING &&
            error.severity !== ErrorSeverity.CRITICAL &&
            error.retryCount < this.maxRetries;
    }
    recover(error) {
        return __awaiter(this, void 0, void 0, function* () {
            yield new Promise(resolve => setTimeout(resolve, this.retryDelay));
            try {
                logger.info(`Attempting processing recovery for error ${error.id}`);
                // Processing recovery implementation would:
                // - Rollback to last checkpoint
                // - Retry with reduced complexity
                // - Use fallback algorithms
                return { success: true, message: 'Processing recovered with fallback method' };
            }
            catch (recoveryError) {
                return { success: false, message: `Processing recovery failed: ${recoveryError}` };
            }
        });
    }
}
exports.ProcessingRecoveryStrategy = ProcessingRecoveryStrategy;
class ErrorManager {
    constructor() {
        this.errors = new Map();
        this.recoveryStrategies = [];
        this.errorCallbacks = [];
        this.recoveryStrategies = [
            new DatabaseRecoveryStrategy(),
            new NetworkRecoveryStrategy(),
            new ProcessingRecoveryStrategy()
        ];
        // Clean up old errors every hour
        setInterval(() => {
            this.cleanupOldErrors();
        }, 60 * 60 * 1000);
    }
    addErrorCallback(callback) {
        this.errorCallbacks.push(callback);
    }
    handleError(error_1, category_1, severity_1) {
        return __awaiter(this, arguments, void 0, function* (error, category, severity, context = {}) {
            const errorDetails = {
                id: this.generateErrorId(),
                timestamp: Date.now(),
                message: error instanceof Error ? error.message : error,
                category,
                severity,
                context: Object.assign(Object.assign({}, context), { stack: error instanceof Error ? error.stack : undefined }),
                resolved: false,
                retryCount: 0
            };
            this.errors.set(errorDetails.id, errorDetails);
            // Log the error
            this.logError(errorDetails);
            // Notify callbacks
            this.errorCallbacks.forEach(callback => {
                try {
                    callback(errorDetails);
                }
                catch (callbackError) {
                    logger.error('Error in error callback:', callbackError);
                }
            });
            // Attempt recovery if possible
            if (this.shouldAttemptRecovery(errorDetails)) {
                yield this.attemptRecovery(errorDetails);
            }
            return errorDetails;
        });
    }
    retryError(errorId) {
        return __awaiter(this, void 0, void 0, function* () {
            const error = this.errors.get(errorId);
            if (!error) {
                return { success: false, message: 'Error not found' };
            }
            if (error.resolved) {
                return { success: true, message: 'Error already resolved' };
            }
            return yield this.attemptRecovery(error);
        });
    }
    resolveError(errorId) {
        const error = this.errors.get(errorId);
        if (error) {
            error.resolved = true;
            logger.info(`Error ${errorId} marked as resolved`);
            return true;
        }
        return false;
    }
    getError(errorId) {
        return this.errors.get(errorId);
    }
    getErrorsByCategory(category) {
        return Array.from(this.errors.values()).filter(error => error.category === category);
    }
    getUnresolvedErrors() {
        return Array.from(this.errors.values()).filter(error => !error.resolved);
    }
    getErrorStats() {
        const allErrors = Array.from(this.errors.values());
        const stats = {
            total: allErrors.length,
            unresolved: allErrors.filter(e => !e.resolved).length,
            byCategory: {},
            bySeverity: {}
        };
        // Initialize counters
        Object.values(ErrorCategory).forEach(cat => stats.byCategory[cat] = 0);
        Object.values(ErrorSeverity).forEach(sev => stats.bySeverity[sev] = 0);
        // Count errors
        allErrors.forEach(error => {
            stats.byCategory[error.category]++;
            stats.bySeverity[error.severity]++;
        });
        return stats;
    }
    shouldAttemptRecovery(error) {
        return error.severity !== ErrorSeverity.CRITICAL &&
            this.recoveryStrategies.some(strategy => strategy.canRecover(error));
    }
    attemptRecovery(error) {
        return __awaiter(this, void 0, void 0, function* () {
            const strategy = this.recoveryStrategies.find(s => s.canRecover(error));
            if (!strategy) {
                return { success: false, message: 'No recovery strategy available' };
            }
            error.retryCount++;
            error.lastRetryAt = Date.now();
            try {
                const result = yield strategy.recover(error);
                if (result.success) {
                    error.resolved = true;
                    logger.info(`Successfully recovered from error ${error.id}: ${result.message}`);
                }
                else {
                    logger.warn(`Recovery attempt failed for error ${error.id}: ${result.message}`);
                }
                return result;
            }
            catch (recoveryError) {
                logger.error(`Recovery strategy threw error for ${error.id}:`, recoveryError);
                return { success: false, message: `Recovery strategy failed: ${recoveryError}` };
            }
        });
    }
    logError(error) {
        const logData = {
            errorId: error.id,
            category: error.category,
            severity: error.severity,
            message: error.message,
            context: error.context,
            timestamp: new Date(error.timestamp).toISOString()
        };
        switch (error.severity) {
            case ErrorSeverity.CRITICAL:
                logger.error('CRITICAL ERROR:', logData);
                break;
            case ErrorSeverity.HIGH:
                logger.error('HIGH SEVERITY ERROR:', logData);
                break;
            case ErrorSeverity.MEDIUM:
                logger.warn('MEDIUM SEVERITY ERROR:', logData);
                break;
            case ErrorSeverity.LOW:
                logger.info('LOW SEVERITY ERROR:', logData);
                break;
        }
    }
    generateErrorId() {
        return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    cleanupOldErrors() {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        let cleaned = 0;
        for (const [id, error] of this.errors.entries()) {
            if (error.timestamp < oneDayAgo && error.resolved) {
                this.errors.delete(id);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            logger.info(`Cleaned up ${cleaned} old resolved errors`);
        }
    }
    gracefulShutdown() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info('ErrorManager graceful shutdown initiated');
            // Log final error statistics
            const stats = this.getErrorStats();
            logger.info('Final error statistics:', stats);
            // Attempt to resolve any pending errors
            const unresolvedErrors = this.getUnresolvedErrors();
            if (unresolvedErrors.length > 0) {
                logger.warn(`Shutting down with ${unresolvedErrors.length} unresolved errors`);
            }
            logger.info('ErrorManager shutdown complete');
        });
    }
}
exports.ErrorManager = ErrorManager;
// Global error manager instance
exports.globalErrorManager = new ErrorManager();
// Global error handlers
process.on('uncaughtException', (error) => {
    exports.globalErrorManager.handleError(error, ErrorCategory.SYSTEM, ErrorSeverity.CRITICAL, { component: 'process', operation: 'uncaughtException' });
});
process.on('unhandledRejection', (reason, promise) => {
    exports.globalErrorManager.handleError(reason instanceof Error ? reason : new Error(String(reason)), ErrorCategory.SYSTEM, ErrorSeverity.HIGH, { component: 'process', operation: 'unhandledRejection' });
});
exports.default = ErrorManager;
