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
 * LLM Service implementation for Ollama integration
 * Handles all interactions with the Ollama API
 * 
 * @packageDocumentation
 */

import fetch from 'node-fetch';
import { ILLMService, IConfigService, ServiceDependencies } from '../interfaces';
import { ChatMessage, OllamaChatResponse, OllamaEmbedResponse } from '../models';
import { Logger } from '@backstage/backend-common';

/**
 * Service for interacting with Ollama LLM
 * Follows Single Responsibility and Dependency Inversion principles
 */
export class OllamaLLMService implements ILLMService {
  private readonly logger: Logger;
  private readonly configService: IConfigService;
  private readonly baseUrl: string;

  constructor(dependencies: ServiceDependencies) {
    this.logger = dependencies.logger;
    this.configService = dependencies.config;
    this.baseUrl = this.configService.getConfig().ollamaBaseUrl;
  }

  /**
   * Generate a chat completion using Ollama
   */
  async chat(messages: ChatMessage[], model?: string): Promise<string> {
    const modelName = model || this.configService.getConfig().defaultModel;
    
    this.logger.info(`Generating chat completion with model: ${modelName}`);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const json = (await response.json()) as OllamaChatResponse;
      
      if (!json.message || !json.message.content) {
        throw new Error('Invalid response format from Ollama');
      }

      return json.message.content;
    } catch (error) {
      this.logger.error(`Failed to generate chat completion: ${error}`);
      throw new Error(`Chat completion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate embeddings using Ollama
   */
  async generateEmbeddings(inputs: string[], model?: string): Promise<number[][]> {
    const modelName = model || this.configService.getConfig().embeddingModel;
    
    this.logger.info(`Generating embeddings for ${inputs.length} inputs with model: ${modelName}`);

    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          input: inputs,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const json = (await response.json()) as OllamaEmbedResponse;
      
      if (!json.embeddings || !Array.isArray(json.embeddings)) {
        throw new Error('Invalid embeddings response format from Ollama');
      }

      this.logger.info(`Successfully generated ${json.embeddings.length} embeddings`);
      return json.embeddings;
    } catch (error) {
      this.logger.error(`Failed to generate embeddings: ${error}`);
      throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Health check for Ollama service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch (error) {
      this.logger.error(`Ollama health check failed: ${error}`);
      return false;
    }
  }
}
