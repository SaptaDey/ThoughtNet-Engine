
import neo4j, { Driver, Session, auth } from 'neo4j-driver';
import { GraphRepository } from '../domain/interfaces/graphRepository';
import { settings } from '../config';
import winston from 'winston';

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

export class Neo4jDatabaseManager implements GraphRepository {
  private driver: Driver;
  private maxPoolSize = 50;
  private connectionTimeout = 30000; // 30 seconds
  private maxTransactionRetryTime = 15000; // 15 seconds

  constructor() {
    this.driver = neo4j.driver(
      settings.neo4j.uri,
      auth.basic(settings.neo4j.user, settings.neo4j.password),
      {
        maxConnectionPoolSize: this.maxPoolSize,
        connectionAcquisitionTimeout: this.connectionTimeout,
        maxTransactionRetryTime: this.maxTransactionRetryTime,
        encrypted: 'ENCRYPTION_ON',
        trust: 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES',
        connectionTimeout: this.connectionTimeout
      }
    );
    
    // Verify connectivity without exposing credentials
    this.driver.verifyConnectivity()
      .then(() => logger.info("Neo4j driver connected successfully."))
      .catch((error) => {
        // Sanitize error message to avoid credential exposure
        const sanitizedMessage = error.message?.replace(
          /password=[^&\s]*/gi, 
          'password=***'
        ) || 'Connection failed';
        logger.error(`Neo4j driver connection failed: ${sanitizedMessage}`);
        
        // In production, we should exit on connection failure
        if (process.env.NODE_ENV === 'production') {
          process.exit(1);
        }
      });
  }

  async executeQuery(
    query: string,
    parameters?: Record<string, any>,
    database?: string,
    txType: "read" | "write" = "read"
  ): Promise<any> {
    let session: Session | undefined;
    try {
      // Input validation and sanitization
      if (!query || typeof query !== 'string') {
        throw new Error('Query must be a non-empty string');
      }
      
      // Basic Cypher injection protection
      const sanitizedQuery = this.sanitizeCypherQuery(query);
      
      session = this.driver.session({ 
        database: database || settings.neo4j.database,
        defaultAccessMode: txType === "read" ? neo4j.session.READ : neo4j.session.WRITE
      });
      
      const result = await session[txType === "read" ? "readTransaction" : "writeTransaction"](
        (tx) => tx.run(sanitizedQuery, parameters)
      );
      return result.records.map(record => record.toObject());
    } catch (error) {
      // Sanitize error message to avoid parameter exposure
      const sanitizedError = this.sanitizeErrorMessage(error);
      logger.error(`Error executing Neo4j query: ${sanitizedError}`);
      throw new Error(`Database query failed: ${sanitizedError}`);
    } finally {
      if (session) {
        await session.close();
      }
    }
  }

  private sanitizeCypherQuery(query: string): string {
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

  private sanitizeErrorMessage(error: any): string {
    if (!error || typeof error.message !== 'string') {
      return 'Unknown database error';
    }
    
    // Remove sensitive information from error messages
    return error.message
      .replace(/password=[^&\s]*/gi, 'password=***')
      .replace(/user=[^&\s]*/gi, 'user=***')
      .replace(/uri=[^&\s]*/gi, 'uri=***');
  }

  async executeInTransaction<T>(
    operations: (transaction: any) => Promise<T>,
    txType: "read" | "write" = "write",
    database?: string
  ): Promise<T> {
    let session: Session | undefined;
    try {
      session = this.driver.session({ 
        database: database || settings.neo4j.database,
        defaultAccessMode: txType === "read" ? neo4j.session.READ : neo4j.session.WRITE
      });
      
      if (txType === "read") {
        return await session.readTransaction(operations);
      } else {
        return await session.writeTransaction(operations);
      }
    } catch (error) {
      const sanitizedError = this.sanitizeErrorMessage(error);
      logger.error(`Error executing Neo4j transaction: ${sanitizedError}`);
      throw new Error(`Database transaction failed: ${sanitizedError}`);
    } finally {
      if (session) {
        await session.close();
      }
    }
  }

  async closeConnection(): Promise<void> {
    try {
      await this.driver.close();
      logger.info("Neo4j connection closed successfully");
    } catch (error) {
      const sanitizedError = this.sanitizeErrorMessage(error);
      logger.error(`Error closing Neo4j connection: ${sanitizedError}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.driver.verifyConnectivity();
      return true;
    } catch (error) {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
    logger.info("Neo4j driver closed.");
  }
}
