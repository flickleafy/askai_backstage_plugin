#!/bin/bash
# Database initialization script for PostgreSQL with pgvector
# This script runs automatically when the container starts for the first time

set -e

echo "🚀 Starting database initialization..."

# Enable pgvector extension
echo "📦 Installing pgvector extension..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create pgvector extension
    CREATE EXTENSION IF NOT EXISTS vector;
    
    -- Verify extension is installed
    SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
EOSQL

echo "✅ pgvector extension installed successfully"

# Run migrations if they exist
if [ -d "/docker-entrypoint-initdb.d/migrations" ]; then
    echo "🔄 Running database migrations..."
    for migration in /docker-entrypoint-initdb.d/migrations/*.sql; do
        if [ -f "$migration" ]; then
            echo "  Running $(basename $migration)..."
            psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$migration"
        fi
    done
    echo "✅ Migrations completed successfully"
else
    echo "ℹ️  No migrations directory found, skipping..."
fi

# Create indexes
echo "🔍 Creating database indexes..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Performance indexes will be created by migrations
    SELECT 'Database indexes ready';
EOSQL

# Grant permissions
echo "🔐 Setting up permissions..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Grant all privileges to backstage user
    GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $POSTGRES_USER;
    
    -- Ensure future tables also have correct permissions
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $POSTGRES_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $POSTGRES_USER;
EOSQL

echo "✅ Permissions configured successfully"

# Display database info
echo "📊 Database Information:"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 
        'Database: ' || current_database() as info
    UNION ALL
    SELECT 
        'Extensions: ' || string_agg(extname || ' v' || extversion, ', ')
    FROM pg_extension
    WHERE extname IN ('vector', 'plpgsql');
EOSQL

echo ""
echo "✨ Database initialization complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Database:  $POSTGRES_DB"
echo "User:      $POSTGRES_USER"
echo "Host:      localhost (inside docker: postgres)"
echo "Port:      5432"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
