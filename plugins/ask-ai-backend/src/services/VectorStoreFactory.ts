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
 * Factory for creating vector store implementations
 * Implements Factory Pattern for vector store selection
 * 
 * @packageDocumentation
 */

import type { Logger } from 'winston';
import { IVectorStore } from '../interfaces';
import { ConfigService } from './ConfigService';
import { InMemoryVectorStore } from './InMemoryVectorStore';
import { PgVectorStore } from './PgVectorStore';

/**
 * Factory class for creating vector store instances
 * Follows Factory Pattern and Open/Closed Principle
 * 
 * Usage:
 * ```typescript
 * const vectorStore = await VectorStoreFactory.create(configService, logger);
 * ```
 */
export class VectorStoreFactory {
  /**
   * Create a vector store instance based on configuration
   * 
   * @param config - Configuration service
   * @param logger - Logger instance
   * @returns Initialized vector store implementation
   */
  static async create(
    config: ConfigService,
    logger: Logger
  ): Promise<IVectorStore> {
    const vectorStoreType = config.getVectorStoreType();
    
    logger.info(`Creating vector store: ${vectorStoreType}`);
    
    switch (vectorStoreType) {
      case 'postgresql': {
        const pgConfig = config.getPostgresConfig();
        const store = new PgVectorStore(logger, pgConfig);
        
        try {
          await store.initialize();
          logger.info('PostgreSQL vector store initialized successfully');
          return store;
        } catch (error) {
          logger.error('Failed to initialize PostgreSQL vector store', error);
          logger.warn('Falling back to in-memory vector store');
          return new InMemoryVectorStore(logger);
        }
      }
      
      case 'memory':
      default: {
        logger.info('Using in-memory vector store');
        return new InMemoryVectorStore(logger);
      }
    }
  }

  /**
   * Create vector store with strict mode (no fallback)
   * Throws error if the configured store cannot be initialized
   * 
   * @param config - Configuration service
   * @param logger - Logger instance
   * @returns Initialized vector store implementation
   * @throws Error if initialization fails
   */
  static async createStrict(
    config: ConfigService,
    logger: Logger
  ): Promise<IVectorStore> {
    const vectorStoreType = config.getVectorStoreType();
    
    logger.info(`Creating vector store (strict mode): ${vectorStoreType}`);
    
    switch (vectorStoreType) {
      case 'postgresql': {
        const pgConfig = config.getPostgresConfig();
        const store = new PgVectorStore(logger, pgConfig);
        await store.initialize();
        logger.info('PostgreSQL vector store initialized successfully');
        return store;
      }
      
      case 'memory':
      default: {
        logger.info('Using in-memory vector store');
        return new InMemoryVectorStore(logger);
      }
    }
  }

  /**
   * Validate vector store configuration
   * Useful for health checks and startup validation
   * 
   * @param config - Configuration service
   * @returns true if configuration is valid
   */
  static validate(config: ConfigService): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const vectorStoreType = config.getVectorStoreType();
    
    if (vectorStoreType === 'postgresql') {
      try {
        const pgConfig = config.getPostgresConfig();
        
        if (!pgConfig.host) {
          errors.push('PostgreSQL host is required');
        }
        if (!pgConfig.database) {
          errors.push('PostgreSQL database is required');
        }
        if (!pgConfig.user) {
          errors.push('PostgreSQL user is required');
        }
        if (!pgConfig.password) {
          errors.push('PostgreSQL password is required');
        }
        if (pgConfig.port && (pgConfig.port < 1 || pgConfig.port > 65535)) {
          errors.push('PostgreSQL port must be between 1 and 65535');
        }
      } catch (error) {
        errors.push(`PostgreSQL configuration error: ${error}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
