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
 * RAG Service implementation
 * Orchestrates the Retrieval-Augmented Generation pipeline
 * 
 * @packageDocumentation
 */

import {
  IRAGService,
  RAGServiceDependencies,
  ILLMService,
  IVectorStore,
  IDocumentProcessor,
  ICatalogCollector,
  ITechDocsCollector,
} from '../interfaces';
import { DocumentChunk, ChatMessage, EmbeddingVector } from '../models';
import { Logger } from '@backstage/backend-common';

/**
 * Service that orchestrates the RAG pipeline
 * Follows Single Responsibility and Open/Closed principles
 */
export class RAGService implements IRAGService {
  private readonly logger: Logger;
  private readonly llmService: ILLMService;
  private readonly vectorStore: IVectorStore;
  private readonly documentProcessor: IDocumentProcessor;
  private readonly catalogCollector: ICatalogCollector;
  private readonly techDocsCollector: ITechDocsCollector;

  private indexingInProgress = false;
  private lastIndexTime: Date | null = null;

  constructor(dependencies: RAGServiceDependencies) {
    this.logger = dependencies.logger;
    this.llmService = dependencies.llmService;
    this.vectorStore = dependencies.vectorStore;
    this.documentProcessor = dependencies.documentProcessor;
    this.catalogCollector = dependencies.catalogCollector;
    this.techDocsCollector = dependencies.techDocsCollector;
  }

  /**
   * Index all Backstage entities and their documentation
   */
  async indexAllDocuments(): Promise<void> {
    if (this.indexingInProgress) {
      this.logger.warn('Indexing already in progress, skipping');
      return;
    }

    try {
      this.indexingInProgress = true;
      this.logger.info('Starting full document indexing');

      // Clear existing vectors
      await this.vectorStore.clear();

      // Fetch all entities
      const entities = await this.catalogCollector.fetchAllEntities();
      this.logger.info(`Indexing ${entities.length} entities`);

      // Process entities in batches to avoid overwhelming the system
      const batchSize = 10;
      for (let i = 0; i < entities.length; i += batchSize) {
        const batch = entities.slice(i, i + batchSize);
        await Promise.all(
          batch.map(entity => this.indexEntityInternal(entity))
        );
        this.logger.info(`Indexed ${Math.min(i + batchSize, entities.length)}/${entities.length} entities`);
      }

      this.lastIndexTime = new Date();
      const vectorCount = await this.vectorStore.count();
      
      this.logger.info(
        `Indexing complete. Total vectors stored: ${vectorCount}`
      );
    } catch (error) {
      this.logger.error(`Indexing failed: ${error}`);
      throw error;
    } finally {
      this.indexingInProgress = false;
    }
  }

  /**
   * Index a specific entity
   */
  async indexEntity(entityRef: string): Promise<void> {
    try {
      this.logger.info(`Indexing entity: ${entityRef}`);
      const entity = await this.catalogCollector.fetchEntity(entityRef);
      await this.indexEntityInternal(entity);
    } catch (error) {
      this.logger.error(`Failed to index entity ${entityRef}: ${error}`);
      throw error;
    }
  }

  /**
   * Internal method to index an entity
   */
  private async indexEntityInternal(entity: any): Promise<void> {
    const entityRef = this.catalogCollector.getEntityRef(entity);
    const entityName = entity.metadata.name;
    const allChunks: DocumentChunk[] = [];

    try {
      // Extract catalog metadata
      const catalogContent = this.catalogCollector.extractEntityContent(entity);
      const catalogChunks = this.documentProcessor.chunkDocument(
        catalogContent,
        entityRef,
        entityName,
        'catalog'
      );
      allChunks.push(...catalogChunks);

      // Fetch and process TechDocs if available
      const hasDocs = await this.techDocsCollector.hasDocumentation(entityRef);
      if (hasDocs) {
        const documentation = await this.techDocsCollector.fetchDocumentation(entityRef);
        if (documentation) {
          const docChunks = this.documentProcessor.chunkDocument(
            documentation,
            entityRef,
            entityName,
            'techdocs'
          );
          allChunks.push(...docChunks);
        }
      }

      if (allChunks.length === 0) {
        this.logger.debug(`No chunks created for ${entityName}`);
        return;
      }

      // Generate embeddings for all chunks
      const chunkTexts = allChunks.map(chunk => chunk.content);
      const embeddings = await this.llmService.generateEmbeddings(chunkTexts);

      // Create embedding vectors
      const embeddingVectors: EmbeddingVector[] = allChunks.map((chunk, index) => ({
        id: chunk.id,
        chunkId: chunk.id,
        vector: embeddings[index],
        documentChunk: chunk,
      }));

      // Store in vector store
      await this.vectorStore.storeBatch(embeddingVectors);

      this.logger.debug(
        `Indexed ${allChunks.length} chunks for ${entityName}`
      );
    } catch (error) {
      this.logger.error(`Failed to index ${entityName}: ${error}`);
      // Continue with other entities instead of failing completely
    }
  }

  /**
   * Retrieve relevant context for a query
   */
  async retrieveContext(
    query: string,
    topK: number,
    entityId?: string
  ): Promise<DocumentChunk[]> {
    try {
      this.logger.info(`Retrieving context for query (topK: ${topK})`);

      // Generate query embedding
      const queryEmbeddings = await this.llmService.generateEmbeddings([query]);
      const queryVector = queryEmbeddings[0];

      // Search vector store
      const results = await this.vectorStore.search(queryVector, topK, entityId);

      // Extract document chunks
      const chunks = results.map(result => result.documentChunk);

      this.logger.info(`Retrieved ${chunks.length} relevant chunks`);
      return chunks;
    } catch (error) {
      this.logger.error(`Context retrieval failed: ${error}`);
      throw error;
    }
  }

  /**
   * Generate an answer using RAG
   */
  async generateAnswer(
    query: string,
    context: DocumentChunk[],
    model?: string
  ): Promise<string> {
    try {
      this.logger.info('Generating answer with RAG');

      // Build context string
      const contextString = this.buildContextString(context);

      // Create messages for chat
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are a helpful assistant that answers questions about Backstage projects and services. 
Use the following context to answer the user's question. If the answer cannot be found in the context, say so.
Always cite which service or entity you're referring to when providing information.

Context:
${contextString}`,
        },
        {
          role: 'user',
          content: query,
        },
      ];

      // Generate answer
      const answer = await this.llmService.chat(messages, model);

      this.logger.info('Successfully generated RAG answer');
      return answer;
    } catch (error) {
      this.logger.error(`Answer generation failed: ${error}`);
      throw error;
    }
  }

  /**
   * Build a formatted context string from chunks
   */
  private buildContextString(chunks: DocumentChunk[]): string {
    if (chunks.length === 0) {
      return 'No relevant context found.';
    }

    const contextParts = chunks.map((chunk, index) => {
      return `[${index + 1}] Entity: ${chunk.entityName} (Source: ${chunk.metadata.source})
${chunk.content}`;
    });

    return contextParts.join('\n\n---\n\n');
  }

  /**
   * Get indexing status
   */
  getIndexingStatus(): {
    inProgress: boolean;
    lastIndexTime: Date | null;
    vectorCount: number;
  } {
    return {
      inProgress: this.indexingInProgress,
      lastIndexTime: this.lastIndexTime,
      vectorCount: 0, // This would need to be fetched from vectorStore
    };
  }
}
