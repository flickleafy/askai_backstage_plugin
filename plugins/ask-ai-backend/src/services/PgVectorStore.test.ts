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
 * Unit tests for PgVectorStore
 * Tests vector store operations with mocked PostgreSQL client
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PgVectorStore } from './PgVectorStore';
import { EmbeddingVector, DocumentChunk } from '../models';
import { Pool } from 'pg';

const mockClient = {
  query: jest.fn(async () => ({})),
  release: jest.fn(),
};

const mockPool = {
  connect: jest.fn(async () => mockClient),
  query: jest.fn(),
  end: jest.fn(),
  on: jest.fn(),
};

// Mock pg Pool
jest.mock('pg', () => ({
  Pool: jest.fn(() => mockPool),
}));

describe('PgVectorStore', () => {
  let vectorStore: PgVectorStore;
  let mockLogger: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockClient.query.mockClear();
    mockClient.release.mockClear();
    mockClient.query.mockImplementation(async () => ({}));
    mockPool.connect.mockClear();
  mockPool.connect.mockImplementation(async () => mockClient);
    mockPool.query.mockClear();
    mockPool.end.mockClear();
    mockPool.on.mockClear();
    
    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Create vector store
    const config = {
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      user: 'test_user',
      password: 'test_pass',
      ssl: false,
      maxConnections: 10,
    };

    vectorStore = new PgVectorStore(mockLogger, config, mockPool as unknown as any);
  });

  describe('initialize', () => {
    it('should initialize successfully with valid database', async () => {
      // Mock successful queries
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ now: new Date() }] }) // Test connection
        .mockResolvedValueOnce({ rows: [{ installed: true }] }) // pgvector check
        .mockResolvedValueOnce({ rows: [{ exists: true }] }); // Schema check

      await vectorStore.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Initializing PgVectorStore...');
      expect(mockLogger.info).toHaveBeenCalledWith('PgVectorStore initialized successfully');
      expect(mockClient.release).toHaveBeenCalledTimes(3);
    });

    it('should throw error if pgvector extension is not installed', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ now: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ installed: false }] });

      await expect(vectorStore.initialize()).rejects.toThrow('pgvector extension is not installed');
    });

    it('should throw error if embeddings table does not exist', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ now: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({ rows: [{ exists: false }] });

      await expect(vectorStore.initialize()).rejects.toThrow('Embeddings table not found');
    });

    it('should not reinitialize if already initialized', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ now: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });

      await vectorStore.initialize();
      await vectorStore.initialize();

      expect(mockLogger.debug).toHaveBeenCalledWith('PgVectorStore already initialized');
    });
  });

  describe('store', () => {
    const createMockEmbedding = (): EmbeddingVector => ({
      id: 'test-id-1',
      chunkId: 'chunk-1',
      vector: [0.1, 0.2, 0.3],
      documentChunk: {
        id: 'doc-1',
        entityId: 'entity-1',
        entityName: 'Test Entity',
        content: 'Test content',
        metadata: {
          source: 'catalog',
          chunkIndex: 0,
          totalChunks: 1,
        },
      },
    });

    beforeEach(async () => {
      // Initialize store before each test
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ now: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });
      await vectorStore.initialize();
      jest.clearAllMocks();
    });

    it('should store a single embedding successfully', async () => {
      const embedding = createMockEmbedding();
      mockClient.query.mockResolvedValueOnce({ rowCount: 1 });

      await vectorStore.store(embedding);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO embeddings'),
        expect.arrayContaining([
          'test-id-1',
          'chunk-1',
          'entity-1',
          'Test Entity',
          '[0.1,0.2,0.3]',
          'Test content',
          'catalog',
          0,
          1,
        ])
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('Stored embedding: test-id-1');
    });

    it('should handle upsert on conflict', async () => {
      const embedding = createMockEmbedding();
      mockClient.query.mockResolvedValueOnce({ rowCount: 1 });

      await vectorStore.store(embedding);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (entity_id, chunk_id)'),
        expect.any(Array)
      );
    });

    it('should throw error on database failure', async () => {
      const embedding = createMockEmbedding();
      const dbError = new Error('Database connection lost');
      mockClient.query.mockRejectedValueOnce(dbError);

      await expect(vectorStore.store(embedding)).rejects.toThrow('Database connection lost');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to store embedding test-id-1',
        dbError
      );
    });
  });

  describe('storeBatch', () => {
    const createMockEmbeddings = (count: number): EmbeddingVector[] => {
      return Array.from({ length: count }, (_, i) => ({
        id: `test-id-${i}`,
        chunkId: `chunk-${i}`,
        vector: [0.1 * i, 0.2 * i, 0.3 * i],
        documentChunk: {
          id: `doc-${i}`,
          entityId: 'entity-1',
          entityName: 'Test Entity',
          content: `Test content ${i}`,
          metadata: {
            source: 'catalog' as const,
            chunkIndex: i,
            totalChunks: count,
          },
        },
      }));
    };

    beforeEach(async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ now: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });
      await vectorStore.initialize();
      jest.clearAllMocks();
    });

    it('should store multiple embeddings in a transaction', async () => {
      const embeddings = createMockEmbeddings(3);
      mockClient.query.mockResolvedValue({ rowCount: 1 });

      await vectorStore.storeBatch(embeddings);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.query).toHaveBeenCalledTimes(5); // BEGIN + 3 inserts + COMMIT
      expect(mockLogger.info).toHaveBeenCalledWith('Stored batch of 3 embeddings');
    });

    it('should rollback transaction on error', async () => {
      const embeddings = createMockEmbeddings(2);
      mockClient.query
        .mockResolvedValueOnce({ }) // BEGIN
        .mockResolvedValueOnce({ }) // First insert
        .mockRejectedValueOnce(new Error('Insert failed')); // Second insert fails

      await expect(vectorStore.storeBatch(embeddings)).rejects.toThrow('Insert failed');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should handle empty batch gracefully', async () => {
      await vectorStore.storeBatch([]);

      expect(mockClient.query).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ now: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });
      await vectorStore.initialize();
      jest.clearAllMocks();
    });

    it('should search and return similar vectors', async () => {
      const queryVector = [0.1, 0.2, 0.3];
      const mockResults = [
        {
          id: 'test-id-1',
          chunk_id: 'chunk-1',
          entity_id: 'entity-1',
          entity_name: 'Test Entity',
          content: 'Test content',
          source: 'catalog',
          chunk_index: 0,
          total_chunks: 1,
          similarity: 0.95,
        },
      ];
      mockClient.query.mockResolvedValueOnce({ rows: mockResults });

      const results = await vectorStore.search(queryVector, 5);

      expect(results).toHaveLength(1);
      expect(results[0].documentChunk.entityId).toBe('entity-1');
      expect(results[0].similarity).toBe(0.95);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY vector <=> $1'),
        expect.arrayContaining(['[0.1,0.2,0.3]', null, 5])
      );
    });

    it('should filter by entity ID when provided', async () => {
      const queryVector = [0.1, 0.2, 0.3];
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await vectorStore.search(queryVector, 5, 'specific-entity');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ($2::TEXT IS NULL OR entity_id = $2)'),
        expect.arrayContaining(['[0.1,0.2,0.3]', 'specific-entity', 5])
      );
    });

    it('should handle empty results', async () => {
      const queryVector = [0.1, 0.2, 0.3];
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const results = await vectorStore.search(queryVector, 5);

      expect(results).toHaveLength(0);
    });
  });

  describe('clear', () => {
    beforeEach(async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ now: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });
      await vectorStore.initialize();
      jest.clearAllMocks();
    });

    it('should clear all vectors', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 10 });

      await vectorStore.clear();

      expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM embeddings', []);
      expect(mockLogger.info).toHaveBeenCalledWith('Cleared 10 vectors');
    });

    it('should clear vectors for specific entity', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 5 });

      await vectorStore.clear('entity-1');

      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM embeddings WHERE entity_id = $1',
        ['entity-1']
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Cleared 5 vectors for entity entity-1');
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ now: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });
      await vectorStore.initialize();
      jest.clearAllMocks();
    });

    it('should return total count of vectors', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '42' }] });

      const count = await vectorStore.count();

      expect(count).toBe(42);
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM embeddings',
        []
      );
    });

    it('should return count for specific entity', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '10' }] });

      const count = await vectorStore.count('entity-1');

      expect(count).toBe(10);
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM embeddings WHERE entity_id = $1',
        ['entity-1']
      );
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ now: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });
      await vectorStore.initialize();
      jest.clearAllMocks();
    });

    it('should return statistics', async () => {
      const mockStats = {
        total_embeddings: '100',
        unique_entities: '10',
        catalog_entities: '5',
        techdocs_entities: '5',
      };
      mockClient.query.mockResolvedValueOnce({ rows: [mockStats] });

      const stats = await vectorStore.getStats();

      expect(stats.totalVectors).toBe(100);
      expect(stats.uniqueEntities).toBe(10);
      expect(stats.catalogEntities).toBe(5);
      expect(stats.techdocsEntities).toBe(5);
    });

    it('should handle empty statistics', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const stats = await vectorStore.getStats();

      expect(stats.totalVectors).toBe(0);
      expect(stats.uniqueEntities).toBe(0);
    });
  });

  describe('healthCheck', () => {
    beforeEach(async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ now: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });
      await vectorStore.initialize();
      jest.clearAllMocks();
    });

    it('should return true when database is healthy', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const healthy = await vectorStore.healthCheck();

      expect(healthy).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return false when database is unhealthy', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Connection failed'));

      const healthy = await vectorStore.healthCheck();

      expect(healthy).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Health check failed',
        expect.any(Error)
      );
    });
  });

  describe('close', () => {
    it('should close connection pool', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ now: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });
      
      await vectorStore.initialize();
      await vectorStore.close();

      expect(mockPool.end).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('PgVectorStore connection pool closed');
    });
  });
});
