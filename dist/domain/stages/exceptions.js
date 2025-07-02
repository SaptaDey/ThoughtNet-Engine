"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StageInitializationError = void 0;
class StageInitializationError extends Error {
    constructor(message) {
        super(message);
        this.name = "StageInitializationError";
    }
}
exports.StageInitializationError = StageInitializationError;
