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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLM_QUERY_LOGS = void 0;
exports.askLLM = askLLM;
exports.getLLMServiceStatus = getLLMServiceStatus;
exports.LLM_QUERY_LOGS = [];
class CircuitBreaker {
    constructor() {
        this.failureThreshold = 5;
        this.recoveryTimeout = 30000; // 30 seconds
        this.requestVolumeThreshold = 10;
        this.state = {
            failures: 0,
            lastFailureTime: 0,
            state: 'CLOSED',
            requestCount: 0,
            successCount: 0
        };
    }
    execute(operation) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.state.state === 'OPEN') {
                if (Date.now() - this.state.lastFailureTime > this.recoveryTimeout) {
                    this.state.state = 'HALF_OPEN';
                    this.state.requestCount = 0;
                    this.state.successCount = 0;
                }
                else {
                    throw new Error('Circuit breaker is OPEN - service unavailable');
                }
            }
            try {
                const result = yield operation();
                this.onSuccess();
                return result;
            }
            catch (error) {
                this.onFailure();
                throw error;
            }
        });
    }
    onSuccess() {
        this.state.failures = 0;
        this.state.successCount++;
        if (this.state.state === 'HALF_OPEN') {
            // If we're in half-open and got some successes, close the circuit
            if (this.state.successCount >= 3) {
                this.state.state = 'CLOSED';
            }
        }
    }
    onFailure() {
        this.state.failures++;
        this.state.lastFailureTime = Date.now();
        this.state.requestCount++;
        if (this.state.failures >= this.failureThreshold) {
            this.state.state = 'OPEN';
        }
    }
    getState() {
        return Object.assign({}, this.state);
    }
}
const llmCircuitBreaker = new CircuitBreaker();
function askLLM(prompt) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            throw new Error('Prompt must be a non-empty string');
        }
        // Validate prompt length to prevent abuse
        if (prompt.length > 10000) {
            throw new Error('Prompt too long (max 10000 characters)');
        }
        const startTime = Date.now();
        try {
            const response = yield llmCircuitBreaker.execute(() => __awaiter(this, void 0, void 0, function* () {
                // This is a placeholder for actual LLM interaction.
                // In a real scenario, you would integrate with OpenAI, Anthropic, etc.
                // based on settings.llm_provider and API keys.
                // Simulate potential failure scenarios for testing
                if (Math.random() < 0.1) { // 10% failure rate for testing
                    throw new Error('Simulated LLM service error');
                }
                // Simulate processing time
                yield new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 500));
                return `This is a mock response to: ${prompt.substring(0, 100)}...`;
            }));
            const duration = Date.now() - startTime;
            // Log the query with metadata
            exports.LLM_QUERY_LOGS.push({
                prompt: prompt.substring(0, 500), // Truncate for privacy
                response: response.substring(0, 1000), // Truncate for storage
                timestamp: Date.now(),
                duration
            });
            // Keep only the last 50 logs to prevent memory leaks
            if (exports.LLM_QUERY_LOGS.length > 50) {
                exports.LLM_QUERY_LOGS.splice(0, exports.LLM_QUERY_LOGS.length - 50);
            }
            return response;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            // Log failed attempts (but not the full prompt for security)
            exports.LLM_QUERY_LOGS.push({
                prompt: `[ERROR] ${prompt.substring(0, 100)}...`,
                response: `Error: ${error.message}`,
                timestamp: Date.now(),
                duration
            });
            throw new Error(`LLM service error: ${error.message}`);
        }
    });
}
function getLLMServiceStatus() {
    const state = llmCircuitBreaker.getState();
    return {
        state: state.state,
        failures: state.failures,
        requestCount: state.requestCount
    };
}
