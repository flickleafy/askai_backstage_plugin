# Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Install Ollama

```bash
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh

# Or Docker
docker run -d -p 11434:11434 --name ollama ollama/ollama
```

### Step 2: Download Models

```bash
ollama pull llama3.2      # Chat model
ollama pull all-minilm    # Embedding model
```

### Step 3: Copy Plugin Files

```bash
# From your Backstage root
cp -r /path/to/llm_backstage_plugin/plugins/* ./plugins/
```

### Step 4: Add Dependencies

**packages/backend/package.json:**
```json
{
  "dependencies": {
    "@internal/ask-ai-backend": "link:../../plugins/ask-ai-backend"
  }
}
```

**packages/app/package.json:**
```json
{
  "dependencies": {
    "@internal/ask-ai": "link:../../plugins/ask-ai"
  }
}
```

### Step 5: Register Backend

**packages/backend/src/index.ts:**
```typescript
import { createAskAiRouter } from '@internal/ask-ai-backend';

// Add router
const askAiRouter = await createAskAiRouter({
  logger: env.logger,
  config: env.config,
  discovery: env.discovery,
});

backend.use('/api/ask-ai', askAiRouter);
```

### Step 6: Configure

**app-config.yaml:**
```yaml
askAi:
  defaultModel: "llama3.2"
  embeddingModel: "all-minilm"
  ollamaBaseUrl: "http://localhost:11434"
  ragEnabled: true
  defaultTopK: 5
  chunkSize: 512
  chunkOverlap: 50
```

### Step 7: Add to UI

**packages/app/src/components/catalog/EntityPage.tsx:**
```typescript
import { EntityAskAiCard } from '@internal/ask-ai';

// Add to service page
<Grid item md={12}>
  <EntityAskAiCard />
</Grid>
```

### Step 8: Run!

```bash
yarn install
yarn dev
```

### Step 9: Test

Visit any entity page and ask: "What is this service?"

## 📚 Full Documentation

- [README.md](README.md) - Complete guide
- [SETUP.md](SETUP.md) - Detailed setup instructions
- [CONFIG.md](CONFIG.md) - Configuration options

## 🎯 Key Features

✅ **AI Q&A** - Ask natural language questions about your services
✅ **RAG Integration** - Answers grounded in your actual documentation
✅ **Clean Architecture** - SOLID principles throughout
✅ **Modular Design** - Easy to extend and customize
✅ **Production Ready** - Error handling, logging, health checks

## 🔍 Example Questions

- "What APIs does this service expose?"
- "Who owns this component?"
- "What technologies does this use?"
- "What services depend on this?"
- "What is the purpose of this API?"

## 🛠 Troubleshooting

**Ollama not connecting?**
```bash
curl http://localhost:11434/api/tags
```

**No sources found?**
```bash
curl -X POST http://localhost:7007/api/ask-ai/index
```

**Check health:**
```bash
curl http://localhost:7007/api/ask-ai/health
```

## 🏗 Architecture Overview

```
Frontend (React)
    │
    ├─→ Ask Question
    │      ↓
    │   Backend API
    │      ↓
    │   RAG Service
    │      ↓
    ├─→ Retrieve Context (Vector Search)
    │      ↓
    └─→ Generate Answer (LLM)
```

## 📦 What's Included

**Backend:**
- ConfigService
- OllamaLLMService
- InMemoryVectorStore
- DocumentProcessor
- CatalogCollector
- TechDocsCollector
- RAGService

**Frontend:**
- AskAiCard component
- useAskQuestion hook
- AskAiApi client

**Documentation:**
- Complete setup guide
- Architecture documentation
- Configuration examples
- Troubleshooting guide

## 🔧 Customization

**Change Models:**
```yaml
askAi:
  defaultModel: "mistral"
  embeddingModel: "nomic-embed-text"
```

**Adjust RAG:**
```yaml
askAi:
  defaultTopK: 10      # More context
  chunkSize: 1024      # Larger chunks
```

**Disable RAG:**
```yaml
askAi:
  ragEnabled: false    # Direct LLM only
```

## 🚢 Production Deployment

1. Replace InMemoryVectorStore with PostgreSQL + pgvector
2. Add rate limiting
3. Add monitoring and metrics
4. Configure proper logging
5. Set up CI/CD
6. Add comprehensive tests

## 📝 License

Distributed under the GPL-3.0-or-later license. You may run, study, share, and modify this plugin as long as you release derivative work under GPL-3.0-or-later and retain the license notices. See `LICENSE` for the complete terms.

## 🙏 Acknowledgments

Built with Clean Code principles and SOLID design patterns.
Based on Backstage plugin architecture.
Powered by Ollama LLM.

---

**Need help?** Check the full documentation or open an issue!
