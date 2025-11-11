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
 * RAG domain types and interfaces
 *
 * @packageDocumentation
 */

import { DocumentChunk } from '../models';

/**
 * Options describing a RAG question request.
 */
export interface RAGQuestionOptions {
  topK?: number;
  entityId?: string;
  model?: string;
  context?: DocumentChunk[];
}

/**
 * Context object passed between strategy steps.
 */
export interface RAGContext extends RAGQuestionOptions {
  query: string;
}

/**
 * Response returned by a strategy when answering a question.
 */
export interface RAGAnswer {
  answer: string;
  sources: DocumentChunk[];
  model?: string;
}

/**
 * Contract implemented by all RAG strategies.
 */
export interface IRAGStrategy {
  readonly name: string;

  /**
   * Index every available entity and its documentation.
   */
  indexAll(): Promise<void>;

  /**
   * Index a single entity by reference.
   */
  indexEntity(entityRef: string): Promise<void>;

  /**
   * Retrieve context for the provided query.
   */
  retrieve(context: RAGContext): Promise<DocumentChunk[]>;

  /**
   * Produce an answer (and supporting sources) for the provided query.
   */
  answer(context: RAGContext): Promise<RAGAnswer>;
}
