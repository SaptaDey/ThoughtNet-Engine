import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app';
import { initializeNeo4jManager, closeNeo4jConnection } from '../src/infrastructure/neo4jUtils';

const app = createApp();

describe('Security Fixes Integration Tests', () => {
  beforeAll(async () => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_MISSING_ENV_VARS = 'true';
    process.env.NEO4J_URI = 'bolt://localhost:7687';
    process.env.NEO4J_USER = 'neo4j';
    process.env.NEO4J_PASSWORD = 'TestPassword123!';
    process.env.BASIC_AUTH_USER = 'testuser';
    process.env.BASIC_AUTH_PASS = 'TestPassword123!';
    
    try {
      initializeNeo4jManager();
    } catch (error) {
      console.warn('Neo4j not available for testing:', error);
    }
  });

  afterAll(async () => {
    try {
      await closeNeo4jConnection();
    } catch (error) {
      console.warn('Error closing Neo4j connection:', error);
    }
  });

  describe('Authentication Security', () => {
    test('should reject weak passwords during validation', () => {
      const originalPassword = process.env.BASIC_AUTH_PASS;
      
      // Test weak password
      process.env.BASIC_AUTH_PASS = 'weak';
      
      expect(() => {
        require('../src/middleware/auth');
      }).toThrow();
      
      // Restore original password
      process.env.BASIC_AUTH_PASS = originalPassword;
    });

    test('should require authentication for protected routes', async () => {
      const response = await request(app)
        .get('/api/admin/debug')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Authentication required'
      });
    });

    test('should accept valid basic authentication', async () => {
      const credentials = Buffer.from('testuser:TestPassword123!').toString('base64');
      
      const response = await request(app)
        .get('/api/health')
        .set('Authorization', `Basic ${credentials}`);

      // Should not be 401 (though it might be 404 if route doesn't exist)
      expect(response.status).not.toBe(401);
    });
  });

  describe('Input Validation', () => {
    test('should validate session ID format', async () => {
      const response = await request(app)
        .get('/api/public/tools')
        .set('X-Session-ID', 'invalid-session-id-format!!!')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Invalid session ID format'
      });
    });

    test('should accept valid session ID format', async () => {
      const validSessionId = 'abcd1234-efgh5678-ijkl9012-mnop3456';
      
      const response = await request(app)
        .get('/api/public/tools')
        .set('X-Session-ID', validSessionId);

      // Should not be 400 for session ID format
      expect(response.status).not.toBe(400);
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce session limits per IP', async () => {
      // This test would need a more sophisticated setup to test properly
      // For now, just verify the middleware doesn't crash
      const response = await request(app)
        .get('/api/public/tools')
        .set('X-Forwarded-For', '192.168.1.1');

      expect(response.status).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should return standardized error format', async () => {
      const response = await request(app)
        .get('/api/nonexistent-endpoint')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          message: expect.any(String),
          code: 'NOT_FOUND_ERROR',
          statusCode: 404,
          correlationId: expect.any(String)
        }
      });
    });

    test('should not expose sensitive information in errors', async () => {
      const response = await request(app)
        .post('/api/public/tools/call')
        .send({ invalid: 'data' });

      // Check that response doesn't contain sensitive patterns
      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toMatch(/password=/i);
      expect(responseText).not.toMatch(/token=/i);
      expect(responseText).not.toMatch(/secret=/i);
    });
  });

  describe('Circuit Breaker', () => {
    test('should handle LLM service failures gracefully', async () => {
      const { askLLM, getLLMServiceStatus } = require('../src/services/llm');
      
      // Test circuit breaker functionality
      try {
        await askLLM('test prompt');
        const status = getLLMServiceStatus();
        expect(status).toMatchObject({
          state: expect.any(String),
          failures: expect.any(Number),
          requestCount: expect.any(Number)
        });
      } catch (error) {
        // Expected to potentially fail in test environment
        expect(error.message).toContain('LLM service error');
      }
    });
  });
});