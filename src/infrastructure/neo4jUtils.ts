
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

let neo4jManager: Neo4jDatabaseManager | null = null;

export function initializeNeo4jManager() {
  if (!neo4jManager) {
    neo4jManager = new Neo4jDatabaseManager();
  }
}

export async function executeQuery(
  query: string,
  parameters?: Record<string, any>,
  txType: "read" | "write" = "read"
): Promise<any> {
  if (!neo4jManager) {
    throw new Neo4jError("Neo4jDatabaseManager not initialized. Call initializeNeo4jManager() first.");
  }
  try {
    return await neo4jManager.executeQuery(query, parameters, undefined, txType);
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
  if (!neo4jManager) {
    throw new Neo4jError("Neo4jDatabaseManager not initialized. Call initializeNeo4jManager() first.");
  }
  
  try {
    return await neo4jManager.executeInTransaction(operations, txType);
  } catch (error: any) {
    if (error instanceof Neo4jDriverError) {
      throw new Neo4jError(`Neo4j transaction error: ${error.message}`, error);
    } else {
      throw new Neo4jError(`Error executing Neo4j transaction: ${error.message}`, error);
    }
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
