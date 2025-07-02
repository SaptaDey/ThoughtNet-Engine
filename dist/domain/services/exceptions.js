"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StageExecutionError = exports.ProcessingError = void 0;
class ProcessingError extends Error {
    constructor(message) {
        super(message);
        this.name = "ProcessingError";
    }
}
exports.ProcessingError = ProcessingError;
class StageExecutionError extends ProcessingError {
    constructor(stageName, originalError, context = {}) {
        const message = `Stage '${stageName}' failed: ${originalError.message}`;
        super(message);
        this.name = "StageExecutionError";
        this.stageName = stageName;
        this.originalError = originalError;
        this.context = context;
    }
}
exports.StageExecutionError = StageExecutionError;
