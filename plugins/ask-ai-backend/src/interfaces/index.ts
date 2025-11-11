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
 * Service interfaces following SOLID principles
 * 
 * @packageDocumentation
 */

import { Logger } from 'winston';
import {
  ChatMessage,
  DocumentChunk,
  EmbeddingVector,
  SearchResult,
  OllamaChatResponse,
  OllamaEmbedResponse,
  AskAiConfig,
} from '../models';
import type { RAGAnswer, RAGQuestionOptions } from '../rag/types';

/**
 * Interface for LLM service operations
 * Single Responsibility: Handles all LLM-related operations
 */
export interface ILLMService {
  /**
   * Generate a chat completion
   */
  chat(messages: ChatMessage[], model?: string): Promise<string>;

  /**
   * Generate embeddings for text inputs
   */
  generateEmbeddings(inputs: string[], model?: string): Promise<number[][]>;
}

/**
 * Interface for vector store operations
 * Single Responsibility: Manages vector storage and retrieval
 */
export interface IVectorStore {
  /**
   * Store an embedding vector
   */
  store(embedding: EmbeddingVector): Promise<void>;

  /**
   * Store multiple embedding vectors in batch
   */
  storeBatch(embeddings: EmbeddingVector[]): Promise<void>;

  /**
   * Search for similar vectors
   */
  search(queryVector: number[], topK: number, entityId?: string): Promise<SearchResult[]>;

  /**
   * Clear all stored vectors
   */
  clear(): Promise<void>;

  /**
   * Get total count of stored vectors
   */
  count(): Promise<number>;
}

/**
 * Interface for document processing
 * Single Responsibility: Handles document chunking and preparation
 */
export interface IDocumentProcessor {
  /**
   * Chunk a document into smaller pieces
   */
  chunkDocument(content: string, entityId: string, entityName: string, source: 'catalog' | 'techdocs'): DocumentChunk[];

  /**
   * Extract text content from various formats
   */
  extractText(content: string, format?: string): string;
}

/**
 * Interface for Backstage catalog operations
 * Single Responsibility: Fetches entity data from Backstage catalog
 */
export interface ICatalogCollector {
  /**
   * Fetch all entities from the catalog
   */
  fetchAllEntities(): Promise<any[]>;

  /**
   * Fetch a specific entity by reference
   */
  fetchEntity(entityRef: string): Promise<any>;

  /**
   * Extract relevant text content from an entity
   */
  extractEntityContent(entity: any): string;

  /**
   * Get entity reference string
   */
  getEntityRef(entity: any): string;
}

/**
 * Interface for TechDocs operations
 * Single Responsibility: Fetches documentation from TechDocs
 */
export interface ITechDocsCollector {
  /**
   * Fetch documentation for an entity
   */
  fetchDocumentation(entityRef: string): Promise<string | null>;

  /**
   * Check if documentation exists for an entity
   */
  hasDocumentation(entityRef: string): Promise<boolean>;
}

/**
 * Interface for RAG operations
 * Single Responsibility: Orchestrates the RAG pipeline
 */
export interface IRAGService {
  /**
   * Index all Backstage entities and their documentation
   */
  indexAllDocuments(): Promise<void>;

  /**
   * Index a specific entity
   */
  indexEntity(entityRef: string): Promise<void>;

  /**
   * Retrieve relevant context for a query
   */
  retrieveContext(query: string, topK: number, entityId?: string): Promise<DocumentChunk[]>;

  /**
   * Generate an answer using RAG (backwards compatibility)
   */
  generateAnswer(query: string, context: DocumentChunk[], model?: string): Promise<string>;

  /**
   * High-level helper to answer a user question with the active strategy.
   */
  answerQuestion(query: string, options?: RAGQuestionOptions): Promise<RAGAnswer>;
}

/**
 * Interface for configuration management
 * Single Responsibility: Manages plugin configuration
 */
export interface IConfigService {
  /**
   * Get the complete configuration
   */
  getConfig(): AskAiConfig;

  /**
   * Get a specific configuration value
   */
  get<T>(key: string, defaultValue?: T): T;
}

/**
 * Dependencies for service construction
 */
export interface ServiceDependencies {
  logger: Logger;
  config: IConfigService;
}

/**
 * Dependencies for RAG service construction
 */
export interface RAGServiceDependencies extends ServiceDependencies {
  llmService: ILLMService;
  vectorStore: IVectorStore;
  documentProcessor: IDocumentProcessor;
  catalogCollector: ICatalogCollector;
  techDocsCollector: ITechDocsCollector;
}
