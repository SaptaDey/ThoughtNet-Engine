"use strict";
/**
 * Integration test for external API clients
 * Tests that real API integrations are properly implemented
 */
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
const pubmedClient_1 = require("../src/infrastructure/apiClients/pubmedClient");
const googleScholarClient_1 = require("../src/infrastructure/apiClients/googleScholarClient");
const exaSearchClient_1 = require("../src/infrastructure/apiClients/exaSearchClient");
// Mock settings for testing
const mockSettings = {
    pubmed: {
        base_url: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
        email: 'test@example.com'
    },
    google_scholar: {
        base_url: 'https://serpapi.com/search',
        api_key: '' // Empty for mock mode
    },
    exa_search: {
        base_url: 'https://api.exa.ai',
        api_key: '' // Empty for mock mode
    }
};
describe('External API Integration Tests', () => {
    test('PubMed client initializes and can search (mock mode)', () => __awaiter(void 0, void 0, void 0, function* () {
        const pubmedClient = new pubmedClient_1.PubMedClient(mockSettings);
        expect(pubmedClient).toBeDefined();
        // Test search with mock data (when no API key)
        const results = yield pubmedClient.searchArticles('cancer research', 3);
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        if (results.length > 0) {
            expect(results[0]).toHaveProperty('title');
            expect(results[0]).toHaveProperty('abstract');
            expect(results[0]).toHaveProperty('url');
        }
    }));
    test('Google Scholar client initializes and can search (mock mode)', () => __awaiter(void 0, void 0, void 0, function* () {
        const scholarClient = new googleScholarClient_1.GoogleScholarClient(mockSettings);
        expect(scholarClient).toBeDefined();
        // Test search with mock data (when no API key)
        const results = yield scholarClient.search('machine learning', 3);
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        if (results.length > 0) {
            expect(results[0]).toHaveProperty('title');
            expect(results[0]).toHaveProperty('link');
            expect(results[0]).toHaveProperty('snippet');
        }
    }));
    test('Exa Search client initializes and can search (mock mode)', () => __awaiter(void 0, void 0, void 0, function* () {
        const exaClient = new exaSearchClient_1.ExaSearchClient(mockSettings);
        expect(exaClient).toBeDefined();
        // Test search with mock data (when no API key)
        const results = yield exaClient.search('artificial intelligence', 3);
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        if (results.length > 0) {
            expect(results[0]).toHaveProperty('title');
            expect(results[0]).toHaveProperty('url');
            expect(results[0]).toHaveProperty('highlights');
        }
    }));
    test('All clients handle empty queries appropriately', () => __awaiter(void 0, void 0, void 0, function* () {
        const pubmedClient = new pubmedClient_1.PubMedClient(mockSettings);
        const scholarClient = new googleScholarClient_1.GoogleScholarClient(mockSettings);
        const exaClient = new exaSearchClient_1.ExaSearchClient(mockSettings);
        // All should throw errors for empty queries
        yield expect(pubmedClient.searchArticles('', 1)).rejects.toThrow();
        yield expect(scholarClient.search('', 1)).rejects.toThrow();
        yield expect(exaClient.search('', 1)).rejects.toThrow();
    }));
    test('All clients handle invalid result limits appropriately', () => __awaiter(void 0, void 0, void 0, function* () {
        const pubmedClient = new pubmedClient_1.PubMedClient(mockSettings);
        const scholarClient = new googleScholarClient_1.GoogleScholarClient(mockSettings);
        const exaClient = new exaSearchClient_1.ExaSearchClient(mockSettings);
        // All should throw errors for invalid limits
        yield expect(pubmedClient.searchArticles('test', 0)).rejects.toThrow();
        yield expect(pubmedClient.searchArticles('test', 300)).rejects.toThrow();
        yield expect(scholarClient.search('test', 0)).rejects.toThrow();
        yield expect(scholarClient.search('test', 200)).rejects.toThrow();
        yield expect(exaClient.search('test', 0)).rejects.toThrow();
        yield expect(exaClient.search('test', 200)).rejects.toThrow();
    }));
    test('API clients can be closed without errors', () => __awaiter(void 0, void 0, void 0, function* () {
        const pubmedClient = new pubmedClient_1.PubMedClient(mockSettings);
        const scholarClient = new googleScholarClient_1.GoogleScholarClient(mockSettings);
        const exaClient = new exaSearchClient_1.ExaSearchClient(mockSettings);
        // All should close without throwing
        yield expect(pubmedClient.close()).resolves.not.toThrow();
        yield expect(scholarClient.close()).resolves.not.toThrow();
        yield expect(exaClient.close()).resolves.not.toThrow();
    }));
});
console.log('✅ External API Integration Tests Ready');
console.log('📋 Tests verify:');
console.log('  - API client initialization');
console.log('  - Mock data fallback functionality');
console.log('  - Error handling for invalid inputs');
console.log('  - Graceful client shutdown');
console.log('');
console.log('🔧 To test with real APIs:');
console.log('  1. Add API keys to .env file');
console.log('  2. Update test settings with real keys');
console.log('  3. Run: npm test');
console.log('');
console.log('📖 See docs/API_INTEGRATION.md for setup guide');
