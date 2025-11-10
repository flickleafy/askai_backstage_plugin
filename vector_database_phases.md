# Complete Implementation Plan: PostgreSQL with pgvector for Persistent Vector Storage

Based on my analysis of the project documentation and codebase, here's a comprehensive step-by-step plan to implement PostgreSQL with pgvector as a persistent vector store alternative to InMemoryVectorStore:

---

### **Phase 1: Prerequisites & Dependencies**

#### **Step 1.1: Install PostgreSQL with pgvector Extension**
- **Action**: Set up PostgreSQL database with pgvector extension
- **Options**:
  - Local PostgreSQL installation + pgvector
  - Docker container with pgvector pre-installed
  - Cloud PostgreSQL with pgvector support (AWS RDS, Google Cloud SQL, Azure Database)
- **Files**: `docker-compose.yaml` (for Docker setup)
- **Dependencies**: PostgreSQL 12+, pgvector extension

#### **Step 1.2: Add Node.js Dependencies**
- **Action**: Add PostgreSQL client libraries to backend plugin
- **Files**: package.json
- **Dependencies to add**:
  - `pg` (PostgreSQL client for Node.js) - version ^8.11.0
  - `@types/pg` (TypeScript types) - version ^8.10.0
- **Command**: `yarn add pg && yarn add -D @types/pg`

---

### **Phase 2: Database Schema Design**

#### **Step 2.1: Design Database Schema**
- **Action**: Create SQL schema for vector storage
- **Tables to create**:
  1. **`embeddings`** table:
     - `id` (TEXT PRIMARY KEY) - Unique embedding ID
     - `chunk_id` (TEXT NOT NULL) - Document chunk ID
     - `entity_id` (TEXT NOT NULL) - Backstage entity ID
     - `entity_name` (TEXT NOT NULL) - Entity name for display
     - `vector` (VECTOR(384)) - Embedding vector (dimension depends on model)
     - `content` (TEXT NOT NULL) - Document chunk content
     - `source` (TEXT NOT NULL) - 'catalog' or 'techdocs'
     - `chunk_index` (INTEGER NOT NULL) - Chunk index within document
     - `total_chunks` (INTEGER NOT NULL) - Total chunks in document
     - `created_at` (TIMESTAMP DEFAULT NOW())
     - `updated_at` (TIMESTAMP DEFAULT NOW())
  2. **Indexes**:
     - HNSW index on `vector` column for fast similarity search
     - B-tree index on `entity_id` for entity filtering
     - B-tree index on `chunk_id` for deduplication
- **Files**: Create `plugins/ask-ai-backend/migrations/001_initial_schema.sql`

#### **Step 2.2: Create Migration Scripts**
- **Action**: Write SQL migration scripts
- **Files**: 
  - `plugins/ask-ai-backend/migrations/001_initial_schema.sql` (CREATE TABLE)
  - `plugins/ask-ai-backend/migrations/down/001_initial_schema.sql` (DROP TABLE - rollback)
- **Content**: Include pgvector extension creation, table creation, index creation

---

### **Phase 3: Configuration Updates**

#### **Step 3.1: Update Configuration Interface**
- **Action**: Extend `AskAiConfig` interface to support vector store configuration
- **Files**: index.ts
- **Changes**: Add new properties:
  ```typescript
  export interface AskAiConfig {
    // ... existing properties
    vectorStore: {
      type: 'memory' | 'postgresql';  // Vector store type
      postgresql?: {
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
        ssl?: boolean;
        maxConnections?: number;
        idleTimeoutMillis?: number;
      };
    };
  }
  ```

#### **Step 3.2: Update ConfigService**
- **Action**: Add methods to read PostgreSQL configuration
- **Files**: ConfigService.ts
- **Changes**: Add getter methods for vector store config with validation and defaults

#### **Step 3.3: Update app-config.yaml Schema**
- **Action**: Document new configuration options
- **Files**: CONFIG.md, README.md, SETUP.md
- **Example configuration**:
  ```yaml
  askAi:
    defaultModel: "llama3.2"
    embeddingModel: "all-minilm"
    vectorStore:
      type: "postgresql"  # or "memory"
      postgresql:
        host: "localhost"
        port: 5432
        database: "backstage_vectors"
        user: "backstage"
        password: "${POSTGRES_PASSWORD}"  # Use environment variable
        ssl: false
        maxConnections: 10
  ```

---

### **Phase 4: PgVectorStore Implementation**

#### **Step 4.1: Create PgVectorStore Class**
- **Action**: Implement `IVectorStore` interface with PostgreSQL backend
- **Files**: Create `plugins/ask-ai-backend/src/services/PgVectorStore.ts`
- **Structure**:
  ```typescript
  export class PgVectorStore implements IVectorStore {
    private readonly logger: Logger;
    private readonly pool: Pool;  // PostgreSQL connection pool
    
    constructor(logger: Logger, config: PostgresConfig);
    
    // IVectorStore methods
    async store(embedding: EmbeddingVector): Promise<void>;
    async storeBatch(embeddings: EmbeddingVector[]): Promise<void>;
    async search(queryVector: number[], topK: number, entityId?: string): Promise<SearchResult[]>;
    async clear(): Promise<void>;
    async count(): Promise<number>;
    
    // Helper methods
    private async ensureConnection(): Promise<void>;
    private async runMigrations(): Promise<void>;
    private vectorToSql(vector: number[]): string;
    async close(): Promise<void>;  // Clean shutdown
  }
  ```

#### **Step 4.2: Implement store() Method**
- **Action**: Store single embedding vector
- **SQL Query**: `INSERT INTO embeddings (...) VALUES (...) ON CONFLICT (id) DO UPDATE SET ...`
- **Features**: 
  - Upsert behavior (insert or update)
  - Transaction support
  - Error handling with retry logic

#### **Step 4.3: Implement storeBatch() Method**
- **Action**: Batch insert for performance
- **SQL Query**: Use multi-row INSERT with transaction
- **Optimization**: 
  - Batch size limit (e.g., 100 rows per batch)
  - Use prepared statements
  - Transaction wrapping for atomicity

#### **Step 4.4: Implement search() Method**
- **Action**: Similarity search using pgvector operators
- **SQL Query**: 
  ```sql
  SELECT id, chunk_id, entity_id, entity_name, content, source, 
         chunk_index, total_chunks,
         1 - (vector <=> $1) as similarity
  FROM embeddings
  WHERE ($2::TEXT IS NULL OR entity_id = $2)
  ORDER BY vector <=> $1
  LIMIT $3;
  ```
- **Features**:
  - Cosine distance operator (`<=>`)
  - Optional entity filtering
  - Configurable top-K
  - Index utilization (HNSW)

#### **Step 4.5: Implement clear() Method**
- **Action**: Delete all embeddings
- **SQL Query**: `DELETE FROM embeddings`
- **Features**: 
  - Optional entity-scoped clear
  - Vacuum table after clear for space reclamation

#### **Step 4.6: Implement count() Method**
- **Action**: Count total vectors
- **SQL Query**: `SELECT COUNT(*) FROM embeddings [WHERE entity_id = $1]`
- **Features**: Optional entity filtering

#### **Step 4.7: Implement Connection Management**
- **Action**: PostgreSQL connection pool setup
- **Features**:
  - Connection pooling with `pg.Pool`
  - Health checks
  - Reconnection logic
  - Graceful shutdown
  - Connection timeout handling

#### **Step 4.8: Implement Migration Runner**
- **Action**: Auto-run migrations on startup
- **Features**:
  - Check if pgvector extension exists
  - Create extension if needed
  - Run schema migrations
  - Version tracking (optional: add migrations table)

---

### **Phase 5: Factory Pattern for Vector Store Selection**

#### **Step 5.1: Create Vector Store Factory**
- **Action**: Factory function to create appropriate vector store
- **Files**: Create `plugins/ask-ai-backend/src/services/VectorStoreFactory.ts`
- **Structure**:
  ```typescript
  export class VectorStoreFactory {
    static async create(
      config: ConfigService,
      logger: Logger
    ): Promise<IVectorStore> {
      const vectorStoreType = config.getVectorStoreType();
      
      if (vectorStoreType === 'postgresql') {
        const pgConfig = config.getPostgresConfig();
        const store = new PgVectorStore(logger, pgConfig);
        await store.initialize();  // Run migrations
        return store;
      }
      
      // Default to in-memory
      return new InMemoryVectorStore(logger);
    }
  }
  ```

#### **Step 5.2: Update Router to Use Factory**
- **Action**: Replace direct instantiation with factory
- **Files**: router.ts
- **Changes**:
  ```typescript
  // Before:
  const vectorStore = new InMemoryVectorStore(logger);
  
  // After:
  const vectorStore = await VectorStoreFactory.create(configService, logger);
  ```

---

### **Phase 6: Export & Index Updates**

#### **Step 6.1: Update Service Exports**
- **Action**: Export new PgVectorStore class
- **Files**: index.ts
- **Changes**: Add `export { PgVectorStore } from './PgVectorStore';`

#### **Step 6.2: Update Type Exports**
- **Action**: Export PostgreSQL config types
- **Files**: index.ts
- **Changes**: Add `PostgresConfig` interface if needed

---

### **Phase 7: Testing**

#### **Step 7.1: Create Unit Tests**
- **Action**: Test PgVectorStore in isolation
- **Files**: Create `plugins/ask-ai-backend/src/services/PgVectorStore.test.ts`
- **Tests**:
  - Connection establishment
  - Store/retrieve operations
  - Batch operations
  - Search with similarity threshold
  - Entity filtering
  - Error handling
  - Connection pool management
- **Mock**: Use `pg-mem` or test container for isolated testing

#### **Step 7.2: Create Integration Tests**
- **Action**: Test with real PostgreSQL database
- **Files**: Create `plugins/ask-ai-backend/src/services/PgVectorStore.integration.test.ts`
- **Setup**: Use Docker test container or dedicated test database
- **Tests**:
  - Full RAG pipeline with PostgreSQL
  - Migration execution
  - Performance benchmarks
  - Concurrent access

#### **Step 7.3: Create Migration Tests**
- **Action**: Test migration scripts
- **Files**: Create `plugins/ask-ai-backend/migrations/migrations.test.ts`
- **Tests**:
  - Schema creation
  - Index creation
  - Rollback functionality

---

### **Phase 8: Documentation**

#### **Step 8.1: Update README.md**
- **Action**: Document PostgreSQL setup
- **Files**: README.md
- **Sections to add**:
  - PostgreSQL prerequisites
  - Vector store selection guide
  - Performance comparison (In-Memory vs PostgreSQL)
  - When to use each option

#### **Step 8.2: Update SETUP.md**
- **Action**: Add PostgreSQL setup instructions
- **Files**: SETUP.md
- **Content**:
  - PostgreSQL installation steps
  - pgvector extension installation
  - Database creation
  - User/permissions setup
  - Configuration examples

#### **Step 8.3: Update CONFIG.md**
- **Action**: Document vector store configuration
- **Files**: CONFIG.md
- **Content**:
  - Vector store type options
  - PostgreSQL connection parameters
  - SSL configuration
  - Connection pooling tuning
  - Environment variable usage

#### **Step 8.4: Update ARCHITECTURE.md**
- **Action**: Document vector store abstraction
- **Files**: ARCHITECTURE.md
- **Content**:
  - Update architecture diagram
  - Document IVectorStore implementations
  - Factory pattern explanation
  - Performance characteristics
  - Scaling considerations

#### **Step 8.5: Create Migration Guide**
- **Action**: Guide for migrating from in-memory to PostgreSQL
- **Files**: Create `docs/MIGRATION_GUIDE.md`
- **Content**:
  - When to migrate
  - Step-by-step migration process
  - Data migration script
  - Rollback procedure
  - Testing checklist

#### **Step 8.6: Update IMPLEMENTATION.md**
- **Action**: Document implementation details
- **Files**: IMPLEMENTATION.md
- **Content**:
  - PgVectorStore architecture
  - Performance optimization techniques
  - Connection pooling strategy
  - Error handling patterns

---

### **Phase 9: Docker & Deployment**

#### **Step 9.1: Create Docker Compose Configuration**
- **Action**: Add PostgreSQL service to Docker Compose
- **Files**: Create/update `docker-compose.yaml`
- **Services**:
  ```yaml
  services:
    postgres:
      image: ankane/pgvector:latest
      environment:
        POSTGRES_DB: backstage_vectors
        POSTGRES_USER: backstage
        POSTGRES_PASSWORD: secret
      ports:
        - "5432:5432"
      volumes:
        - postgres_data:/var/lib/postgresql/data
        - ./migrations:/docker-entrypoint-initdb.d
    
    ollama:
      # ... existing
  
  volumes:
    postgres_data:
  ```

#### **Step 9.2: Create Kubernetes Manifests**
- **Action**: Production deployment configurations
- **Files**: Create `k8s/postgresql-deployment.yaml`, `k8s/postgresql-pvc.yaml`
- **Content**:
  - StatefulSet for PostgreSQL
  - PersistentVolumeClaim
  - Service definition
  - ConfigMap for connection strings
  - Secret for credentials

#### **Step 9.3: Create Initialization Scripts**
- **Action**: Database initialization for containers
- **Files**: `scripts/init-db.sh`
- **Content**:
  - Create database
  - Create user
  - Grant permissions
  - Enable pgvector extension
  - Run migrations

---

### **Phase 10: Performance & Monitoring**

#### **Step 10.1: Add Performance Metrics**
- **Action**: Log query performance
- **Files**: `plugins/ask-ai-backend/src/services/PgVectorStore.ts`
- **Metrics**:
  - Query execution time
  - Batch insert duration
  - Connection pool statistics
  - Cache hit rates (if caching implemented)

#### **Step 10.2: Implement Connection Health Checks**
- **Action**: Monitor PostgreSQL health
- **Files**: `plugins/ask-ai-backend/src/services/PgVectorStore.ts`
- **Features**:
  - Periodic health checks
  - Automatic reconnection
  - Circuit breaker pattern
  - Health endpoint integration

#### **Step 10.3: Add Query Optimization**
- **Action**: Optimize database queries
- **Techniques**:
  - EXPLAIN ANALYZE for query plans
  - Index tuning (HNSW parameters)
  - Query result caching
  - Connection pooling optimization
  - Prepared statement caching

---

### **Phase 11: Security**

#### **Step 11.1: Implement Secure Configuration**
- **Action**: Secure credential management
- **Features**:
  - Environment variable for passwords
  - SSL/TLS support
  - Connection string encryption
  - IAM authentication (cloud providers)

#### **Step 11.2: Add Input Validation**
- **Action**: Prevent SQL injection
- **Files**: `plugins/ask-ai-backend/src/services/PgVectorStore.ts`
- **Features**:
  - Parameterized queries only
  - Input sanitization
  - Vector dimension validation
  - Entity ID validation

#### **Step 11.3: Implement Access Controls**
- **Action**: Database user permissions
- **Features**:
  - Least privilege principle
  - Read-only user for queries
  - Write user for indexing
  - Admin user for migrations

---

### **Phase 12: Advanced Features (Optional)**

#### **Step 12.1: Implement Caching Layer**
- **Action**: Add Redis cache for hot queries
- **Files**: Create `plugins/ask-ai-backend/src/services/CachedVectorStore.ts`
- **Features**:
  - Decorator pattern over PgVectorStore
  - TTL-based cache invalidation
  - LRU eviction policy

#### **Step 12.2: Add Batch Migration Tool**
- **Action**: Tool to migrate from in-memory to PostgreSQL
- **Files**: Create `scripts/migrate-vectors.ts`
- **Features**:
  - Export from in-memory
  - Import to PostgreSQL
  - Progress tracking
  - Validation

#### **Step 12.3: Implement Incremental Indexing**
- **Action**: Track and update only changed entities
- **Features**:
  - Timestamp-based change detection
  - Differential indexing
  - Background re-indexing

---

### **Phase 13: Copilot Instructions Update**

#### **Step 13.1: Update copilot-instructions.md**
- **Action**: Add PgVectorStore patterns
- **Files**: copilot-instructions.md
- **Content**:
  - PostgreSQL/pgvector usage patterns
  - Connection pooling best practices
  - SQL query optimization
  - Vector dimension handling
  - Migration strategy

---

### **Summary of Files to Create/Modify**

**New Files (18)**:
1. `plugins/ask-ai-backend/src/services/PgVectorStore.ts` (Main implementation)
2. `plugins/ask-ai-backend/src/services/VectorStoreFactory.ts` (Factory pattern)
3. `plugins/ask-ai-backend/src/services/PgVectorStore.test.ts` (Unit tests)
4. `plugins/ask-ai-backend/src/services/PgVectorStore.integration.test.ts` (Integration tests)
5. `plugins/ask-ai-backend/migrations/001_initial_schema.sql` (Schema)
6. `plugins/ask-ai-backend/migrations/down/001_initial_schema.sql` (Rollback)
7. `plugins/ask-ai-backend/migrations/migrations.test.ts` (Migration tests)
8. `docs/MIGRATION_GUIDE.md` (Migration documentation)
9. `docker-compose.yaml` (Docker setup)
10. `k8s/postgresql-deployment.yaml` (Kubernetes deployment)
11. `k8s/postgresql-pvc.yaml` (Persistent volume)
12. `k8s/postgresql-service.yaml` (Service definition)
13. `scripts/init-db.sh` (Database initialization)
14. `scripts/migrate-vectors.ts` (Data migration tool)
15. `examples/app-config-postgresql.yaml` (Config example)
16. `examples/docker-compose-full.yaml` (Full stack example)
17. `.env.example` (Environment variables template)
18. `plugins/ask-ai-backend/src/services/CachedVectorStore.ts` (Optional caching)

**Modified Files (11)**:
1. package.json (Add pg dependencies)
2. index.ts (Add PostgresConfig)
3. ConfigService.ts (Add PG config methods)
4. index.ts (Export new classes)
5. router.ts (Use factory pattern)
6. README.md (Add PostgreSQL sections)
7. SETUP.md (Add setup instructions)
8. CONFIG.md (Add configuration docs)
9. ARCHITECTURE.md (Update architecture)
10. IMPLEMENTATION.md (Add implementation details)
11. copilot-instructions.md (Add PG patterns)
