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

import type { Logger } from 'winston';
import { IRAGStrategy, RAGAnswer, RAGContext } from '../types';
import {
  ILLMService,
  IVectorStore,
  IDocumentProcessor,
  ICatalogCollector,
  ITechDocsCollector,
  IConfigService,
  RAGServiceDependencies,
} from '../../interfaces';
import { DocumentChunk, EmbeddingVector } from '../../models';

/**
 * Default RAG strategy mirroring the previous monolithic implementation.
 */
export class SimpleRAGStrategy implements IRAGStrategy {
  readonly name = 'simple';

  private readonly logger: Logger;
  private readonly llmService: ILLMService;
  private readonly vectorStore: IVectorStore;
  private readonly documentProcessor: IDocumentProcessor;
  private readonly catalogCollector: ICatalogCollector;
  private readonly techDocsCollector: ITechDocsCollector;
  private readonly configService: IConfigService;

  constructor(dependencies: RAGServiceDependencies) {
    this.logger = dependencies.logger;
    this.llmService = dependencies.llmService;
    this.vectorStore = dependencies.vectorStore;
    this.documentProcessor = dependencies.documentProcessor;
    this.catalogCollector = dependencies.catalogCollector;
    this.techDocsCollector = dependencies.techDocsCollector;
    this.configService = dependencies.config;
  }

  async indexAll(): Promise<void> {
    this.logger.info('[SimpleRAG] Starting full document indexing');
    // Clear existing vectors
    await this.vectorStore.clear();

    // Fetch all entities
    const entities = await this.catalogCollector.fetchAllEntities();
    this.logger.info(`[SimpleRAG] Indexing ${entities.length} entities`);

    // Process entities in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);
      await Promise.all(batch.map(entity => this.indexEntityInternal(entity)));
      this.logger.info(`Indexed ${Math.min(i + batchSize, entities.length)}/${entities.length} entities`);
    }

    const vectorCount = await this.vectorStore.count();
    this.logger.info(`[SimpleRAG] Indexing complete. Total vectors stored: ${vectorCount}`);
  }

  async indexEntity(entityRef: string): Promise<void> {
    this.logger.info(`[SimpleRAG] Indexing entity: ${entityRef}`);
    const entity = await this.catalogCollector.fetchEntity(entityRef);
    await this.indexEntityInternal(entity);
  }

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
        this.logger.debug(`[SimpleRAG] No chunks created for ${entityName}`);
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
      this.logger.debug(`[SimpleRAG] Indexed ${allChunks.length} chunks for ${entityName}`);
    } catch (error) {
      this.logger.error(`[SimpleRAG] Failed to index ${entityName}: ${error}`);
      // Continue with other entities instead of failing completely
    }
  }

  async retrieve(context: RAGContext): Promise<DocumentChunk[]> {
    const topK = context.topK ?? this.configService.getConfig().defaultTopK;
    this.logger.info(`[SimpleRAG] Retrieving context (topK=${topK})`);

    // Generate query embedding
    const queryEmbeddings = await this.llmService.generateEmbeddings([context.query]);
    const queryVector = queryEmbeddings[0];

    // Search vector store
    const results = await this.vectorStore.search(queryVector, topK, context.entityId);

    // Extract document chunks
    const chunks = results.map(result => result.documentChunk);
    this.logger.info(`[SimpleRAG] Retrieved ${chunks.length} relevant chunks`);
    return chunks;
  }

  async answer(context: RAGContext): Promise<RAGAnswer> {
    const resolvedContext = context.context ?? (await this.retrieve(context));
    const model = context.model || this.configService.getConfig().defaultModel;

    if (resolvedContext.length === 0) {
      this.logger.warn('[SimpleRAG] No relevant context found, falling back to direct LLM');
      const fallback = await this.llmService.chat(
        [{ role: 'user', content: context.query }],
        model
      );
      return {
        answer: fallback,
        sources: [],
        model,
      };
    }

    // Build context string
    const contextString = this.buildContextString(resolvedContext);
    
    // Create messages for chat
    const messages = [
      {
        role: 'system' as const,
        content: `You are a helpful assistant that answers questions about Backstage projects and services. 
Use the following context to answer the user's question. If the answer cannot be found in the context, say so.
Always cite which service or entity you're referring to when providing information.

Context:
${contextString}`,
      },
      {
        role: 'user' as const,
        content: context.query,
      },
    ];

    const answer = await this.llmService.chat(messages, model);
    this.logger.info('[SimpleRAG] Successfully generated answer');

    return {
      answer,
      sources: resolvedContext,
      model,
    };
  }

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
}
