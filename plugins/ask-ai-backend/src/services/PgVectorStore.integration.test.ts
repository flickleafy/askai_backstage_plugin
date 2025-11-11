/*
 * Copyright (C) 2025-2026 flickleafy
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Integration tests for PgVectorStore
 * Tests with real PostgreSQL database
 * 
 * To run these tests:
 * 1. Start PostgreSQL: docker-compose up -d postgres
 * 2. Run tests: yarn test:integration
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PgVectorStore } from './PgVectorStore';
import { EmbeddingVector } from '../models';
import { Pool } from 'pg';

// Skip these tests if PostgreSQL is not available
const TEST_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'backstage_vectors',
  user: process.env.POSTGRES_USER || 'backstage',
  password: process.env.POSTGRES_PASSWORD || 'backstage_dev_password',
  ssl: false,
  maxConnections: 5,
};

// Integration tests are skipped by default to avoid requiring Postgres locally.
// Set SKIP_INTEGRATION_TESTS=false to run them.
const runIntegrationTests = process.env.SKIP_INTEGRATION_TESTS === 'false';

if (!runIntegrationTests) {
  describe.skip('PgVectorStore Integration Tests', () => {
    it('skips because SKIP_INTEGRATION_TESTS is not false', () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe('PgVectorStore Integration Tests', () => {
  let vectorStore: PgVectorStore;
  let mockLogger: any;
  let directPool: Pool | null = null;
  let poolClosed = false;
  let isDbAvailable = false;

  beforeAll(async () => {
    // Create direct connection for test setup
    directPool = new Pool(TEST_CONFIG);
    
    // Test if PostgreSQL is available
    try {
      await directPool!.query('SELECT 1');
      isDbAvailable = true;
    } catch (error) {
      console.log('PostgreSQL not available, skipping integration tests');
      console.log('To run integration tests, ensure PostgreSQL is running with correct credentials');
      await directPool!.end();
      poolClosed = true;
      isDbAvailable = false;
      // Don't throw - let tests gracefully skip instead
    }
  });

  beforeEach(async () => {
    // Skip test if database is not available
    if (!isDbAvailable) {
      return;
    }
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    vectorStore = new PgVectorStore(mockLogger, TEST_CONFIG);
    await vectorStore.initialize();
    
    // Clear all data before each test
    await directPool!.query('DELETE FROM embeddings');
  });

  afterEach(async () => {
    if (vectorStore) {
      await vectorStore.close();
    }
  });

  afterAll(async () => {
    if (directPool && !poolClosed) {
      await directPool.end();
      poolClosed = true;
    }
  });

  describe('Full RAG Pipeline', () => {
    it('should store, search, and retrieve embeddings', async () => {
      if (!isDbAvailable) {
        console.log('Skipping test: Database not available');
        return;
      }
      
      // Create test embeddings
      const embeddings: EmbeddingVector[] = [
        {
          id: 'test-1',
          chunkId: 'chunk-1',
          vector: [0.1, 0.2, 0.3, ...Array(381).fill(0)],
          documentChunk: {
            id: 'doc-1',
            entityId: 'service-1',
            entityName: 'User Service',
            content: 'This is a user authentication service',
            metadata: {
              source: 'catalog',
              chunkIndex: 0,
              totalChunks: 2,
            },
          },
        },
        {
          id: 'test-2',
          chunkId: 'chunk-2',
          vector: [0.2, 0.3, 0.4, ...Array(381).fill(0)],
          documentChunk: {
            id: 'doc-2',
            entityId: 'service-1',
            entityName: 'User Service',
            content: 'Handles user login and registration',
            metadata: {
              source: 'catalog',
              chunkIndex: 1,
              totalChunks: 2,
            },
          },
        },
        {
          id: 'test-3',
          chunkId: 'chunk-3',
          vector: [0.8, 0.9, 0.7, ...Array(381).fill(0)],
          documentChunk: {
            id: 'doc-3',
            entityId: 'service-2',
            entityName: 'Payment Service',
            content: 'Processes payment transactions',
            metadata: {
              source: 'techdocs',
              chunkIndex: 0,
              totalChunks: 1,
            },
          },
        },
      ];

      // Store embeddings
      await vectorStore.storeBatch(embeddings);

      // Verify count
      const count = await vectorStore.count();
      expect(count).toBe(3);

      // Search for similar vectors
      const queryVector = [0.15, 0.25, 0.35, ...Array(381).fill(0)];
      const results = await vectorStore.search(queryVector, 2);

      expect(results).toHaveLength(2);
      expect(results[0].documentChunk.entityId).toBe('service-1');
      expect(results[0].similarity).toBeGreaterThan(0.9);
    });

    it('should filter search by entity', async () => {
      if (!isDbAvailable) {
        console.log('Skipping test: Database not available');
        return;
      }
      
      const embeddings: EmbeddingVector[] = [
        {
          id: 'entity1-chunk1',
          chunkId: 'chunk-1',
          vector: [0.1, 0.2, 0.3, ...Array(381).fill(0)],
          documentChunk: {
            id: 'doc-1',
            entityId: 'entity-1',
            entityName: 'Entity 1',
            content: 'Content for entity 1',
            metadata: { source: 'catalog', chunkIndex: 0, totalChunks: 1 },
          },
        },
        {
          id: 'entity2-chunk1',
          chunkId: 'chunk-2',
          vector: [0.1, 0.2, 0.3, ...Array(381).fill(0)],
          documentChunk: {
            id: 'doc-2',
            entityId: 'entity-2',
            entityName: 'Entity 2',
            content: 'Content for entity 2',
            metadata: { source: 'catalog', chunkIndex: 0, totalChunks: 1 },
          },
        },
      ];

      await vectorStore.storeBatch(embeddings);

      const results = await vectorStore.search(
        [0.1, 0.2, 0.3, ...Array(381).fill(0)],
        10,
        'entity-1'
      );

      expect(results).toHaveLength(1);
      expect(results[0].documentChunk.entityId).toBe('entity-1');
    });
  });

  describe('Upsert Behavior', () => {
    it('should update existing embedding on conflict', async () => {
      if (!isDbAvailable) {
        console.log('Skipping test: Database not available');
        return;
      }
      
      const embedding: EmbeddingVector = {
        id: 'upsert-test',
        chunkId: 'chunk-1',
        vector: [0.1, 0.2, 0.3, ...Array(381).fill(0)],
        documentChunk: {
          id: 'doc-1',
          entityId: 'entity-1',
          entityName: 'Test Entity',
          content: 'Original content',
          metadata: { source: 'catalog', chunkIndex: 0, totalChunks: 1 },
        },
      };

      // Store first time
      await vectorStore.store(embedding);

      // Update content and store again
      const updatedEmbedding = {
        ...embedding,
        vector: [0.5, 0.6, 0.7, ...Array(381).fill(0)],
        documentChunk: {
          ...embedding.documentChunk,
          content: 'Updated content',
        },
      };

      await vectorStore.store(updatedEmbedding);

      // Verify only one row exists
      const count = await vectorStore.count();
      expect(count).toBe(1);

      // Verify content was updated
      const results = await vectorStore.search([0.5, 0.6, 0.7, ...Array(381).fill(0)], 1);
      expect(results[0].documentChunk.content).toBe('Updated content');
    });
  });

  describe('Batch Operations', () => {
    it('should handle large batch inserts', async () => {
      if (!isDbAvailable) {
        console.log('Skipping test: Database not available');
        return;
      }
      
      const batchSize = 100;
      const embeddings: EmbeddingVector[] = Array.from({ length: batchSize }, (_, i) => ({
        id: `batch-${i}`,
        chunkId: `chunk-${i}`,
        vector: Array(384).fill(i / batchSize),
        documentChunk: {
          id: `doc-${i}`,
          entityId: 'batch-entity',
          entityName: 'Batch Entity',
          content: `Content ${i}`,
          metadata: { source: 'catalog', chunkIndex: i, totalChunks: batchSize },
        },
      }));

      const startTime = Date.now();
      await vectorStore.storeBatch(embeddings);
      const duration = Date.now() - startTime;

      const count = await vectorStore.count();
      expect(count).toBe(batchSize);
      
      // Performance check: should complete in reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds for 100 embeddings
    });

    it('should rollback on batch failure', async () => {
      if (!isDbAvailable) {
        console.log('Skipping test: Database not available');
        return;
      }
      
      // Create valid and invalid embeddings
      const embeddings: any[] = [
        {
          id: 'valid-1',
          chunkId: 'chunk-1',
          vector: Array(384).fill(0.1),
          documentChunk: {
            id: 'doc-1',
            entityId: 'entity-1',
            entityName: 'Entity 1',
            content: 'Content',
            metadata: { source: 'catalog', chunkIndex: 0, totalChunks: 1 },
          },
        },
        // This will cause an error (invalid source)
        {
          id: 'invalid-1',
          chunkId: 'chunk-2',
          vector: Array(384).fill(0.2),
          documentChunk: {
            id: 'doc-2',
            entityId: 'entity-2',
            entityName: 'Entity 2',
            content: 'Content',
            metadata: { source: 'invalid-source', chunkIndex: 0, totalChunks: 1 },
          },
        },
      ];

      await expect(vectorStore.storeBatch(embeddings)).rejects.toThrow();

      // Verify no data was inserted (transaction rolled back)
      const count = await vectorStore.count();
      expect(count).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should return accurate statistics', async () => {
      if (!isDbAvailable) {
        console.log('Skipping test: Database not available');
        return;
      }
      
      const embeddings: EmbeddingVector[] = [
        {
          id: 'stat-1',
          chunkId: 'chunk-1',
          vector: Array(384).fill(0.1),
          documentChunk: {
            id: 'doc-1',
            entityId: 'entity-1',
            entityName: 'Entity 1',
            content: 'Catalog content',
            metadata: { source: 'catalog', chunkIndex: 0, totalChunks: 1 },
          },
        },
        {
          id: 'stat-2',
          chunkId: 'chunk-2',
          vector: Array(384).fill(0.2),
          documentChunk: {
            id: 'doc-2',
            entityId: 'entity-2',
            entityName: 'Entity 2',
            content: 'TechDocs content',
            metadata: { source: 'techdocs', chunkIndex: 0, totalChunks: 1 },
          },
        },
        {
          id: 'stat-3',
          chunkId: 'chunk-3',
          vector: Array(384).fill(0.3),
          documentChunk: {
            id: 'doc-3',
            entityId: 'entity-1',
            entityName: 'Entity 1',
            content: 'More catalog content',
            metadata: { source: 'catalog', chunkIndex: 1, totalChunks: 2 },
          },
        },
      ];

      await vectorStore.storeBatch(embeddings);

      const stats = await vectorStore.getStats();

      expect(stats.totalVectors).toBe(3);
      expect(stats.uniqueEntities).toBe(2);
      expect(stats.catalogEntities).toBe(1);
      expect(stats.techdocsEntities).toBe(1);
    });
  });

  describe('Clear Operations', () => {
    it('should clear all vectors', async () => {
      if (!isDbAvailable) {
        console.log('Skipping test: Database not available');
        return;
      }
      
      const embeddings = Array.from({ length: 10 }, (_, i) => ({
        id: `clear-all-${i}`,
        chunkId: `chunk-${i}`,
        vector: Array(384).fill(i / 10),
        documentChunk: {
          id: `doc-${i}`,
          entityId: 'entity-1',
          entityName: 'Entity 1',
          content: `Content ${i}`,
          metadata: { source: 'catalog', chunkIndex: i, totalChunks: 10 } as const,
        },
      }));

      await vectorStore.storeBatch(embeddings);
      await vectorStore.clear();

      const count = await vectorStore.count();
      expect(count).toBe(0);
    });

    it('should clear vectors for specific entity only', async () => {
      if (!isDbAvailable) {
        console.log('Skipping test: Database not available');
        return;
      }
      
      const embeddings: EmbeddingVector[] = [
        {
          id: 'entity1-1',
          chunkId: 'chunk-1',
          vector: Array(384).fill(0.1),
          documentChunk: {
            id: 'doc-1',
            entityId: 'entity-1',
            entityName: 'Entity 1',
            content: 'Content',
            metadata: { source: 'catalog', chunkIndex: 0, totalChunks: 1 },
          },
        },
        {
          id: 'entity2-1',
          chunkId: 'chunk-2',
          vector: Array(384).fill(0.2),
          documentChunk: {
            id: 'doc-2',
            entityId: 'entity-2',
            entityName: 'Entity 2',
            content: 'Content',
            metadata: { source: 'catalog', chunkIndex: 0, totalChunks: 1 },
          },
        },
      ];

      await vectorStore.storeBatch(embeddings);
      await vectorStore.clear('entity-1');

      const totalCount = await vectorStore.count();
      const entity2Count = await vectorStore.count('entity-2');

      expect(totalCount).toBe(1);
      expect(entity2Count).toBe(1);
    });
  });

  describe('Health Check', () => {
    it('should return true when database is healthy', async () => {
      if (!isDbAvailable) {
        console.log('Skipping test: Database not available');
        return;
      }
      
      const healthy = await vectorStore.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return false when database is unreachable', async () => {
      if (!isDbAvailable) {
        console.log('Skipping test: Database not available');
        return;
      }
      
      // Close the store
      await vectorStore.close();

      // Create new store with invalid config
      const badStore = new PgVectorStore(mockLogger, {
        ...TEST_CONFIG,
        port: 9999, // Invalid port
      });

      const healthy = await badStore.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent writes', async () => {
      if (!isDbAvailable) {
        console.log('Skipping test: Database not available');
        return;
      }
      
      const promises = Array.from({ length: 10 }, (_, i) =>
        vectorStore.store({
          id: `concurrent-${i}`,
          chunkId: `chunk-${i}`,
          vector: Array(384).fill(i / 10),
          documentChunk: {
            id: `doc-${i}`,
            entityId: 'concurrent-entity',
            entityName: 'Concurrent Entity',
            content: `Content ${i}`,
            metadata: { source: 'catalog', chunkIndex: i, totalChunks: 10 },
          },
        })
      );

      await Promise.all(promises);

      const count = await vectorStore.count();
      expect(count).toBe(10);
    });

    it('should handle concurrent searches', async () => {
      if (!isDbAvailable) {
        console.log('Skipping test: Database not available');
        return;
      }
      
      // First, insert some data
      const embeddings = Array.from({ length: 20 }, (_, i) => ({
        id: `search-${i}`,
        chunkId: `chunk-${i}`,
        vector: Array(384).fill(i / 20),
        documentChunk: {
          id: `doc-${i}`,
          entityId: 'search-entity',
          entityName: 'Search Entity',
          content: `Content ${i}`,
          metadata: { source: 'catalog', chunkIndex: i, totalChunks: 20 } as const,
        },
      }));

      await vectorStore.storeBatch(embeddings);

      // Now do concurrent searches
      const searchPromises = Array.from({ length: 10 }, (_, i) =>
        vectorStore.search(Array(384).fill(i / 10), 5)
      );

      const results = await Promise.all(searchPromises);

      results.forEach(result => {
        expect(result.length).toBeGreaterThan(0);
        expect(result.length).toBeLessThanOrEqual(5);
      });
    });
  });
  });
}
