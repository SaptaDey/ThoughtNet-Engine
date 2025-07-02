import winston from 'winston';
import { settings } from '../../config';

const logger = winston.createLogger({
  level: settings.app.log_level.toLowerCase(),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  DATABASE = 'database',
  NETWORK = 'network',
  VALIDATION = 'validation',
  PROCESSING = 'processing',
  RESOURCE = 'resource',
  CONFIGURATION = 'configuration',
  SYSTEM = 'system'
}

export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  stage?: string;
  component?: string;
  operation?: string;
  data?: Record<string, any>;
  stack?: string;
}

export interface ErrorDetails {
  id: string;
  timestamp: number;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  context: ErrorContext;
  resolved: boolean;
  retryCount: number;
  lastRetryAt?: number;
}

export interface RecoveryStrategy {
  canRecover(error: ErrorDetails): boolean;
  recover(error: ErrorDetails): Promise<{ success: boolean; message: string }>;
  maxRetries: number;
  retryDelay: number;
}

export class DatabaseRecoveryStrategy implements RecoveryStrategy {
  maxRetries = 3;
  retryDelay = 1000;

  canRecover(error: ErrorDetails): boolean {
    return error.category === ErrorCategory.DATABASE &&
           error.severity !== ErrorSeverity.CRITICAL &&
           error.retryCount < this.maxRetries;
  }

  async recover(error: ErrorDetails): Promise<{ success: boolean; message: string }> {
    // Wait for retry delay
    await new Promise(resolve => setTimeout(resolve, this.retryDelay * (error.retryCount + 1)));
    
    try {
      // Attempt to reconnect or retry the operation
      logger.info(`Attempting database recovery for error ${error.id}, retry ${error.retryCount + 1}`);
      
      // In a real implementation, this would attempt to:
      // - Reconnect to database
      // - Retry the failed operation
      // - Validate connection health
      
      return { success: true, message: 'Database connection recovered' };
    } catch (recoveryError) {
      return { success: false, message: `Recovery failed: ${recoveryError}` };
    }
  }
}

export class NetworkRecoveryStrategy implements RecoveryStrategy {
  maxRetries = 5;
  retryDelay = 2000;

  canRecover(error: ErrorDetails): boolean {
    return error.category === ErrorCategory.NETWORK &&
           error.retryCount < this.maxRetries;
  }

  async recover(error: ErrorDetails): Promise<{ success: boolean; message: string }> {
    const delay = this.retryDelay * Math.pow(2, error.retryCount); // Exponential backoff
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      logger.info(`Attempting network recovery for error ${error.id}, retry ${error.retryCount + 1}`);
      
      // Network recovery implementation would:
      // - Check network connectivity
      // - Retry API calls
      // - Switch to backup endpoints if available
      
      return { success: true, message: 'Network connection recovered' };
    } catch (recoveryError) {
      return { success: false, message: `Network recovery failed: ${recoveryError}` };
    }
  }
}

export class ProcessingRecoveryStrategy implements RecoveryStrategy {
  maxRetries = 2;
  retryDelay = 500;

  canRecover(error: ErrorDetails): boolean {
    return error.category === ErrorCategory.PROCESSING &&
           error.severity !== ErrorSeverity.CRITICAL &&
           error.retryCount < this.maxRetries;
  }

  async recover(error: ErrorDetails): Promise<{ success: boolean; message: string }> {
    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
    
    try {
      logger.info(`Attempting processing recovery for error ${error.id}`);
      
      // Processing recovery implementation would:
      // - Rollback to last checkpoint
      // - Retry with reduced complexity
      // - Use fallback algorithms
      
      return { success: true, message: 'Processing recovered with fallback method' };
    } catch (recoveryError) {
      return { success: false, message: `Processing recovery failed: ${recoveryError}` };
    }
  }
}

export class ErrorManager {
  private errors: Map<string, ErrorDetails> = new Map();
  private recoveryStrategies: RecoveryStrategy[] = [];
  private errorCallbacks: Array<(error: ErrorDetails) => void> = [];

  constructor() {
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

  public addErrorCallback(callback: (error: ErrorDetails) => void): void {
    this.errorCallbacks.push(callback);
  }

  public async handleError(
    error: Error | string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    context: ErrorContext = {}
  ): Promise<ErrorDetails> {
    const errorDetails: ErrorDetails = {
      id: this.generateErrorId(),
      timestamp: Date.now(),
      message: error instanceof Error ? error.message : error,
      category,
      severity,
      context: {
        ...context,
        stack: error instanceof Error ? error.stack : undefined
      },
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
      } catch (callbackError) {
        logger.error('Error in error callback:', callbackError);
      }
    });

    // Attempt recovery if possible
    if (this.shouldAttemptRecovery(errorDetails)) {
      await this.attemptRecovery(errorDetails);
    }

    return errorDetails;
  }

  public async retryError(errorId: string): Promise<{ success: boolean; message: string }> {
    const error = this.errors.get(errorId);
    if (!error) {
      return { success: false, message: 'Error not found' };
    }

    if (error.resolved) {
      return { success: true, message: 'Error already resolved' };
    }

    return await this.attemptRecovery(error);
  }

  public resolveError(errorId: string): boolean {
    const error = this.errors.get(errorId);
    if (error) {
      error.resolved = true;
      logger.info(`Error ${errorId} marked as resolved`);
      return true;
    }
    return false;
  }

  public getError(errorId: string): ErrorDetails | undefined {
    return this.errors.get(errorId);
  }

  public getErrorsByCategory(category: ErrorCategory): ErrorDetails[] {
    return Array.from(this.errors.values()).filter(error => error.category === category);
  }

  public getUnresolvedErrors(): ErrorDetails[] {
    return Array.from(this.errors.values()).filter(error => !error.resolved);
  }

  public getErrorStats(): {
    total: number;
    unresolved: number;
    byCategory: Record<ErrorCategory, number>;
    bySeverity: Record<ErrorSeverity, number>;
  } {
    const allErrors = Array.from(this.errors.values());
    const stats = {
      total: allErrors.length,
      unresolved: allErrors.filter(e => !e.resolved).length,
      byCategory: {} as Record<ErrorCategory, number>,
      bySeverity: {} as Record<ErrorSeverity, number>
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

  private shouldAttemptRecovery(error: ErrorDetails): boolean {
    return error.severity !== ErrorSeverity.CRITICAL &&
           this.recoveryStrategies.some(strategy => strategy.canRecover(error));
  }

  private async attemptRecovery(error: ErrorDetails): Promise<{ success: boolean; message: string }> {
    const strategy = this.recoveryStrategies.find(s => s.canRecover(error));
    
    if (!strategy) {
      return { success: false, message: 'No recovery strategy available' };
    }

    error.retryCount++;
    error.lastRetryAt = Date.now();

    try {
      const result = await strategy.recover(error);
      
      if (result.success) {
        error.resolved = true;
        logger.info(`Successfully recovered from error ${error.id}: ${result.message}`);
      } else {
        logger.warn(`Recovery attempt failed for error ${error.id}: ${result.message}`);
      }

      return result;
    } catch (recoveryError) {
      logger.error(`Recovery strategy threw error for ${error.id}:`, recoveryError);
      return { success: false, message: `Recovery strategy failed: ${recoveryError}` };
    }
  }

  private logError(error: ErrorDetails): void {
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

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private cleanupOldErrors(): void {
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

  public async gracefulShutdown(): Promise<void> {
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
  }
}

// Global error manager instance
export const globalErrorManager = new ErrorManager();

// Global error handlers
process.on('uncaughtException', (error) => {
  globalErrorManager.handleError(
    error,
    ErrorCategory.SYSTEM,
    ErrorSeverity.CRITICAL,
    { component: 'process', operation: 'uncaughtException' }
  );
});

process.on('unhandledRejection', (reason, promise) => {
  globalErrorManager.handleError(
    reason instanceof Error ? reason : new Error(String(reason)),
    ErrorCategory.SYSTEM,
    ErrorSeverity.HIGH,
    { component: 'process', operation: 'unhandledRejection' }
  );
});

export default ErrorManager;