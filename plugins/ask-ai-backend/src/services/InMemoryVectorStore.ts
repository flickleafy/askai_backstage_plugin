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
 * In-memory vector store implementation
 * Provides vector storage and similarity search capabilities
 * 
 * @packageDocumentation
 */

import { IVectorStore } from '../interfaces';
import { EmbeddingVector, SearchResult } from '../models';
import type { Logger } from 'winston';

/**
 * In-memory vector store using cosine similarity
 * Follows Single Responsibility Principle
 * 
 * Note: For production use, replace with a persistent vector database
 * like PostgreSQL with pgvector, Pinecone, or Weaviate
 */
export class InMemoryVectorStore implements IVectorStore {
  private readonly logger: Logger;
  private readonly vectors: Map<string, EmbeddingVector> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async store(embedding: EmbeddingVector): Promise<void> {
    this.vectors.set(embedding.id, embedding);
    this.logger.debug(`Stored embedding: ${embedding.id}`);
  }

  async storeBatch(embeddings: EmbeddingVector[]): Promise<void> {
    embeddings.forEach(embedding => {
      this.vectors.set(embedding.id, embedding);
    });
    this.logger.info(`Stored batch of ${embeddings.length} embeddings`);
  }

  async search(queryVector: number[], topK: number, entityId?: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Filter by entity if specified
    const vectorsToSearch = entityId
      ? Array.from(this.vectors.values()).filter(v => v.documentChunk.entityId === entityId)
      : Array.from(this.vectors.values());

    // Calculate cosine similarity for each vector
    for (const embedding of vectorsToSearch) {
      const similarity = this.cosineSimilarity(queryVector, embedding.vector);
      results.push({
        documentChunk: embedding.documentChunk,
        similarity,
      });
    }

    // Sort by similarity (descending) and return top K
    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, topK);

    this.logger.info(
      `Found ${topResults.length} results for query (entityId: ${entityId || 'all'})`
    );

    return topResults;
  }

  async clear(): Promise<void> {
    const count = this.vectors.size;
    this.vectors.clear();
    this.logger.info(`Cleared ${count} vectors from store`);
  }

  async count(): Promise<number> {
    return this.vectors.size;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Get statistics about the vector store
   */
  getStats(): { totalVectors: number; entitiesIndexed: Set<string> } {
    const entitiesIndexed = new Set<string>();
    
    for (const vector of this.vectors.values()) {
      entitiesIndexed.add(vector.documentChunk.entityId);
    }

    return {
      totalVectors: this.vectors.size,
      entitiesIndexed,
    };
  }
}
