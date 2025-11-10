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
 * API client for Ask AI backend
 * Provides a clean interface for communicating with the backend
 * 
 * @packageDocumentation
 */

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
 * Document chunk in the response
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
 * Response from asking a question
 */
export interface AskQuestionResponse {
  answer: string;
  sources?: DocumentChunk[];
  model: string;
}

/**
 * Indexing status response
 */
export interface IndexingStatus {
  inProgress: boolean;
  lastIndexTime: Date | null;
  vectorCount: number;
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  ollama: boolean;
  vectorCount: number;
  config: {
    defaultModel: string;
    embeddingModel: string;
    ragEnabled: boolean;
  };
}

/**
 * API client for Ask AI operations
 * Follows Single Responsibility Principle
 */
export class AskAiApi {
  private readonly baseUrl: string;

  constructor(baseUrl: string = '/api/ask-ai') {
    this.baseUrl = baseUrl;
  }

  /**
   * Ask a question
   */
  async askQuestion(request: AskQuestionRequest): Promise<AskQuestionResponse> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || errorData.error || `Request failed: ${response.status}`
      );
    }

    return response.json();
  }

  /**
   * Trigger document indexing
   */
  async triggerIndexing(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/index`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Indexing request failed: ${response.status}`);
    }
  }

  /**
   * Get indexing status
   */
  async getIndexingStatus(): Promise<IndexingStatus> {
    const response = await fetch(`${this.baseUrl}/index/status`);

    if (!response.ok) {
      throw new Error(`Status request failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Index a specific entity
   */
  async indexEntity(entityRef: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/index/entity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entityRef }),
    });

    if (!response.ok) {
      throw new Error(`Entity indexing failed: ${response.status}`);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`);

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    return response.json();
  }
}
