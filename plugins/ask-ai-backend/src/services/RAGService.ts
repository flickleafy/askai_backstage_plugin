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

import type { Logger } from 'winston';
import {
  IRAGService,
  RAGServiceDependencies,
  IConfigService,
  IVectorStore,
} from '../interfaces';
import { DocumentChunk } from '../models';
import { RAGStrategyFactory } from '../rag';
import { IRAGStrategy, RAGAnswer, RAGQuestionOptions } from '../rag/types';

/**
 * Service that orchestrates the RAG pipeline
 * Follows Single Responsibility and Open/Closed principles
 */
export class RAGService implements IRAGService {
  private readonly logger: Logger;
  private readonly vectorStore: IVectorStore;
  private readonly configService: IConfigService;
  private readonly strategy: IRAGStrategy;

  private indexingInProgress = false;
  private lastIndexTime: Date | null = null;

  constructor(dependencies: RAGServiceDependencies) {
    this.logger = dependencies.logger;
    this.vectorStore = dependencies.vectorStore;
    this.configService = dependencies.config;
    this.strategy = RAGStrategyFactory.create(dependencies);
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

      await this.strategy.indexAll();
      this.lastIndexTime = new Date();
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
      await this.strategy.indexEntity(entityRef);
    } catch (error) {
      this.logger.error(`Failed to index entity ${entityRef}: ${error}`);
      throw error;
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
      return await this.strategy.retrieve({ query, topK, entityId });
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
      const response = await this.strategy.answer({
        query,
        model,
        context,
        topK: context.length || this.configService.getConfig().defaultTopK,
      });
      return response.answer;
    } catch (error) {
      this.logger.error(`Answer generation failed: ${error}`);
      throw error;
    }
  }

  async answerQuestion(query: string, options?: RAGQuestionOptions): Promise<RAGAnswer> {
    const topK = options?.topK ?? this.configService.getConfig().defaultTopK;
    return this.strategy.answer({
      query,
      topK,
      entityId: options?.entityId,
      model: options?.model,
      context: options?.context,
    });
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
