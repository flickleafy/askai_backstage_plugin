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
 * PostgreSQL vector store implementation with pgvector
 * Provides persistent vector storage and similarity search capabilities
 * 
 * @packageDocumentation
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { Logger } from '@backstage/backend-common';
import { IVectorStore } from '../interfaces';
import { EmbeddingVector, SearchResult, PostgresConfig } from '../models';

/**
 * PostgreSQL vector store using pgvector extension
 * Follows Single Responsibility Principle
 * 
 * Features:
 * - Persistent vector storage with PostgreSQL
 * - HNSW index for O(log n) similarity search
 * - Transaction support for batch operations
 * - Connection pooling for performance
 * - Automatic migration on initialization
 */
export class PgVectorStore implements IVectorStore {
  private readonly logger: Logger;
  private readonly pool: Pool;
  private readonly config: PostgresConfig;
  private initialized: boolean = false;

  constructor(logger: Logger, config: PostgresConfig) {
    this.logger = logger;
    this.config = config;
    
    // Initialize connection pool
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: config.maxConnections || 10,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 5000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      this.logger.error('Unexpected PostgreSQL pool error', err);
    });
  }

  /**
   * Initialize the vector store (run migrations, verify connection)
   * Should be called after construction
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('PgVectorStore already initialized');
      return;
    }

    try {
      this.logger.info('Initializing PgVectorStore...');
      
      // Test connection
      await this.testConnection();
      
      // Verify pgvector extension
      await this.verifyPgVector();
      
      // Verify schema exists
      await this.verifySchema();
      
      this.initialized = true;
      this.logger.info('PgVectorStore initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize PgVectorStore', error);
      throw new Error(`PgVectorStore initialization failed: ${error}`);
    }
  }

  /**
   * Test database connection
   */
  private async testConnection(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT NOW()');
      this.logger.debug(`Database connection successful: ${result.rows[0].now}`);
    } finally {
      client.release();
    }
  }

  /**
   * Verify pgvector extension is installed
   */
  private async verifyPgVector(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') as installed"
      );
      
      if (!result.rows[0].installed) {
        throw new Error('pgvector extension is not installed. Please run: CREATE EXTENSION vector;');
      }
      
      this.logger.debug('pgvector extension verified');
    } finally {
      client.release();
    }
  }

  /**
   * Verify embeddings table exists
   */
  private async verifySchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'embeddings') as exists"
      );
      
      if (!result.rows[0].exists) {
        this.logger.warn('Embeddings table does not exist. Please run migrations.');
        throw new Error('Embeddings table not found. Run migrations first.');
      }
      
      this.logger.debug('Database schema verified');
    } finally {
      client.release();
    }
  }

  /**
   * Store a single embedding vector
   * Uses UPSERT to handle duplicates
   */
  async store(embedding: EmbeddingVector): Promise<void> {
    this.ensureInitialized();
    
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO embeddings (
          id, chunk_id, entity_id, entity_name, vector, 
          content, source, chunk_index, total_chunks
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (entity_id, chunk_id) 
        DO UPDATE SET 
          vector = EXCLUDED.vector,
          content = EXCLUDED.content,
          entity_name = EXCLUDED.entity_name,
          source = EXCLUDED.source,
          chunk_index = EXCLUDED.chunk_index,
          total_chunks = EXCLUDED.total_chunks,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      const values = [
        embedding.id,
        embedding.chunkId,
        embedding.documentChunk.entityId,
        embedding.documentChunk.entityName,
        this.vectorToSql(embedding.vector),
        embedding.documentChunk.content,
        embedding.documentChunk.metadata.source,
        embedding.documentChunk.metadata.chunkIndex,
        embedding.documentChunk.metadata.totalChunks,
      ];
      
      await client.query(query, values);
      this.logger.debug(`Stored embedding: ${embedding.id}`);
    } catch (error) {
      this.logger.error(`Failed to store embedding ${embedding.id}`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Store multiple embedding vectors in a transaction
   * Optimized for batch operations
   */
  async storeBatch(embeddings: EmbeddingVector[]): Promise<void> {
    this.ensureInitialized();
    
    if (embeddings.length === 0) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      const query = `
        INSERT INTO embeddings (
          id, chunk_id, entity_id, entity_name, vector, 
          content, source, chunk_index, total_chunks
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (entity_id, chunk_id) 
        DO UPDATE SET 
          vector = EXCLUDED.vector,
          content = EXCLUDED.content,
          entity_name = EXCLUDED.entity_name,
          source = EXCLUDED.source,
          chunk_index = EXCLUDED.chunk_index,
          total_chunks = EXCLUDED.total_chunks,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      for (const embedding of embeddings) {
        const values = [
          embedding.id,
          embedding.chunkId,
          embedding.documentChunk.entityId,
          embedding.documentChunk.entityName,
          this.vectorToSql(embedding.vector),
          embedding.documentChunk.content,
          embedding.documentChunk.metadata.source,
          embedding.documentChunk.metadata.chunkIndex,
          embedding.documentChunk.metadata.totalChunks,
        ];
        
        await client.query(query, values);
      }
      
      await client.query('COMMIT');
      this.logger.info(`Stored batch of ${embeddings.length} embeddings`);
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to store embedding batch', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Search for similar vectors using cosine similarity
   * Uses pgvector's <=> operator with HNSW index for O(log n) performance
   */
  async search(
    queryVector: number[],
    topK: number,
    entityId?: string
  ): Promise<SearchResult[]> {
    this.ensureInitialized();
    
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT 
          id,
          chunk_id,
          entity_id,
          entity_name,
          content,
          source,
          chunk_index,
          total_chunks,
          1 - (vector <=> $1) as similarity
        FROM embeddings
        WHERE ($2::TEXT IS NULL OR entity_id = $2)
        ORDER BY vector <=> $1
        LIMIT $3
      `;
      
      const values = [
        this.vectorToSql(queryVector),
        entityId || null,
        topK,
      ];
      
      const result = await client.query(query, values);
      
      const searchResults: SearchResult[] = result.rows.map(row => ({
        documentChunk: {
          id: row.id,
          entityId: row.entity_id,
          entityName: row.entity_name,
          content: row.content,
          metadata: {
            source: row.source,
            chunkIndex: row.chunk_index,
            totalChunks: row.total_chunks,
          },
        },
        similarity: parseFloat(row.similarity),
      }));
      
      this.logger.info(
        `Found ${searchResults.length} results for query (entityId: ${entityId || 'all'})`
      );
      
      return searchResults;
    } catch (error) {
      this.logger.error('Failed to search vectors', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clear all stored vectors or vectors for a specific entity
   */
  async clear(entityId?: string): Promise<void> {
    this.ensureInitialized();
    
    const client = await this.pool.connect();
    try {
      let query: string;
      let values: any[];
      
      if (entityId) {
        query = 'DELETE FROM embeddings WHERE entity_id = $1';
        values = [entityId];
      } else {
        query = 'DELETE FROM embeddings';
        values = [];
      }
      
      const result = await client.query(query, values);
      const count = result.rowCount || 0;
      
      this.logger.info(`Cleared ${count} vectors${entityId ? ` for entity ${entityId}` : ''}`);
      
      // Run VACUUM to reclaim space (async)
      if (!entityId) {
        client.query('VACUUM embeddings').catch(err => {
          this.logger.warn('Failed to vacuum embeddings table', err);
        });
      }
    } catch (error) {
      this.logger.error('Failed to clear vectors', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get total count of stored vectors
   */
  async count(entityId?: string): Promise<number> {
    this.ensureInitialized();
    
    const client = await this.pool.connect();
    try {
      let query: string;
      let values: any[];
      
      if (entityId) {
        query = 'SELECT COUNT(*) as count FROM embeddings WHERE entity_id = $1';
        values = [entityId];
      } else {
        query = 'SELECT COUNT(*) as count FROM embeddings';
        values = [];
      }
      
      const result = await client.query(query, values);
      const count = parseInt(result.rows[0].count, 10);
      
      return count;
    } catch (error) {
      this.logger.error('Failed to count vectors', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get statistics about the vector store
   */
  async getStats(): Promise<{
    totalVectors: number;
    uniqueEntities: number;
    catalogEntities: number;
    techdocsEntities: number;
  }> {
    this.ensureInitialized();
    
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM embedding_stats');
      
      if (result.rows.length === 0) {
        return {
          totalVectors: 0,
          uniqueEntities: 0,
          catalogEntities: 0,
          techdocsEntities: 0,
        };
      }
      
      const stats = result.rows[0];
      return {
        totalVectors: parseInt(stats.total_embeddings, 10),
        uniqueEntities: parseInt(stats.unique_entities, 10),
        catalogEntities: parseInt(stats.catalog_entities, 10),
        techdocsEntities: parseInt(stats.techdocs_entities, 10),
      };
    } catch (error) {
      this.logger.error('Failed to get stats', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close the connection pool
   * Should be called on application shutdown
   */
  async close(): Promise<void> {
    try {
      await this.pool.end();
      this.logger.info('PgVectorStore connection pool closed');
    } catch (error) {
      this.logger.error('Error closing PgVectorStore pool', error);
      throw error;
    }
  }

  /**
   * Convert number array to PostgreSQL vector format
   */
  private vectorToSql(vector: number[]): string {
    return `[${vector.join(',')}]`;
  }

  /**
   * Ensure the store is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('PgVectorStore not initialized. Call initialize() first.');
    }
  }

  /**
   * Health check for the vector store
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        return true;
      } finally {
        client.release();
      }
    } catch (error) {
      this.logger.error('Health check failed', error);
      return false;
    }
  }
}
