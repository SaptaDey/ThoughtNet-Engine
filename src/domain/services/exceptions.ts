
export class ProcessingError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ProcessingError";
  }
}

export class StageExecutionError extends ProcessingError {
  stageName: string;
  originalError: Error;
  context: Record<string, any>;

  constructor(stageName: string, originalError: Error, context: Record<string, any> = {}) {
    const message = `Stage '${stageName}' failed: ${originalError.message}`;
    super(message);
    this.name = "StageExecutionError";
    this.stageName = stageName;
    this.originalError = originalError;
    this.context = context;
  }
}
