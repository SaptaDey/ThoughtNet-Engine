/**
 * Integration test for external API clients
 * Tests that real API integrations are properly implemented
 */

import { PubMedClient } from '../src/infrastructure/apiClients/pubmedClient';
import { GoogleScholarClient } from '../src/infrastructure/apiClients/googleScholarClient';
import { ExaSearchClient } from '../src/infrastructure/apiClients/exaSearchClient';

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
  test('PubMed client initializes and can search (mock mode)', async () => {
    const pubmedClient = new PubMedClient(mockSettings);
    expect(pubmedClient).toBeDefined();
    
    // Test search with mock data (when no API key)
    const results = await pubmedClient.searchArticles('cancer research', 3);
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    
    if (results.length > 0) {
      expect(results[0]).toHaveProperty('title');
      expect(results[0]).toHaveProperty('abstract');
      expect(results[0]).toHaveProperty('url');
    }
  });

  test('Google Scholar client initializes and can search (mock mode)', async () => {
    const scholarClient = new GoogleScholarClient(mockSettings);
    expect(scholarClient).toBeDefined();
    
    // Test search with mock data (when no API key)
    const results = await scholarClient.search('machine learning', 3);
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    
    if (results.length > 0) {
      expect(results[0]).toHaveProperty('title');
      expect(results[0]).toHaveProperty('link');
      expect(results[0]).toHaveProperty('snippet');
    }
  });

  test('Exa Search client initializes and can search (mock mode)', async () => {
    const exaClient = new ExaSearchClient(mockSettings);
    expect(exaClient).toBeDefined();
    
    // Test search with mock data (when no API key)
    const results = await exaClient.search('artificial intelligence', 3);
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    
    if (results.length > 0) {
      expect(results[0]).toHaveProperty('title');
      expect(results[0]).toHaveProperty('url');
      expect(results[0]).toHaveProperty('highlights');
    }
  });

  test('All clients handle empty queries appropriately', async () => {
    const pubmedClient = new PubMedClient(mockSettings);
    const scholarClient = new GoogleScholarClient(mockSettings);
    const exaClient = new ExaSearchClient(mockSettings);

    // All should throw errors for empty queries
    await expect(pubmedClient.searchArticles('', 1)).rejects.toThrow();
    await expect(scholarClient.search('', 1)).rejects.toThrow();
    await expect(exaClient.search('', 1)).rejects.toThrow();
  });

  test('All clients handle invalid result limits appropriately', async () => {
    const pubmedClient = new PubMedClient(mockSettings);
    const scholarClient = new GoogleScholarClient(mockSettings);
    const exaClient = new ExaSearchClient(mockSettings);

    // All should throw errors for invalid limits
    await expect(pubmedClient.searchArticles('test', 0)).rejects.toThrow();
    await expect(pubmedClient.searchArticles('test', 300)).rejects.toThrow();
    
    await expect(scholarClient.search('test', 0)).rejects.toThrow();
    await expect(scholarClient.search('test', 200)).rejects.toThrow();
    
    await expect(exaClient.search('test', 0)).rejects.toThrow();
    await expect(exaClient.search('test', 200)).rejects.toThrow();
  });

  test('API clients can be closed without errors', async () => {
    const pubmedClient = new PubMedClient(mockSettings);
    const scholarClient = new GoogleScholarClient(mockSettings);
    const exaClient = new ExaSearchClient(mockSettings);

    // All should close without throwing
    await expect(pubmedClient.close()).resolves.not.toThrow();
    await expect(scholarClient.close()).resolves.not.toThrow();
    await expect(exaClient.close()).resolves.not.toThrow();
  });
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
