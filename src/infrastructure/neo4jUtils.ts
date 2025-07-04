
import { Neo4jError as Neo4jDriverError } from 'neo4j-driver';
import { Neo4jDatabaseManager } from '../infrastructure/neo4jDatabaseManager';

export class Neo4jError extends Error {
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = "Neo4jError";
    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}

// Dependency injection pattern instead of singleton
class Neo4jService {
  private static instance: Neo4jService | null = null;
  private manager: Neo4jDatabaseManager | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): Neo4jService {
    if (!Neo4jService.instance) {
      Neo4jService.instance = new Neo4jService();
    }
    return Neo4jService.instance;
  }

  initialize(): void {
    if (!this.isInitialized) {
      this.manager = new Neo4jDatabaseManager();
      this.isInitialized = true;
    }
  }

  getManager(): Neo4jDatabaseManager {
    if (!this.isInitialized || !this.manager) {
      throw new Neo4jError("Neo4jService not initialized. Call initialize() first.");
    }
    return this.manager;
  }

  async dispose(): Promise<void> {
    if (this.manager) {
      await this.manager.closeConnection();
      this.manager = null;
      this.isInitialized = false;
    }
  }
}

const neo4jService = Neo4jService.getInstance();

export function initializeNeo4jManager(): void {
  neo4jService.initialize();
}

export async function executeQuery(
  query: string,
  parameters?: Record<string, any>,
  txType: "read" | "write" = "read"
): Promise<any> {
  const manager = neo4jService.getManager();
  try {
    return await manager.executeQuery(query, parameters, undefined, txType);
  } catch (error: any) {
    if (error instanceof Neo4jDriverError) {
      throw new Neo4jError(`Neo4j driver error: ${error.message}`, error);
    } else {
      throw new Neo4jError(`Error executing Neo4j query: ${error.message}`, error);
    }
  }
}

export async function executeInTransaction<T>(
  operations: (transaction: any) => Promise<T>,
  txType: "read" | "write" = "write"
): Promise<T> {
  const manager = neo4jService.getManager();
  
  try {
    return await manager.executeInTransaction(operations, txType);
  } catch (error: any) {
    throw new Neo4jError(`Transaction execution failed: ${error.message}`, error);
  }
}

export async function closeNeo4jConnection(): Promise<void> {
  await neo4jService.dispose();
}

export async function healthCheckNeo4j(): Promise<boolean> {
  try {
    const manager = neo4jService.getManager();
    return await manager.healthCheck();
  } catch (error) {
    return false;
  }
}

export async function executeBatchInTransaction(
  queries: Array<{ query: string; parameters?: Record<string, any> }>,
  txType: "read" | "write" = "write"
): Promise<any[]> {
  return executeInTransaction(async (tx) => {
    const results = [];
    for (const { query, parameters } of queries) {
      const result = await tx.run(query, parameters);
      results.push(result.records.map((record: any) => record.toObject()));
    }
    return results;
  }, txType);
}
