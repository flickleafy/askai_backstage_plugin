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
 * Document processor for chunking and text extraction
 * Handles document preparation for embedding
 * 
 * @packageDocumentation
 */

import { IDocumentProcessor, IConfigService } from '../interfaces';
import { DocumentChunk } from '../models';
import { Logger } from '@backstage/backend-common';

/**
 * Service for processing documents into chunks
 * Follows Single Responsibility Principle
 */
export class DocumentProcessor implements IDocumentProcessor {
  private readonly logger: Logger;
  private readonly configService: IConfigService;

  constructor(logger: Logger, configService: IConfigService) {
    this.logger = logger;
    this.configService = configService;
  }

  /**
   * Chunk a document into smaller pieces with overlap
   */
  chunkDocument(
    content: string,
    entityId: string,
    entityName: string,
    source: 'catalog' | 'techdocs'
  ): DocumentChunk[] {
    const config = this.configService.getConfig();
    const chunkSize = config.chunkSize;
    const chunkOverlap = config.chunkOverlap;

    // Clean and normalize the content
    const cleanContent = this.extractText(content);

    if (!cleanContent || cleanContent.trim().length === 0) {
      this.logger.warn(`No content to chunk for entity: ${entityName}`);
      return [];
    }

    const chunks: DocumentChunk[] = [];
    const words = cleanContent.split(/\s+/);
    
    let currentIndex = 0;
    let chunkIndex = 0;

    while (currentIndex < words.length) {
      // Take chunk with specified size
      const chunkWords = words.slice(currentIndex, currentIndex + chunkSize);
      const chunkContent = chunkWords.join(' ');

      if (chunkContent.trim().length > 0) {
        chunks.push({
          id: `${entityId}-${source}-${chunkIndex}`,
          entityId,
          entityName,
          content: chunkContent,
          metadata: {
            source,
            chunkIndex,
            totalChunks: 0, // Will be updated after
          },
        });
        chunkIndex++;
      }

      // Move forward, accounting for overlap
      currentIndex += chunkSize - chunkOverlap;
    }

    // Update total chunks for all chunks
    chunks.forEach(chunk => {
      chunk.metadata.totalChunks = chunks.length;
    });

    this.logger.info(
      `Created ${chunks.length} chunks for ${entityName} (source: ${source})`
    );

    return chunks;
  }

  /**
   * Extract clean text from content
   * Removes markdown, HTML, and excessive whitespace
   */
  extractText(content: string, format?: string): string {
    let text = content;

    // Remove HTML tags
    text = text.replace(/<[^>]*>/g, ' ');

    // Remove markdown links but keep the text
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Remove markdown headers
    text = text.replace(/^#+\s+/gm, '');

    // Remove markdown code blocks
    text = text.replace(/```[\s\S]*?```/g, ' ');
    text = text.replace(/`([^`]+)`/g, '$1');

    // Remove markdown formatting
    text = text.replace(/[*_~]/g, '');

    // Remove URLs
    text = text.replace(/https?:\/\/[^\s]+/g, ' ');

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ');
    text = text.trim();

    return text;
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~1.3 tokens per word
    return Math.ceil(text.split(/\s+/).length * 1.3);
  }

  /**
   * Split text into sentences for better chunking boundaries
   */
  private splitIntoSentences(text: string): string[] {
    return text.split(/[.!?]+\s+/).filter(s => s.trim().length > 0);
  }
}
