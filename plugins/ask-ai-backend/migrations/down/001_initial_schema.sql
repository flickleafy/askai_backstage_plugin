-- Rollback Migration: 001_initial_schema.sql
-- Description: Rollback initial schema for vector embeddings storage
-- Author: Ask AI Plugin
-- Date: 2025-11-09

-- Display rollback message
DO $$
BEGIN
    RAISE NOTICE '🔄 Rolling back migration 001_initial_schema...';
END $$;

-- Drop helper functions
DROP FUNCTION IF EXISTS search_similar_embeddings(vector, INTEGER, TEXT, FLOAT);
DROP FUNCTION IF EXISTS get_entity_stats(TEXT);
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Drop views
DROP VIEW IF EXISTS embedding_stats;

-- Drop indexes (will be dropped with table, but explicit for clarity)
DROP INDEX IF EXISTS embeddings_created_at_idx;
DROP INDEX IF EXISTS embeddings_entity_source_idx;
DROP INDEX IF EXISTS embeddings_chunk_id_idx;
DROP INDEX IF EXISTS embeddings_entity_id_idx;
DROP INDEX IF EXISTS embeddings_vector_idx;

-- Drop main table
DROP TABLE IF EXISTS embeddings CASCADE;

-- Note: We don't drop the pgvector extension as other applications might use it
-- If you want to completely remove pgvector:
-- DROP EXTENSION IF EXISTS vector CASCADE;

-- Remove migration record (if using migrations table)
-- DELETE FROM schema_migrations WHERE version = '001_initial_schema';

-- Display rollback success message
DO $$
BEGIN
    RAISE NOTICE '✅ Rollback of migration 001_initial_schema completed successfully';
    RAISE NOTICE '   - Removed embeddings table';
    RAISE NOTICE '   - Removed all indexes';
    RAISE NOTICE '   - Removed helper functions and views';
    RAISE NOTICE '   - pgvector extension retained (manual removal if needed)';
END $$;
