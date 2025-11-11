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
 * Domain models and data structures
 * 
 * @packageDocumentation
 */

/**
 * Represents a chat message in the conversation
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Represents a document chunk with its metadata
 */
export interface DocumentChunk {
  id: string;
  entityId: string;
  entityName: string;
  content: string;
  metadata: {
    source: 'catalog' | 'techdocs';
    chunkIndex: number;
    totalChunks: number;
  };
}

/**
 * Represents an embedding vector with its associated document chunk
 */
export interface EmbeddingVector {
  id: string;
  chunkId: string;
  vector: number[];
  documentChunk: DocumentChunk;
}

/**
 * Represents a similarity search result
 */
export interface SearchResult {
  documentChunk: DocumentChunk;
  similarity: number;
}

/**
 * Request payload for asking a question
 */
export interface AskQuestionRequest {
  prompt: string;
  model?: string;
  entityId?: string;
  useRAG?: boolean;
  topK?: number;
}

/**
 * Response payload for a question answer
 */
export interface AskQuestionResponse {
  answer: string;
  sources?: DocumentChunk[];
  model: string;
}

/**
 * Ollama chat API response structure
 */
export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

/**
 * Ollama embed API response structure
 */
export interface OllamaEmbedResponse {
  model: string;
  embeddings: number[][];
}

/**
 * PostgreSQL connection configuration
 */
export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/**
 * Vector store configuration
 */
export interface VectorStoreConfig {
  type: 'memory' | 'postgresql';
  postgresql?: PostgresConfig;
}

/**
 * Configuration for the Ask AI plugin
 */
export interface AskAiConfig {
  defaultModel: string;
  embeddingModel: string;
  ollamaBaseUrl: string;
  ragEnabled: boolean;
  ragStrategy: string;
  defaultTopK: number;
  chunkSize: number;
  chunkOverlap: number;
  vectorStore: VectorStoreConfig;
}
