# Setup Guide

This guide walks you through setting up the Ask AI plugin in your Backstage instance.

## Prerequisites Checklist

- [ ] Backstage instance running (v1.x)
- [ ] Node.js 18+ and Yarn installed
- [ ] Ollama installed and running
- [ ] Models downloaded (llama3.2, all-minilm)

## Step-by-Step Setup

### 1. Install Ollama and Models

#### Option A: Local Installation (Recommended for Development)

**macOS:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows:**
Download from [ollama.com/download](https://ollama.com/download)

#### Option B: Docker Installation

```bash
docker run -d \
  -v ollama:/root/.ollama \
  -p 11434:11434 \
  --name ollama \
  ollama/ollama
```

#### Download Required Models

```bash
# Chat model (choose one)
ollama pull llama3.2        # Recommended: Balanced
ollama pull llama3          # Alternative: More powerful
ollama pull mistral         # Alternative: Good quality

# Embedding model (required)
ollama pull all-minilm      # Recommended: Fast and efficient
```

#### Verify Installation

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Test chat
ollama run llama3.2
>>> Hello
>>> /bye

# Test embedding
curl http://localhost:11434/api/embed \
  -d '{"model": "all-minilm", "input": ["test"]}'
```

### 2. Copy Plugin Files

Copy the plugin directories to your Backstage installation:

```bash
# Assuming you're in your Backstage root directory
# and the plugin code is in /path/to/llm_backstage_plugin

# Backend plugin
cp -r /path/to/llm_backstage_plugin/plugins/ask-ai-backend \
      ./plugins/

# Frontend plugin
cp -r /path/to/llm_backstage_plugin/plugins/ask-ai \
      ./plugins/
```

### 3. Install Backend Plugin

**Add to `packages/backend/package.json`:**

```json
{
  "dependencies": {
    "@internal/ask-ai-backend": "link:../../plugins/ask-ai-backend",
    "express": "^4.18.2",
    "node-fetch": "^2.7.0"
  }
}
```

**Install dependencies:**

```bash
cd packages/backend
yarn install
```

### 4. Register Backend Router

**Edit `packages/backend/src/index.ts`:**

```typescript
import { createAskAiRouter } from '@internal/ask-ai-backend';

// ... existing imports

async function main() {
  // ... existing backend setup

  // Add Ask AI router
  const askAiRouter = await createAskAiRouter({
    logger: env.logger,
    config: env.config,
    discovery: env.discovery,
  });

  // Mount the router
  const apiRouter = Router();
  apiRouter.use('/ask-ai', askAiRouter);
  
  // ... rest of backend setup
}
```

**Alternative: Using Backstage's New Backend System**

If using the new backend system, create a backend plugin module:

```typescript
// plugins/ask-ai-backend/src/module.ts
import { createBackendModule } from '@backstage/backend-plugin-api';
import { createAskAiRouter } from './router';

export const askAiModule = createBackendModule({
  pluginId: 'ask-ai',
  moduleId: 'default',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        discovery: coreServices.discovery,
        httpRouter: coreServices.httpRouter,
      },
      async init({ logger, config, discovery, httpRouter }) {
        const router = await createAskAiRouter({
          logger,
          config,
          discovery,
        });
        httpRouter.use(router);
      },
    });
  },
});
```

### 5. Install Frontend Plugin

**Add to `packages/app/package.json`:**

```json
{
  "dependencies": {
    "@internal/ask-ai": "link:../../plugins/ask-ai",
    "@material-ui/core": "^4.12.4",
    "@material-ui/icons": "^4.11.3"
  }
}
```

**Install dependencies:**

```bash
cd packages/app
yarn install
```

### 6. Add to Entity Page

**Edit `packages/app/src/components/catalog/EntityPage.tsx`:**

```typescript
import { EntityAskAiCard } from '@internal/ask-ai';

// For service entities
const serviceEntityPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      <Grid container spacing={3} alignItems="stretch">
        {/* Existing cards */}
        <Grid item md={6}>
          <EntityAboutCard variant="gridItem" />
        </Grid>
        
        {/* Add Ask AI Card */}
        <Grid item md={12}>
          <EntityAskAiCard />
        </Grid>
      </Grid>
    </EntityLayout.Route>

    {/* Or add as a separate tab */}
    <EntityLayout.Route path="/ask-ai" title="Ask AI">
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <EntityAskAiCard />
        </Grid>
      </Grid>
    </EntityLayout.Route>
  </EntityLayout>
);
```

### 7. Configure the Plugin

**Edit `app-config.yaml`:**

```yaml
# Add at the top level
askAi:
  # Model for chat completions
  defaultModel: "llama3.2"
  
  # Model for generating embeddings
  embeddingModel: "all-minilm"
  
  # Ollama server URL
  ollamaBaseUrl: "http://localhost:11434"
  
  # Enable RAG functionality
  ragEnabled: true
  
  # Number of context chunks to retrieve
  defaultTopK: 5
  
  # Document chunking settings
  chunkSize: 512
  chunkOverlap: 50
```

**For production, create `app-config.production.yaml`:**

```yaml
askAi:
  defaultModel: "llama3.2"
  embeddingModel: "all-minilm"
  ollamaBaseUrl: "${OLLAMA_URL}"  # Environment variable
  ragEnabled: true
  defaultTopK: 5
  chunkSize: 512
  chunkOverlap: 50
```

### 8. Build and Run

```bash
# From Backstage root directory

# Build backend
cd packages/backend
yarn build

# Build frontend
cd ../app
yarn build

# Start Backstage
cd ../..
yarn dev
```

### 9. Verify Installation

1. **Check Ollama Connection:**
   ```bash
   curl http://localhost:7007/api/ask-ai/health
   ```

   Expected response:
   ```json
   {
     "status": "healthy",
     "ollama": true,
     "vectorCount": 0,
     "config": {
       "defaultModel": "llama3.2",
       "embeddingModel": "all-minilm",
       "ragEnabled": true
     }
   }
   ```

2. **Trigger Initial Indexing:**
   ```bash
   curl -X POST http://localhost:7007/api/ask-ai/index
   ```

3. **Check Indexing Status:**
   ```bash
   curl http://localhost:7007/api/ask-ai/index/status
   ```

4. **Navigate to any entity page in Backstage UI**
   - You should see the "Ask AI" card
   - Try asking a question

## Troubleshooting

### Ollama Not Found

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# If not running:
ollama serve

# Or restart Docker container:
docker restart ollama
```

### Models Not Found

```bash
# List installed models
ollama list

# Pull required models
ollama pull llama3.2
ollama pull all-minilm
```

### Backend Compilation Errors

```bash
# Clear cache and rebuild
cd packages/backend
yarn clean
rm -rf node_modules
yarn install
yarn build
```

### Frontend Build Errors

```bash
# Clear cache and rebuild
cd packages/app
yarn clean
rm -rf node_modules
yarn install
yarn build
```

### No Sources Found

The plugin needs to index your catalog first:

```bash
# Trigger indexing
curl -X POST http://localhost:7007/api/ask-ai/index

# Wait for indexing to complete (check logs)
# Then check status
curl http://localhost:7007/api/ask-ai/index/status
```

### Permission Errors

Make sure Backstage has network access to Ollama:

```yaml
# If using Docker, add to docker-compose.yaml
services:
  backstage:
    # ...
    extra_hosts:
      - "host.docker.internal:host-gateway"

# Then in app-config.yaml:
askAi:
  ollamaBaseUrl: "http://host.docker.internal:11434"
```

### Port Conflicts

If port 11434 is taken:

```bash
# Run Ollama on different port
OLLAMA_HOST=0.0.0.0:11435 ollama serve

# Update app-config.yaml:
askAi:
  ollamaBaseUrl: "http://localhost:11435"
```

## Docker Compose Setup

Create `docker-compose.yaml` in your Backstage root:

```yaml
version: '3.8'

services:
  ollama:
    image: ollama/ollama:latest
    container_name: backstage-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Setup service to pull models
  ollama-setup:
    image: ollama/ollama:latest
    depends_on:
      ollama:
        condition: service_healthy
    entrypoint: /bin/sh
    command:
      - -c
      - |
        sleep 5
        ollama pull llama3.2
        ollama pull all-minilm
        echo "Models downloaded successfully"
    restart: "no"

volumes:
  ollama_data:
```

Start with:
```bash
docker-compose up -d
```

## PostgreSQL Setup (Production)

For production deployments, use PostgreSQL with pgvector for persistent vector storage.

### Quick Setup with Docker

The easiest way to get started with PostgreSQL:

```bash
# Start PostgreSQL and Ollama together
docker-compose up -d

# Verify both services are running
docker-compose ps

# Check PostgreSQL is ready
docker-compose exec postgres psql -U backstage -d backstage_vectors -c "SELECT 1;"
```

### Add PostgreSQL Configuration

**Update `app-config.yaml`:**

```yaml
askAi:
  defaultModel: "llama3.2"
  embeddingModel: "all-minilm"
  ollamaBaseUrl: "http://localhost:11434"
  ragEnabled: true
  defaultTopK: 5
  chunkSize: 512
  chunkOverlap: 50
  
  # Add vector store configuration
  vectorStore:
    type: postgresql  # or 'memory' for development
    postgresql:
      host: localhost
      port: 5432
      database: backstage_vectors
      user: backstage
      password: ${POSTGRES_PASSWORD}  # Use environment variable
      ssl: false  # Set to true for production
      maxConnections: 10
```

### Install PostgreSQL Dependencies

The dependencies are already included in `package.json`:

```bash
cd plugins/ask-ai-backend
yarn install
```

Dependencies:
- `pg`: ^8.11.3
- `@types/pg`: ^8.10.9

### Set Environment Variables

Create `.env` file in your Backstage root:

```bash
# PostgreSQL Configuration
POSTGRES_PASSWORD=backstage_dev_password

# For production, use secrets management
```

**⚠️ Security**: Never commit `.env` files. Add to `.gitignore`:
```bash
echo ".env" >> .gitignore
```

### Verify PostgreSQL Setup

```bash
# Check health endpoint
curl http://localhost:7007/api/ask-ai/health

# Expected response:
# {
#   "status": "ok",
#   "vectorStore": "postgresql",
#   "totalVectors": 0,
#   "database": {
#     "connected": true,
#     "host": "localhost",
#     "database": "backstage_vectors"
#   }
# }
```

### Trigger Initial Indexing

```bash
# Index all entities
curl -X POST http://localhost:7007/api/ask-ai/index

# Check progress
curl http://localhost:7007/api/ask-ai/index/status
```

### Database Management

**Connect to PostgreSQL:**
```bash
# Using Docker
docker-compose exec postgres psql -U backstage -d backstage_vectors

# Using local PostgreSQL
psql -h localhost -U backstage -d backstage_vectors
```

**Useful queries:**
```sql
-- Check vector count
SELECT COUNT(*) FROM embeddings;

-- View statistics
SELECT * FROM embedding_stats;

-- Get entity stats
SELECT entity_name, COUNT(*) as chunks
FROM embeddings
GROUP BY entity_name
ORDER BY chunks DESC
LIMIT 10;

-- Clear all vectors (for testing)
DELETE FROM embeddings;
```

### Detailed PostgreSQL Documentation

For comprehensive PostgreSQL setup, see:
- [PGVECTOR_QUICKSTART.md](./docs/PGVECTOR_QUICKSTART.md) - 5-minute quick start
- [PGVECTOR_IMPLEMENTATION.md](./docs/PGVECTOR_IMPLEMENTATION.md) - Full implementation guide
- [MIGRATION_GUIDE.md](./docs/MIGRATION_GUIDE.md) - Migrating from in-memory

## Production Deployment

### Environment Variables

```bash
# .env.production
OLLAMA_URL=http://ollama-service:11434
ASK_AI_DEFAULT_MODEL=llama3.2
ASK_AI_EMBEDDING_MODEL=all-minilm
ASK_AI_RAG_ENABLED=true

# PostgreSQL (required for production)
POSTGRES_HOST=postgresql-service
POSTGRES_PORT=5432
POSTGRES_DATABASE=backstage_vectors
POSTGRES_USER=backstage
POSTGRES_PASSWORD=${SECRET_POSTGRES_PASSWORD}
```

### Kubernetes Deployment

See `CONFIG.md` for Kubernetes configuration examples.

### Vector Store Options

**Development**: Use in-memory vector store
```yaml
askAi:
  vectorStore:
    type: memory
```

**Production**: Use PostgreSQL with pgvector
```yaml
askAi:
  vectorStore:
    type: postgresql
    postgresql:
      host: ${POSTGRES_HOST}
      port: 5432
      database: backstage_vectors
      user: backstage
      password: ${POSTGRES_PASSWORD}
      ssl: true  # Always use SSL in production
```

## Next Steps

- [ ] Review [CONFIG.md](CONFIG.md) for advanced configuration options
- [ ] Test with sample questions
- [ ] Monitor indexing status
- [ ] Adjust chunk size and topK based on your needs
- [ ] Consider implementing persistent vector store for production

## Getting Help

- Check the [README.md](README.md) for general information
- Review logs: `yarn dev` output
- Check Ollama logs: `docker logs ollama`
- Verify health endpoint: `/api/ask-ai/health`
- Check indexing status: `/api/ask-ai/index/status`

## Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| "Cannot find module '@internal/ask-ai-backend'" | Run `yarn install` in packages/backend |
| "Ollama API error" | Verify Ollama is running: `curl http://localhost:11434/api/tags` |
| "No embeddings found" | Pull embedding model: `ollama pull all-minilm` |
| "Failed to fetch entities" | Check Backstage catalog is populated |
| "Vector count is 0" | Trigger indexing: `POST /api/ask-ai/index` |
