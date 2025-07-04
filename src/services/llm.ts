
import { settings } from '../config';

interface LLMQueryLog {
  prompt: string;
  response: string;
  timestamp: number;
  duration: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  requestCount: number;
  successCount: number;
}

export const LLM_QUERY_LOGS: LLMQueryLog[] = [];

class CircuitBreaker {
  private failureThreshold = 5;
  private recoveryTimeout = 30000; // 30 seconds
  private requestVolumeThreshold = 10;
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: 0,
    state: 'CLOSED',
    requestCount: 0,
    successCount: 0
  };

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.state === 'OPEN') {
      if (Date.now() - this.state.lastFailureTime > this.recoveryTimeout) {
        this.state.state = 'HALF_OPEN';
        this.state.requestCount = 0;
        this.state.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.state.failures = 0;
    this.state.successCount++;
    
    if (this.state.state === 'HALF_OPEN') {
      // If we're in half-open and got some successes, close the circuit
      if (this.state.successCount >= 3) {
        this.state.state = 'CLOSED';
      }
    }
  }

  private onFailure(): void {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();
    this.state.requestCount++;

    if (this.state.failures >= this.failureThreshold) {
      this.state.state = 'OPEN';
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }
}

const llmCircuitBreaker = new CircuitBreaker();

export async function askLLM(prompt: string): Promise<string> {
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('Prompt must be a non-empty string');
  }

  // Validate prompt length to prevent abuse
  if (prompt.length > 10000) {
    throw new Error('Prompt too long (max 10000 characters)');
  }

  const startTime = Date.now();

  try {
    const response = await llmCircuitBreaker.execute(async () => {
      // This is a placeholder for actual LLM interaction.
      // In a real scenario, you would integrate with OpenAI, Anthropic, etc.
      // based on settings.llm_provider and API keys.
      
      // Simulate potential failure scenarios for testing
      if (Math.random() < 0.1) { // 10% failure rate for testing
        throw new Error('Simulated LLM service error');
      }
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 500));
      
      return `This is a mock response to: ${prompt.substring(0, 100)}...`;
    });

    const duration = Date.now() - startTime;
    
    // Log the query with metadata
    LLM_QUERY_LOGS.push({ 
      prompt: prompt.substring(0, 500), // Truncate for privacy
      response: response.substring(0, 1000), // Truncate for storage
      timestamp: Date.now(),
      duration
    });
    
    // Keep only the last 50 logs to prevent memory leaks
    if (LLM_QUERY_LOGS.length > 50) {
      LLM_QUERY_LOGS.splice(0, LLM_QUERY_LOGS.length - 50);
    }

    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    // Log failed attempts (but not the full prompt for security)
    LLM_QUERY_LOGS.push({ 
      prompt: `[ERROR] ${prompt.substring(0, 100)}...`,
      response: `Error: ${error.message}`,
      timestamp: Date.now(),
      duration
    });
    
    throw new Error(`LLM service error: ${error.message}`);
  }
}

export function getLLMServiceStatus(): { state: string; failures: number; requestCount: number } {
  const state = llmCircuitBreaker.getState();
  return {
    state: state.state,
    failures: state.failures,
    requestCount: state.requestCount
  };
}
