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
 * Configuration service implementation
 * Manages plugin configuration with type-safe access
 * 
 * @packageDocumentation
 */

import { Config } from '@backstage/config';
import { IConfigService } from '../interfaces';
import { AskAiConfig } from '../models';

/**
 * Configuration service that wraps Backstage Config
 * Follows Single Responsibility Principle
 */
export class ConfigService implements IConfigService {
  private readonly config: Config;
  private readonly cachedConfig: AskAiConfig;

  constructor(config: Config) {
    this.config = config;
    this.cachedConfig = this.loadConfig();
  }

  /**
   * Load and validate configuration
   */
  private loadConfig(): AskAiConfig {
    return {
      defaultModel: this.config.getOptionalString('askAi.defaultModel') || 'llama3.2',
      embeddingModel: this.config.getOptionalString('askAi.embeddingModel') || 'all-minilm',
      ollamaBaseUrl: this.config.getOptionalString('askAi.ollamaBaseUrl') || 'http://localhost:11434',
      ragEnabled: this.config.getOptionalBoolean('askAi.ragEnabled') ?? true,
      ragStrategy: this.config.getOptionalString('askAi.rag.strategy') || 'simple',
      defaultTopK: this.config.getOptionalNumber('askAi.defaultTopK') || 5,
      chunkSize: this.config.getOptionalNumber('askAi.chunkSize') || 512,
      chunkOverlap: this.config.getOptionalNumber('askAi.chunkOverlap') || 50,
      vectorStore: this.loadVectorStoreConfig(),
    };
  }

  /**
   * Load vector store configuration
   */
  private loadVectorStoreConfig(): AskAiConfig['vectorStore'] {
    const type = this.config.getOptionalString('askAi.vectorStore.type') as 'memory' | 'postgresql' | undefined;
    
    if (type === 'postgresql') {
      return {
        type: 'postgresql',
        postgresql: this.loadPostgresConfig(),
      };
    }
    
    // Default to in-memory store
    return {
      type: 'memory',
    };
  }

  /**
   * Load PostgreSQL configuration with validation
   */
  private loadPostgresConfig(): AskAiConfig['vectorStore']['postgresql'] {
    const host = this.config.getOptionalString('askAi.vectorStore.postgresql.host') || 'localhost';
    const port = this.config.getOptionalNumber('askAi.vectorStore.postgresql.port') || 5432;
    const database = this.config.getOptionalString('askAi.vectorStore.postgresql.database') || 'backstage_vectors';
    const user = this.config.getOptionalString('askAi.vectorStore.postgresql.user') || 'backstage';
    const password = this.config.getOptionalString('askAi.vectorStore.postgresql.password') || '';
    const ssl = this.config.getOptionalBoolean('askAi.vectorStore.postgresql.ssl') ?? false;
    const maxConnections = this.config.getOptionalNumber('askAi.vectorStore.postgresql.maxConnections') || 10;
    const idleTimeoutMillis = this.config.getOptionalNumber('askAi.vectorStore.postgresql.idleTimeoutMillis') || 30000;
    const connectionTimeoutMillis = this.config.getOptionalNumber('askAi.vectorStore.postgresql.connectionTimeoutMillis') || 5000;

    // Validation
    if (!password) {
      throw new Error('PostgreSQL password is required when using postgresql vector store');
    }

    return {
      host,
      port,
      database,
      user,
      password,
      ssl,
      maxConnections,
      idleTimeoutMillis,
      connectionTimeoutMillis,
    };
  }

  getConfig(): AskAiConfig {
    return this.cachedConfig;
  }

  get<T>(key: string, defaultValue?: T): T {
    const value = this.config.getOptional(key);
    return (value as T) ?? defaultValue!;
  }

  /**
   * Get vector store type
   */
  getVectorStoreType(): 'memory' | 'postgresql' {
    return this.cachedConfig.vectorStore.type;
  }

  /**
   * Get PostgreSQL configuration
   * Throws error if not configured
   */
  getPostgresConfig(): NonNullable<AskAiConfig['vectorStore']['postgresql']> {
    if (this.cachedConfig.vectorStore.type !== 'postgresql' || !this.cachedConfig.vectorStore.postgresql) {
      throw new Error('PostgreSQL vector store is not configured');
    }
    return this.cachedConfig.vectorStore.postgresql;
  }

  /**
   * Check if PostgreSQL vector store is enabled
   */
  isPostgresVectorStoreEnabled(): boolean {
    return this.cachedConfig.vectorStore.type === 'postgresql';
  }
}
