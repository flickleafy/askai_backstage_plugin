-- Migration: 001_initial_schema.sql
-- Description: Initial schema for vector embeddings storage with pgvector
-- Author: Ask AI Plugin
-- Date: 2025-11-09

-- Ensure pgvector extension is available
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embeddings table for storing vector embeddings with metadata
-- This table stores document chunks and their vector representations
CREATE TABLE IF NOT EXISTS embeddings (
    -- Primary identifier for the embedding
    id TEXT PRIMARY KEY,
    
    -- Document chunk identifier (for deduplication)
    chunk_id TEXT NOT NULL,
    
    -- Backstage entity reference
    entity_id TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    
    -- Vector embedding (384 dimensions for all-minilm model)
    -- Adjust dimension based on your embedding model:
    -- - all-minilm: 384
    -- - text-embedding-ada-002: 1536
    -- - other models: check documentation
    vector vector(384) NOT NULL,
    
    -- Document content and metadata
    content TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('catalog', 'techdocs')),
    chunk_index INTEGER NOT NULL,
    total_chunks INTEGER NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure chunk_id uniqueness within an entity
    UNIQUE(entity_id, chunk_id)
);

-- Create HNSW index for fast vector similarity search
-- HNSW (Hierarchical Navigable Small World) provides O(log n) search complexity
-- Parameters:
-- - m: Maximum number of connections per layer (default: 16, range: 2-100)
-- - ef_construction: Size of dynamic candidate list (default: 64, range: 4-1000)
-- Higher values = better recall but slower indexing and more memory
CREATE INDEX IF NOT EXISTS embeddings_vector_idx 
    ON embeddings 
    USING hnsw (vector vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Create B-tree index on entity_id for fast entity filtering
CREATE INDEX IF NOT EXISTS embeddings_entity_id_idx 
    ON embeddings (entity_id);

-- Create B-tree index on chunk_id for lookups
CREATE INDEX IF NOT EXISTS embeddings_chunk_id_idx 
    ON embeddings (chunk_id);

-- Create composite index for entity + source queries
CREATE INDEX IF NOT EXISTS embeddings_entity_source_idx 
    ON embeddings (entity_id, source);

-- Create index on timestamps for cleanup operations
CREATE INDEX IF NOT EXISTS embeddings_created_at_idx 
    ON embeddings (created_at);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at on row modification
CREATE TRIGGER update_embeddings_updated_at
    BEFORE UPDATE ON embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create view for embedding statistics
CREATE OR REPLACE VIEW embedding_stats AS
SELECT 
    COUNT(*) as total_embeddings,
    COUNT(DISTINCT entity_id) as unique_entities,
    COUNT(DISTINCT CASE WHEN source = 'catalog' THEN entity_id END) as catalog_entities,
    COUNT(DISTINCT CASE WHEN source = 'techdocs' THEN entity_id END) as techdocs_entities,
    pg_size_pretty(pg_total_relation_size('embeddings')) as total_size,
    MIN(created_at) as oldest_embedding,
    MAX(created_at) as newest_embedding
FROM embeddings;

-- Create function to get entity statistics
CREATE OR REPLACE FUNCTION get_entity_stats(p_entity_id TEXT DEFAULT NULL)
RETURNS TABLE (
    entity_id TEXT,
    entity_name TEXT,
    total_chunks INTEGER,
    catalog_chunks INTEGER,
    techdocs_chunks INTEGER,
    last_updated TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.entity_id,
        MAX(e.entity_name) as entity_name,
        COUNT(*)::INTEGER as total_chunks,
        COUNT(CASE WHEN e.source = 'catalog' THEN 1 END)::INTEGER as catalog_chunks,
        COUNT(CASE WHEN e.source = 'techdocs' THEN 1 END)::INTEGER as techdocs_chunks,
        MAX(e.updated_at) as last_updated
    FROM embeddings e
    WHERE p_entity_id IS NULL OR e.entity_id = p_entity_id
    GROUP BY e.entity_id
    ORDER BY last_updated DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to perform similarity search
-- This can be called directly from SQL if needed
CREATE OR REPLACE FUNCTION search_similar_embeddings(
    query_vector vector(384),
    top_k INTEGER DEFAULT 5,
    filter_entity_id TEXT DEFAULT NULL,
    similarity_threshold FLOAT DEFAULT 0.0
)
RETURNS TABLE (
    id TEXT,
    chunk_id TEXT,
    entity_id TEXT,
    entity_name TEXT,
    content TEXT,
    source TEXT,
    chunk_index INTEGER,
    total_chunks INTEGER,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.chunk_id,
        e.entity_id,
        e.entity_name,
        e.content,
        e.source,
        e.chunk_index,
        e.total_chunks,
        (1 - (e.vector <=> query_vector))::FLOAT as similarity
    FROM embeddings e
    WHERE 
        (filter_entity_id IS NULL OR e.entity_id = filter_entity_id)
        AND (1 - (e.vector <=> query_vector)) >= similarity_threshold
    ORDER BY e.vector <=> query_vector
    LIMIT top_k;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust user as needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON embeddings TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION update_updated_at_column() TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION get_entity_stats(TEXT) TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION search_similar_embeddings(vector, INTEGER, TEXT, FLOAT) TO CURRENT_USER;
GRANT SELECT ON embedding_stats TO CURRENT_USER;

-- Insert migration record (optional: create migrations table to track versions)
-- CREATE TABLE IF NOT EXISTS schema_migrations (
--     version TEXT PRIMARY KEY,
--     applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
-- );
-- INSERT INTO schema_migrations (version) VALUES ('001_initial_schema')
--     ON CONFLICT (version) DO NOTHING;

-- Display migration success message
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 001_initial_schema completed successfully';
    RAISE NOTICE '   - Created embeddings table';
    RAISE NOTICE '   - Created HNSW index for vector similarity search';
    RAISE NOTICE '   - Created supporting indexes for filtering';
    RAISE NOTICE '   - Created helper functions and views';
END $$;
