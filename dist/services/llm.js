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
exports.LLM_QUERY_LOGS = [];
function askLLM(prompt) {
    return __awaiter(this, void 0, void 0, function* () {
        // This is a placeholder for actual LLM interaction.
        // In a real scenario, you would integrate with OpenAI, Anthropic, etc.
        // based on settings.llm_provider and API keys.
        const mockResponse = `This is a mock response to: ${prompt}`;
        exports.LLM_QUERY_LOGS.push({ prompt, response: mockResponse });
        if (exports.LLM_QUERY_LOGS.length > 10) {
            exports.LLM_QUERY_LOGS.shift(); // Keep only the last 10 logs
        }
        return Promise.resolve(mockResponse);
    });
}
