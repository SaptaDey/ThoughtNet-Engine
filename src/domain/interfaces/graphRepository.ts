
export interface GraphRepository {
  executeQuery(
    query: string,
    parameters?: Record<string, any>,
    database?: string,
    txType?: "read" | "write"
  ): Promise<any>;
}
