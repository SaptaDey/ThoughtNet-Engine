
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

export class Neo4jGraphRepository implements GraphRepository {
  private driver: Driver;

  constructor() {
    this.driver = neo4j.driver(
      settings.neo4j.uri,
      auth.basic(settings.neo4j.user, settings.neo4j.password)
    );
    this.driver.verifyConnectivity()
      .then(() => logger.info("Neo4j driver connected successfully."))
      .catch((error) => {
        logger.error(`Neo4j driver connection failed: ${error}`);
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
      session = this.driver.session({ database: database || settings.neo4j.database });
      const result = await session[txType === "read" ? "readTransaction" : "writeTransaction"](
        (tx) => tx.run(query, parameters)
      );
      return result.records.map(record => record.toObject());
    } catch (error) {
      logger.error(`Error executing Neo4j query: ${query}, Error: ${error}`);
      throw error;
    } finally {
      if (session) {
        await session.close();
      }
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
    logger.info("Neo4j driver closed.");
  }
}
