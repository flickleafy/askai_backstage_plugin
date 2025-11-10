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
 * Express router for the Ask AI backend plugin
 * Handles HTTP requests and orchestrates services
 * 
 * @packageDocumentation
 */

import express, { Request, Response, Router } from 'express';
import { Logger } from '@backstage/backend-common';
import { Config } from '@backstage/config';
import { DiscoveryApi } from '@backstage/core-plugin-api';
import {
  ConfigService,
  OllamaLLMService,
  VectorStoreFactory,
  DocumentProcessor,
  CatalogCollector,
  TechDocsCollector,
  RAGService,
} from './services';
import { AskQuestionRequest, AskQuestionResponse } from './models';

/**
 * Plugin environment interface
 */
export interface PluginEnvironment {
  logger: Logger;
  config: Config;
  discovery: DiscoveryApi;
}

/**
 * Create and configure the Ask AI router
 * Follows Dependency Injection and Single Responsibility principles
 */
export async function createAskAiRouter(env: PluginEnvironment): Promise<Router> {
  const router = Router();
  router.use(express.json());

  const { logger, config, discovery } = env;

  // Initialize services following Dependency Injection pattern
  const configService = new ConfigService(config);
  const llmService = new OllamaLLMService({ logger, config: configService });
  
  // Create vector store using factory (supports both in-memory and PostgreSQL)
  const vectorStore = await VectorStoreFactory.create(configService, logger);
  
  const documentProcessor = new DocumentProcessor(logger, configService);
  const catalogCollector = new CatalogCollector(logger, discovery);
  const techDocsCollector = new TechDocsCollector(logger, discovery);

  // Initialize RAG service
  const ragService = new RAGService({
    logger,
    config: configService,
    llmService,
    vectorStore,
    documentProcessor,
    catalogCollector,
    techDocsCollector,
  });

  /**
   * POST /api/ask-ai
   * Ask a question with optional RAG
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const {
        prompt,
        model,
        entityId,
        useRAG = true,
        topK,
      } = req.body as AskQuestionRequest;

      if (!prompt || prompt.trim().length === 0) {
        res.status(400).json({ error: 'prompt is required' });
        return;
      }

      logger.info(`Processing question: "${prompt.substring(0, 50)}..."`);

      let answer: string;
      let sources: any[] | undefined;

      if (useRAG) {
        // Use RAG for answer generation
        const appConfig = configService.getConfig();
        const k = topK || appConfig.defaultTopK;

        // Retrieve relevant context
        const context = await ragService.retrieveContext(prompt, k, entityId);

        if (context.length === 0) {
          logger.warn('No relevant context found, falling back to direct LLM');
          answer = await llmService.chat(
            [{ role: 'user', content: prompt }],
            model
          );
        } else {
          // Generate answer with context
          answer = await ragService.generateAnswer(prompt, context, model);
          sources = context;
        }
      } else {
        // Direct LLM without RAG
        answer = await llmService.chat(
          [{ role: 'user', content: prompt }],
          model
        );
      }

      const response: AskQuestionResponse = {
        answer,
        sources,
        model: model || configService.getConfig().defaultModel,
      };

      res.json(response);
    } catch (error) {
      logger.error(`Failed to process question: ${error}`);
      res.status(500).json({
        error: 'Failed to process question',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/ask-ai/index
   * Trigger indexing of all documents
   */
  router.post('/index', async (_req: Request, res: Response) => {
    try {
      logger.info('Triggering document indexing');

      // Run indexing in background
      ragService.indexAllDocuments().catch(error => {
        logger.error(`Background indexing failed: ${error}`);
      });

      res.json({
        message: 'Indexing started',
        status: 'in-progress',
      });
    } catch (error) {
      logger.error(`Failed to start indexing: ${error}`);
      res.status(500).json({
        error: 'Failed to start indexing',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/ask-ai/index/status
   * Get indexing status
   */
  router.get('/index/status', async (_req: Request, res: Response) => {
    try {
      const status = ragService.getIndexingStatus();
      const vectorCount = await vectorStore.count();

      res.json({
        ...status,
        vectorCount,
      });
    } catch (error) {
      logger.error(`Failed to get indexing status: ${error}`);
      res.status(500).json({
        error: 'Failed to get status',
      });
    }
  });

  /**
   * POST /api/ask-ai/index/entity
   * Index a specific entity
   */
  router.post('/index/entity', async (req: Request, res: Response) => {
    try {
      const { entityRef } = req.body as { entityRef?: string };

      if (!entityRef) {
        res.status(400).json({ error: 'entityRef is required' });
        return;
      }

      logger.info(`Indexing entity: ${entityRef}`);
      await ragService.indexEntity(entityRef);

      res.json({
        message: `Entity ${entityRef} indexed successfully`,
      });
    } catch (error) {
      logger.error(`Failed to index entity: ${error}`);
      res.status(500).json({
        error: 'Failed to index entity',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/ask-ai/health
   * Health check endpoint
   */
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      // Check if Ollama is available
      const ollamaHealthy = await (llmService as OllamaLLMService).healthCheck();

      res.json({
        status: ollamaHealthy ? 'healthy' : 'degraded',
        ollama: ollamaHealthy,
        vectorCount: await vectorStore.count(),
        config: {
          defaultModel: configService.getConfig().defaultModel,
          embeddingModel: configService.getConfig().embeddingModel,
          ragEnabled: configService.getConfig().ragEnabled,
        },
      });
    } catch (error) {
      logger.error(`Health check failed: ${error}`);
      res.status(500).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Auto-index on startup if enabled
  const appConfig = configService.getConfig();
  if (appConfig.ragEnabled) {
    logger.info('RAG enabled - scheduling initial indexing');
    // Delay initial indexing to allow Backstage to fully start
    setTimeout(() => {
      ragService.indexAllDocuments().catch(error => {
        logger.error(`Initial indexing failed: ${error}`);
      });
    }, 10000); // 10 second delay
  }

  return router;
}
