# Ask AI Configuration Examples

## Basic Configuration

Minimal configuration in `app-config.yaml`:

```yaml
askAi:
  defaultModel: "llama3.2"
  embeddingModel: "all-minilm"
```

## Full Configuration

Complete configuration with all options:

```yaml
askAi:
  # LLM Configuration
  defaultModel: "llama3.2"        # Chat model
  embeddingModel: "all-minilm"     # Embedding model
  ollamaBaseUrl: "http://localhost:11434"
  
  # RAG Configuration
  ragEnabled: true                 # Enable RAG functionality
  defaultTopK: 5                   # Number of chunks to retrieve
  
  # Document Processing
  chunkSize: 512                   # Words per chunk
  chunkOverlap: 50                 # Words overlap between chunks
```

## Environment-Specific Configuration

### Development

```yaml
askAi:
  defaultModel: "llama3.2:latest"
  embeddingModel: "all-minilm"
  ollamaBaseUrl: "http://localhost:11434"
  ragEnabled: true
  defaultTopK: 3
  chunkSize: 256
  chunkOverlap: 25
```

### Production

```yaml
askAi:
  defaultModel: "llama3.2"
  embeddingModel: "all-minilm"
  ollamaBaseUrl: "http://ollama-service:11434"
  ragEnabled: true
  defaultTopK: 5
  chunkSize: 512
  chunkOverlap: 50
```

## Using Different Models

### Llama 3.2 (Default)

```yaml
askAi:
  defaultModel: "llama3.2"
  embeddingModel: "all-minilm"
```

### Mistral

```yaml
askAi:
  defaultModel: "mistral"
  embeddingModel: "all-minilm"
```

### CodeLlama (for technical questions)

```yaml
askAi:
  defaultModel: "codellama"
  embeddingModel: "all-minilm"
```

### Mixtral (larger model)

```yaml
askAi:
  defaultModel: "mixtral"
  embeddingModel: "all-minilm"
```

## Docker Compose Setup

Example `docker-compose.yaml` for Ollama:

```yaml
version: '3.8'

services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    restart: unless-stopped
    
  # Pull models on startup
  ollama-setup:
    image: ollama/ollama:latest
    depends_on:
      - ollama
    entrypoint: /bin/sh
    command:
      - -c
      - |
        sleep 5
        ollama pull llama3.2
        ollama pull all-minilm
    restart: "no"

volumes:
  ollama_data:
```

## Kubernetes Configuration

Example Kubernetes deployment:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: backstage-config
data:
  app-config.yaml: |
    askAi:
      defaultModel: "llama3.2"
      embeddingModel: "all-minilm"
      ollamaBaseUrl: "http://ollama-service:11434"
      ragEnabled: true
      defaultTopK: 5
      chunkSize: 512
      chunkOverlap: 50
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ollama
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ollama
  template:
    metadata:
      labels:
        app: ollama
    spec:
      containers:
      - name: ollama
        image: ollama/ollama:latest
        ports:
        - containerPort: 11434
        volumeMounts:
        - name: ollama-data
          mountPath: /root/.ollama
      volumes:
      - name: ollama-data
        persistentVolumeClaim:
          claimName: ollama-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: ollama-service
spec:
  selector:
    app: ollama
  ports:
  - port: 11434
    targetPort: 11434
```

## Advanced RAG Configuration

### High Accuracy (More Context)

```yaml
askAi:
  defaultModel: "llama3.2"
  embeddingModel: "all-minilm"
  ragEnabled: true
  defaultTopK: 10           # More chunks
  chunkSize: 1024          # Larger chunks
  chunkOverlap: 100        # More overlap
```

### Fast Response (Less Context)

```yaml
askAi:
  defaultModel: "llama3.2"
  embeddingModel: "all-minilm"
  ragEnabled: true
  defaultTopK: 3           # Fewer chunks
  chunkSize: 256           # Smaller chunks
  chunkOverlap: 25         # Less overlap
```

### Disable RAG

```yaml
askAi:
  defaultModel: "llama3.2"
  ragEnabled: false        # Direct LLM only
```

## Vector Store Configuration

### In-Memory (Development)

Default configuration for local development:

```yaml
askAi:
  defaultModel: "llama3.2"
  embeddingModel: "all-minilm"
  ragEnabled: true
  
  vectorStore:
    type: memory  # Default if not specified
```

**Pros**:
- Zero setup required
- Fast for development
- No external dependencies

**Cons**:
- Data lost on restart
- Limited to ~10k vectors
- Not suitable for production

### PostgreSQL with pgvector (Production)

Persistent vector storage for production:

```yaml
askAi:
  defaultModel: "llama3.2"
  embeddingModel: "all-minilm"
  ragEnabled: true
  
  vectorStore:
    type: postgresql
    postgresql:
      host: ${POSTGRES_HOST}
      port: ${POSTGRES_PORT}
      database: ${POSTGRES_DATABASE}
      user: ${POSTGRES_USER}
      password: ${POSTGRES_PASSWORD}
      ssl: ${POSTGRES_SSL}  # true for production
      maxConnections: 10
      idleTimeoutMillis: 10000
      connectionTimeoutMillis: 5000
```

### Complete Production Configuration

Full production setup with PostgreSQL:

```yaml
askAi:
  # LLM Configuration
  defaultModel: "llama3.2"
  embeddingModel: "all-minilm"
  ollamaBaseUrl: "http://ollama-service:11434"
  
  # RAG Configuration
  ragEnabled: true
  defaultTopK: 5
  chunkSize: 512
  chunkOverlap: 50
  
  # Vector Store Configuration
  vectorStore:
    type: postgresql
    postgresql:
      host: postgresql-service
      port: 5432
      database: backstage_vectors
      user: backstage
      password: ${POSTGRES_PASSWORD}  # From secrets
      ssl: true
      maxConnections: 20
      idleTimeoutMillis: 30000
      connectionTimeoutMillis: 10000
```

### Docker Compose with PostgreSQL

Complete setup with both Ollama and PostgreSQL:

```yaml
version: '3.8'

services:
  postgres:
    image: ankane/pgvector:latest
    container_name: backstage-postgres
    environment:
      POSTGRES_DB: backstage_vectors
      POSTGRES_USER: backstage
      POSTGRES_PASSWORD: backstage_dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sh:/docker-entrypoint-initdb.d/init-db.sh
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U backstage"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  ollama:
    image: ollama/ollama:latest
    container_name: backstage-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

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
  postgres_data:
  ollama_data:
```

### Kubernetes with PostgreSQL

PostgreSQL StatefulSet for production:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: postgresql-secret
type: Opaque
stringData:
  username: backstage
  password: your-secure-password-here
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: backstage-ask-ai-config
data:
  app-config.yaml: |
    askAi:
      defaultModel: "llama3.2"
      embeddingModel: "all-minilm"
      ollamaBaseUrl: "http://ollama-service:11434"
      ragEnabled: true
      defaultTopK: 5
      chunkSize: 512
      chunkOverlap: 50
      vectorStore:
        type: postgresql
        postgresql:
          host: postgresql
          port: 5432
          database: backstage_vectors
          user: backstage
          password: ${POSTGRES_PASSWORD}
          ssl: true
          maxConnections: 20
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgresql
spec:
  serviceName: postgresql
  replicas: 1
  selector:
    matchLabels:
      app: postgresql
  template:
    metadata:
      labels:
        app: postgresql
    spec:
      containers:
      - name: postgresql
        image: ankane/pgvector:latest
        ports:
        - containerPort: 5432
          name: postgresql
        env:
        - name: POSTGRES_DB
          value: backstage_vectors
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: postgresql-secret
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgresql-secret
              key: password
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 20Gi
---
apiVersion: v1
kind: Service
metadata:
  name: postgresql
spec:
  selector:
    app: postgresql
  ports:
  - port: 5432
    targetPort: 5432
  clusterIP: None
```

Update Backstage deployment to use PostgreSQL:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backstage
spec:
  template:
    spec:
      containers:
      - name: backstage
        image: your-backstage-image:latest
        env:
        - name: POSTGRES_HOST
          value: postgresql
        - name: POSTGRES_PORT
          value: "5432"
        - name: POSTGRES_DATABASE
          value: backstage_vectors
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: postgresql-secret
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgresql-secret
              key: password
        - name: POSTGRES_SSL
          value: "true"
        volumeMounts:
        - name: config
          mountPath: /app/app-config.yaml
          subPath: app-config.yaml
      volumes:
      - name: config
        configMap:
          name: backstage-ask-ai-config
```

### Connection Pool Settings

Fine-tune PostgreSQL connection pooling:

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
      
      # Connection Pool Configuration
      maxConnections: 20           # Maximum pool size
      idleTimeoutMillis: 30000     # Close idle connections after 30s
      connectionTimeoutMillis: 10000  # Timeout for new connections
```

**Guidelines**:
- **Development**: maxConnections: 5-10
- **Production (small)**: maxConnections: 10-20
- **Production (large)**: maxConnections: 20-50
- **High load**: Adjust based on concurrent users

## Environment Variables

You can also use environment variables:

```bash
# In your .env or environment
# Ollama Configuration
export OLLAMA_BASE_URL=http://localhost:11434
export ASK_AI_DEFAULT_MODEL=llama3.2
export ASK_AI_EMBEDDING_MODEL=all-minilm

# PostgreSQL Configuration
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DATABASE=backstage_vectors
export POSTGRES_USER=backstage
export POSTGRES_PASSWORD=your_secure_password
export POSTGRES_SSL=false
```

Then reference in `app-config.yaml`:

```yaml
askAi:
  defaultModel: ${ASK_AI_DEFAULT_MODEL}
  embeddingModel: ${ASK_AI_EMBEDDING_MODEL}
  ollamaBaseUrl: ${OLLAMA_BASE_URL}
  
  vectorStore:
    type: postgresql
    postgresql:
      host: ${POSTGRES_HOST}
      port: ${POSTGRES_PORT}
      database: ${POSTGRES_DATABASE}
      user: ${POSTGRES_USER}
      password: ${POSTGRES_PASSWORD}
      ssl: ${POSTGRES_SSL}
```

## Model Selection Guide

### For General Q&A
- **llama3.2**: Balanced, good for general questions
- **llama3**: Larger, more capable but slower

### For Code/Technical
- **codellama**: Specialized for code understanding
- **deepseek-coder**: Alternative code model

### For Speed
- **tinyllama**: Very fast, less capable
- **phi**: Microsoft's small but capable model

### For Embeddings
- **all-minilm**: Fast and efficient (recommended)
- **nomic-embed-text**: Alternative embedding model
- **mxbai-embed-large**: Higher quality, slower
