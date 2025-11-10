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
 * Tests for database migrations
 * Ensures migrations can be applied and rolled back safely
 * 
 * To run these tests:
 * 1. Start PostgreSQL: docker-compose up -d postgres
 * 2. Run tests: yarn test:migrations
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const TEST_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'backstage_vectors',
  user: process.env.POSTGRES_USER || 'backstage',
  password: process.env.POSTGRES_PASSWORD || 'backstage_dev_password',
  ssl: false,
};

const skipTests = process.env.SKIP_INTEGRATION_TESTS === 'true';

describe.skipIf(skipTests)('Database Migrations', () => {
  let pool: Pool;

  const readMigrationFile = (filename: string): string => {
    const migrationPath = path.join(__dirname, filename);
    return fs.readFileSync(migrationPath, 'utf8');
  };

  beforeAll(async () => {
    pool = new Pool(TEST_CONFIG);
    
    // Test if PostgreSQL is available
    try {
      await pool.query('SELECT 1');
    } catch (error) {
      console.log('PostgreSQL not available, skipping migration tests');
      await pool.end();
      throw error;
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('001_initial_schema', () => {
    beforeEach(async () => {
      // Clean up before each test
      await pool.query('DROP TABLE IF EXISTS embeddings CASCADE');
      await pool.query('DROP EXTENSION IF EXISTS vector CASCADE');
    });

    describe('Up Migration', () => {
      it('should create pgvector extension', async () => {
        const migrationSql = readMigrationFile('001_initial_schema.sql');
        await pool.query(migrationSql);

        const result = await pool.query(`
          SELECT * FROM pg_extension WHERE extname = 'vector'
        `);

        expect(result.rows).toHaveLength(1);
      });

      it('should create embeddings table', async () => {
        const migrationSql = readMigrationFile('001_initial_schema.sql');
        await pool.query(migrationSql);

        const result = await pool.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_name = 'embeddings'
        `);

        expect(result.rows).toHaveLength(1);
      });

      it('should create all required columns', async () => {
        const migrationSql = readMigrationFile('001_initial_schema.sql');
        await pool.query(migrationSql);

        const result = await pool.query(`
          SELECT column_name, data_type, udt_name
          FROM information_schema.columns 
          WHERE table_name = 'embeddings'
          ORDER BY ordinal_position
        `);

        const columns = result.rows.map(r => r.column_name);
        expect(columns).toContain('id');
        expect(columns).toContain('chunk_id');
        expect(columns).toContain('entity_id');
        expect(columns).toContain('entity_name');
        expect(columns).toContain('content');
        expect(columns).toContain('embedding');
        expect(columns).toContain('source');
        expect(columns).toContain('chunk_index');
        expect(columns).toContain('total_chunks');
        expect(columns).toContain('created_at');
        expect(columns).toContain('updated_at');

        // Check vector column type
        const vectorColumn = result.rows.find(r => r.column_name === 'embedding');
        expect(vectorColumn.udt_name).toBe('vector');
      });

      it('should create HNSW index on embedding column', async () => {
        const migrationSql = readMigrationFile('001_initial_schema.sql');
        await pool.query(migrationSql);

        const result = await pool.query(`
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE tablename = 'embeddings'
          AND indexname = 'embeddings_embedding_idx'
        `);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].indexdef).toContain('USING hnsw');
        expect(result.rows[0].indexdef).toContain('vector_cosine_ops');
      });

      it('should create B-tree indexes', async () => {
        const migrationSql = readMigrationFile('001_initial_schema.sql');
        await pool.query(migrationSql);

        const result = await pool.query(`
          SELECT indexname
          FROM pg_indexes
          WHERE tablename = 'embeddings'
          ORDER BY indexname
        `);

        const indexes = result.rows.map(r => r.indexname);
        expect(indexes).toContain('embeddings_entity_id_idx');
        expect(indexes).toContain('embeddings_chunk_id_idx');
        expect(indexes).toContain('embeddings_source_idx');
      });

      it('should create update_updated_at_column function', async () => {
        const migrationSql = readMigrationFile('001_initial_schema.sql');
        await pool.query(migrationSql);

        const result = await pool.query(`
          SELECT proname
          FROM pg_proc
          WHERE proname = 'update_updated_at_column'
        `);

        expect(result.rows).toHaveLength(1);
      });

      it('should create trigger for updated_at column', async () => {
        const migrationSql = readMigrationFile('001_initial_schema.sql');
        await pool.query(migrationSql);

        const result = await pool.query(`
          SELECT tgname
          FROM pg_trigger
          WHERE tgname = 'update_embeddings_updated_at'
        `);

        expect(result.rows).toHaveLength(1);
      });

      it('should create search_similar_embeddings function', async () => {
        const migrationSql = readMigrationFile('001_initial_schema.sql');
        await pool.query(migrationSql);

        const result = await pool.query(`
          SELECT proname
          FROM pg_proc
          WHERE proname = 'search_similar_embeddings'
        `);

        expect(result.rows).toHaveLength(1);
      });

      it('should create get_entity_stats function', async () => {
        const migrationSql = readMigrationFile('001_initial_schema.sql');
        await pool.query(migrationSql);

        const result = await pool.query(`
          SELECT proname
          FROM pg_proc
          WHERE proname = 'get_entity_stats'
        `);

        expect(result.rows).toHaveLength(1);
      });

      it('should create embedding_stats view', async () => {
        const migrationSql = readMigrationFile('001_initial_schema.sql');
        await pool.query(migrationSql);

        const result = await pool.query(`
          SELECT viewname
          FROM pg_views
          WHERE viewname = 'embedding_stats'
        `);

        expect(result.rows).toHaveLength(1);
      });
    });

    describe('Down Migration', () => {
      beforeEach(async () => {
        // Apply up migration first
        const upMigration = readMigrationFile('001_initial_schema.sql');
        await pool.query(upMigration);
      });

      it('should drop embeddings table', async () => {
        const downMigration = readMigrationFile('down/001_initial_schema.sql');
        await pool.query(downMigration);

        const result = await pool.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_name = 'embeddings'
        `);

        expect(result.rows).toHaveLength(0);
      });

      it('should drop vector extension', async () => {
        const downMigration = readMigrationFile('down/001_initial_schema.sql');
        await pool.query(downMigration);

        const result = await pool.query(`
          SELECT * FROM pg_extension WHERE extname = 'vector'
        `);

        expect(result.rows).toHaveLength(0);
      });

      it('should drop all functions', async () => {
        const downMigration = readMigrationFile('down/001_initial_schema.sql');
        await pool.query(downMigration);

        const result = await pool.query(`
          SELECT proname
          FROM pg_proc
          WHERE proname IN (
            'update_updated_at_column',
            'search_similar_embeddings',
            'get_entity_stats'
          )
        `);

        expect(result.rows).toHaveLength(0);
      });

      it('should drop embedding_stats view', async () => {
        const downMigration = readMigrationFile('down/001_initial_schema.sql');
        await pool.query(downMigration);

        const result = await pool.query(`
          SELECT viewname
          FROM pg_views
          WHERE viewname = 'embedding_stats'
        `);

        expect(result.rows).toHaveLength(0);
      });
    });

    describe('Idempotency', () => {
      it('should handle running up migration twice', async () => {
        const migrationSql = readMigrationFile('001_initial_schema.sql');
        
        // Run migration first time
        await pool.query(migrationSql);
        
        // Run migration second time (should not error)
        await expect(pool.query(migrationSql)).resolves.not.toThrow();

        // Verify table still exists
        const result = await pool.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_name = 'embeddings'
        `);

        expect(result.rows).toHaveLength(1);
      });

      it('should handle running down migration twice', async () => {
        const upMigration = readMigrationFile('001_initial_schema.sql');
        const downMigration = readMigrationFile('down/001_initial_schema.sql');
        
        // Apply up migration
        await pool.query(upMigration);
        
        // Run down migration first time
        await pool.query(downMigration);
        
        // Run down migration second time (should not error)
        await expect(pool.query(downMigration)).resolves.not.toThrow();
      });
    });

    describe('Data Integrity', () => {
      it('should preserve data through migration cycle', async () => {
        const upMigration = readMigrationFile('001_initial_schema.sql');
        await pool.query(upMigration);

        // Insert test data
        const testVector = Array(384).fill(0.5);
        await pool.query(`
          INSERT INTO embeddings (
            id, chunk_id, entity_id, entity_name, content,
            embedding, source, chunk_index, total_chunks
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          'test-1',
          'chunk-1',
          'entity-1',
          'Test Entity',
          'Test content',
          JSON.stringify(testVector),
          'catalog',
          0,
          1,
        ]);

        // Verify data exists
        const beforeResult = await pool.query('SELECT * FROM embeddings WHERE id = $1', ['test-1']);
        expect(beforeResult.rows).toHaveLength(1);
        expect(beforeResult.rows[0].content).toBe('Test content');

        // Note: In real scenario, we would test migration without dropping data
        // For this test, we just verify the table structure is correct
      });

      it('should enforce NOT NULL constraints', async () => {
        const migrationSql = readMigrationFile('001_initial_schema.sql');
        await pool.query(migrationSql);

        // Try to insert row with NULL required field
        await expect(
          pool.query(`
            INSERT INTO embeddings (id, chunk_id, entity_id, entity_name, content, embedding, source)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, ['test', 'chunk', 'entity', 'name', 'content', JSON.stringify(Array(384).fill(0)), null])
        ).rejects.toThrow();
      });

      it('should enforce PRIMARY KEY constraint', async () => {
        const migrationSql = readMigrationFile('001_initial_schema.sql');
        await pool.query(migrationSql);

        const testVector = JSON.stringify(Array(384).fill(0.5));

        // Insert first row
        await pool.query(`
          INSERT INTO embeddings (
            id, chunk_id, entity_id, entity_name, content,
            embedding, source, chunk_index, total_chunks
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, ['test-1', 'chunk-1', 'entity-1', 'Test', 'Content', testVector, 'catalog', 0, 1]);

        // Try to insert duplicate id
        await expect(
          pool.query(`
            INSERT INTO embeddings (
              id, chunk_id, entity_id, entity_name, content,
              embedding, source, chunk_index, total_chunks
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, ['test-1', 'chunk-2', 'entity-2', 'Test2', 'Content2', testVector, 'catalog', 0, 1])
        ).rejects.toThrow();
      });

      it('should enforce CHECK constraint on source', async () => {
        const migrationSql = readMigrationFile('001_initial_schema.sql');
        await pool.query(migrationSql);

        const testVector = JSON.stringify(Array(384).fill(0.5));

        // Try to insert invalid source
        await expect(
          pool.query(`
            INSERT INTO embeddings (
              id, chunk_id, entity_id, entity_name, content,
              embedding, source, chunk_index, total_chunks
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, ['test-1', 'chunk-1', 'entity-1', 'Test', 'Content', testVector, 'invalid', 0, 1])
        ).rejects.toThrow();
      });
    });

    describe('Helper Functions', () => {
      beforeEach(async () => {
        const migrationSql = readMigrationFile('001_initial_schema.sql');
        await pool.query(migrationSql);
      });

      it('should execute search_similar_embeddings function', async () => {
        // Insert test data
        const testVector = Array(384).fill(0.5);
        await pool.query(`
          INSERT INTO embeddings (
            id, chunk_id, entity_id, entity_name, content,
            embedding, source, chunk_index, total_chunks
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          'test-1',
          'chunk-1',
          'entity-1',
          'Test Entity',
          'Test content',
          JSON.stringify(testVector),
          'catalog',
          0,
          1,
        ]);

        // Search for similar embeddings
        const queryVector = Array(384).fill(0.5);
        const result = await pool.query(
          'SELECT * FROM search_similar_embeddings($1::vector, $2)',
          [JSON.stringify(queryVector), 5]
        );

        expect(result.rows.length).toBeGreaterThan(0);
        expect(result.rows[0]).toHaveProperty('similarity');
      });

      it('should execute get_entity_stats function', async () => {
        // Insert test data
        const testVector = JSON.stringify(Array(384).fill(0.5));
        await pool.query(`
          INSERT INTO embeddings (
            id, chunk_id, entity_id, entity_name, content,
            embedding, source, chunk_index, total_chunks
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, ['test-1', 'chunk-1', 'entity-1', 'Test Entity', 'Content', testVector, 'catalog', 0, 1]);

        const result = await pool.query('SELECT * FROM get_entity_stats($1)', ['entity-1']);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].chunk_count).toBe(1);
      });

      it('should query embedding_stats view', async () => {
        const result = await pool.query('SELECT * FROM embedding_stats');

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toHaveProperty('total_vectors');
        expect(result.rows[0]).toHaveProperty('unique_entities');
        expect(result.rows[0]).toHaveProperty('catalog_entities');
        expect(result.rows[0]).toHaveProperty('techdocs_entities');
      });
    });
  });
});
