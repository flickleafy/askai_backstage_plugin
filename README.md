# Ask AI Backstage Plugin

A comprehensive Backstage plugin that integrates Ollama LLM with Retrieval-Augmented Generation (RAG) to provide intelligent Q&A capabilities for your Backstage entities.

## Features

- 🤖 **AI-Powered Q&A**: Ask natural language questions about your services and entities
- 📚 **RAG Integration**: Uses RAG to ground answers in actual Backstage catalog and TechDocs data
- 🔍 **Vector Search**: Efficient similarity search using embeddings
- 🎯 **Entity-Aware**: Contextually aware of the current entity being viewed
- 🔧 **Configurable**: Flexible configuration for models, indexing, and behavior
- 🏗️ **Clean Architecture**: Built with SOLID principles and modular design

## Architecture

The plugin is structured following Clean Code principles with clear separation of concerns:

### Backend Architecture

```
ask-ai-backend/
├── src/
│   ├── models/           # Domain models and types
│   ├── interfaces/       # Service interfaces (SOLID)
│   ├── services/         # Service implementations
│   │   ├── ConfigService.ts
│   │   ├── OllamaLLMService.ts
│   │   ├── InMemoryVectorStore.ts
│   │   ├── DocumentProcessor.ts
│   │   ├── CatalogCollector.ts
│   │   ├── TechDocsCollector.ts
│   │   └── RAGService.ts
│   ├── router.ts         # Express router
│   └── index.ts
```

### Frontend Architecture

```
ask-ai/
├── src/
│   ├── api/              # API client
│   ├── hooks/            # React hooks
│   ├── components/       # React components
│   ├── plugin.ts         # Plugin definition
│   └── index.ts
```

## Prerequisites

Before installing the plugin, ensure you have:

1. **A running Backstage instance** - See [Backstage getting started docs](https://backstage.io/docs/getting-started)

2. **Ollama server** - Install and run Ollama:
   ```bash
   # Install Ollama (macOS/Linux)
   curl -fsSL https://ollama.com/install.sh | sh
   
   # Or use Docker
   docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
   
   # Pull models
   ollama pull llama3.2
   ollama pull all-minilm  # For embeddings
   ```

## Installation

### 1. Install Backend Plugin

Add the backend plugin to your Backstage backend:

```bash
# From your Backstage root directory
cd plugins
# The plugin code should be in plugins/ask-ai-backend
```

Add the plugin to your `packages/backend/package.json`:

```json
{
  "dependencies": {
    "@internal/ask-ai-backend": "link:../../plugins/ask-ai-backend"
  }
}
```

### 2. Install Frontend Plugin

Add the frontend plugin to your Backstage app:

Add to `packages/app/package.json`:

```json
{
  "dependencies": {
    "@internal/ask-ai": "link:../../plugins/ask-ai"
  }
}
```

### 3. Configure Backend

In `packages/backend/src/index.ts`, register the router:

```typescript
import { createAskAiRouter } from '@internal/ask-ai-backend';

// In your createBackend function or similar setup
const askAiRouter = await createAskAiRouter({
  logger: env.logger,
  config: env.config,
  discovery: env.discovery,
});

backend.use('/api/ask-ai', askAiRouter);
```

### 4. Add Configuration

Add configuration to your `app-config.yaml`:

```yaml
askAi:
  # Default LLM model for chat
  defaultModel: "llama3.2"
  
  # Model for generating embeddings
  embeddingModel: "all-minilm"
  
  # Ollama server URL
  ollamaBaseUrl: "http://localhost:11434"
  
  # Enable RAG functionality
  ragEnabled: true
  
  # Number of similar chunks to retrieve
  defaultTopK: 5
  
  # Document chunking configuration
  chunkSize: 512
  chunkOverlap: 50
```

### 5. Add to Entity Page

In `packages/app/src/components/catalog/EntityPage.tsx`, add the Ask AI card:

```typescript
import { EntityAskAiCard } from '@internal/ask-ai';

// Add to your service entity page
const serviceEntityPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      <Grid container spacing={3}>
        {/* Other cards */}
        <Grid item md={12}>
          <EntityAskAiCard />
        </Grid>
      </Grid>
    </EntityLayout.Route>
    
    {/* Or add as a separate tab */}
    <EntityLayout.Route path="/ask-ai" title="Ask AI">
      <EntityAskAiCard />
    </EntityLayout.Route>
  </EntityLayout>
);
```

## Usage

### Basic Usage

1. Navigate to any service or entity page in your Backstage catalog
2. Scroll to the "Ask AI" card
3. Type your question in the text field
4. Click "Ask AI" or press Enter
5. View the AI-generated answer with sources

### Example Questions

- "What APIs does this service expose?"
- "Who owns this service?"
- "What other services depend on this one?"
- "What is the purpose of this component?"
- "What technologies does this service use?"

### RAG Mode

When RAG is enabled (default), the plugin:
1. Converts your question to an embedding
2. Searches for relevant documentation chunks
3. Provides these as context to the LLM
4. Generates an answer grounded in actual Backstage data

### Direct LLM Mode

Toggle off "Use RAG" to ask questions directly to the LLM without context retrieval.

## API Endpoints

### POST `/api/ask-ai`

Ask a question with optional RAG.

**Request:**
```json
{
  "prompt": "What APIs does this service expose?",
  "model": "llama3.2",
  "entityId": "component:default/my-service",
  "useRAG": true,
  "topK": 5
}
```

**Response:**
```json
{
  "answer": "Based on the documentation...",
  "sources": [...],
  "model": "llama3.2"
}
```

### POST `/api/ask-ai/index`

Trigger indexing of all documents.

### GET `/api/ask-ai/index/status`

Get indexing status.

### POST `/api/ask-ai/index/entity`

Index a specific entity.

**Request:**
```json
{
  "entityRef": "component:default/my-service"
}
```

### GET `/api/ask-ai/health`

Health check endpoint.

## Development

### Running Tests

```bash
# Backend
cd plugins/ask-ai-backend
yarn test

# Frontend
cd plugins/ask-ai
yarn test
```

### Building

```bash
# Backend
cd plugins/ask-ai-backend
yarn build

# Frontend
cd plugins/ask-ai
yarn build
```

### Linting

```bash
yarn lint
```

## SOLID Principles Implementation

This plugin strictly follows SOLID principles:

### Single Responsibility Principle (SRP)
- Each service has one clear responsibility
- `OllamaLLMService`: Only handles LLM operations
- `VectorStore`: Only handles vector storage
- `DocumentProcessor`: Only handles document processing

### Open/Closed Principle (OCP)
- Services are open for extension via interfaces
- Easy to add new vector stores or LLM providers
- Implement `IVectorStore` for different backends

### Liskov Substitution Principle (LSP)
- All services implement interfaces
- Services can be swapped with implementations

### Interface Segregation Principle (ISP)
- Small, focused interfaces
- Clients depend only on interfaces they use

### Dependency Inversion Principle (DIP)
- High-level modules depend on abstractions
- `RAGService` depends on interfaces, not concrete implementations

## Vector Store Options

The plugin supports multiple vector store backends for storing document embeddings. Choose the option that best fits your deployment scenario.

### In-Memory (Development)

**Best for**: Local development, testing, proof-of-concept

The default in-memory vector store stores all embeddings in RAM. Simple and fast for development, but:
- ❌ Data is lost on restart
- ❌ Not scalable beyond ~10k vectors
- ❌ No persistence across deployments

**Configuration:**
```yaml
askAi:
  vectorStore:
    type: memory
```

### PostgreSQL with pgvector (Recommended for Production)

**Best for**: Production deployments, self-hosted environments

PostgreSQL with the pgvector extension provides persistent, scalable vector storage:
- ✅ Persistent storage (survives restarts)
- ✅ ACID transactions
- ✅ Efficient similarity search with HNSW index (O(log n))
- ✅ Scales to millions of vectors
- ✅ Familiar PostgreSQL operations and tooling
- ✅ Self-hosted with full control

**Quick Start:**

1. **Start PostgreSQL with Docker:**
   ```bash
   docker-compose up -d postgres
   ```

2. **Configure the plugin:**
   ```yaml
   askAi:
     vectorStore:
       type: postgresql
       postgresql:
         host: localhost
         port: 5432
         database: backstage_vectors
         user: backstage
         password: ${POSTGRES_PASSWORD}
         maxConnections: 10
   ```

3. **Run migrations:**
   The plugin automatically initializes the schema on first connection.

### Comparing Options

| Feature | In-Memory | PostgreSQL + pgvector |
|---------|-----------|----------------------|
| **Persistence** | ❌ None | ✅ Full |
| **Scalability** | ~10k vectors | Millions |
| **Search Speed** | O(n) | O(log n) with HNSW |
| **Setup Complexity** | None | Medium |
| **Production Ready** | ❌ No | ✅ Yes |
| **Cost** | Free | Database hosting |

### Future Vector Store Implementations

The plugin's interface-based design makes it easy to add other vector stores:

**Pinecone** (Managed Cloud):
```typescript
export class PineconeVectorStore implements IVectorStore {
  // Implementation using Pinecone SDK
}
```

**Weaviate** (Open-Source):
```typescript
export class WeaviateVectorStore implements IVectorStore {
  // Implementation using Weaviate client
}
```

**Qdrant**, **Milvus**, **Chroma**, etc. can all be added by implementing the `IVectorStore` interface.

## Production Considerations

### Indexing Strategy

- Initial indexing runs 10 seconds after startup
- Re-index periodically or on catalog updates
- Consider incremental indexing for large catalogs

### Performance

- Batch embed requests for efficiency
- Cache embeddings when possible
- Use appropriate chunk sizes for your use case

## Troubleshooting

### Ollama Connection Issues

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Check logs
docker logs ollama  # if using Docker
```

### No Sources Found

- Ensure indexing has completed: `GET /api/ask-ai/index/status`
- Trigger manual indexing: `POST /api/ask-ai/index`
- Check that entities have descriptions or TechDocs

### Poor Answer Quality

- Increase `topK` to retrieve more context
- Adjust `chunkSize` and `chunkOverlap`
- Try different models (llama3.2, mistral, etc.)

## Contributing

Contributions are welcome! Please ensure:

- Code follows SOLID principles
- Tests are included
- Documentation is updated
- Linting passes

## 📄 License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)** for **personal and non-commercial use only**.

### Personal Use

For personal, educational, and non-commercial purposes, this software is freely available under the GPL-3.0 license:

✅ **You Can**:

- Use this plugin for personal projects and learning
- Modify and adapt the code for non-commercial purposes
- Contribute improvements back to the project

⚠️ **You Must**:

- Disclose source and include license notices
- Share modifications under the same GPL-3.0 license
- Clearly state any significant changes made

❌ **You Cannot**:

- Sublicense under different terms
- Hold authors liable for damages

### Commercial Use

**Commercial use of this software requires a separate commercial license.**

Commercial use includes, but is not limited to:
- Integration into commercial products or services
- Use within organizations generating revenue
- Deployment in enterprise or production environments for business purposes
- Distribution as part of commercial offerings

For commercial licensing inquiries, please contact inbox.

We offer flexible commercial licensing options tailored to your organization's needs, including support and maintenance agreements.

### Full License Text

The GPL-3.0 license terms for non-commercial use can be found in the [LICENSE](./LICENSE) file.

```text
Copyright (C) 2025-2026 flickleafy

This program is free software for personal use: you can redistribute it 
and/or modify it under the terms of the GNU General Public License as 
published by the Free Software Foundation, either version 3 of the License, 
or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

Commercial use requires a separate commercial license. Please contact
the copyright holder for commercial licensing terms.
```

For GPL-3.0 license details: <https://www.gnu.org/licenses/gpl-3.0.html>
