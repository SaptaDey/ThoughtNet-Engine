
import { settings } from '../config';

interface LLMQueryLog {
  prompt: string;
  response: string;
}

export const LLM_QUERY_LOGS: LLMQueryLog[] = [];

export async function askLLM(prompt: string): Promise<string> {
  // This is a placeholder for actual LLM interaction.
  // In a real scenario, you would integrate with OpenAI, Anthropic, etc.
  // based on settings.llm_provider and API keys.

  const mockResponse = `This is a mock response to: ${prompt}`;

  LLM_QUERY_LOGS.push({ prompt, response: mockResponse });
  if (LLM_QUERY_LOGS.length > 10) {
    LLM_QUERY_LOGS.shift(); // Keep only the last 10 logs
  }

  return Promise.resolve(mockResponse);
}
