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

import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RAGService } from './RAGService';
import type { IRAGStrategy } from '../rag/types';
import { RAGStrategyFactory } from '../rag';
import type {
  RAGServiceDependencies,
  IConfigService,
  IVectorStore,
  ILLMService,
  IDocumentProcessor,
  ICatalogCollector,
  ITechDocsCollector,
} from '../interfaces';
import type { AskAiConfig } from '../models';

describe('RAGService', () => {
  const strategyFactorySpy = jest.spyOn(RAGStrategyFactory, 'create');
  const mockStrategy = (): jest.Mocked<IRAGStrategy> => ({
    name: 'mock',
    indexAll: jest.fn(async () => undefined),
    indexEntity: jest.fn(async () => undefined),
    retrieve: jest.fn(async () => []),
    answer: jest.fn(async () => ({ answer: 'ok', sources: [], model: 'llama3.2' })),
  }) as jest.Mocked<IRAGStrategy>;

  const buildLogger = (): RAGServiceDependencies['logger'] =>
    ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
      log: jest.fn(),
      level: 'info',
      silly: jest.fn(),
      verbose: jest.fn(),
      http: jest.fn(),
      transports: [],
      exceptions: undefined,
      profilers: undefined,
      exitOnError: false,
      format: undefined,
      add: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn(),
      close: jest.fn(),
      emit: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      end: jest.fn(),
      pipe: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      setMaxListeners: jest.fn(),
      getMaxListeners: jest.fn(),
      listeners: jest.fn(),
      rawListeners: jest.fn(),
      listenerCount: jest.fn(),
      prependListener: jest.fn(),
      prependOnceListener: jest.fn(),
      eventNames: jest.fn(),
    } as unknown as RAGServiceDependencies['logger']);

  let strategy: jest.Mocked<IRAGStrategy>;

  beforeEach(() => {
    strategy = mockStrategy();
    strategyFactorySpy.mockReturnValue(strategy);
  });

  afterEach(() => {
    strategyFactorySpy.mockReset();
  });

  afterAll(() => {
    strategyFactorySpy.mockRestore();
  });

  const buildService = () => {
    const baseConfig: AskAiConfig = {
      defaultModel: 'llama3.2',
      embeddingModel: 'all-minilm',
      ollamaBaseUrl: 'http://localhost',
      ragEnabled: true,
      ragStrategy: 'simple',
      defaultTopK: 5,
      chunkSize: 512,
      chunkOverlap: 50,
      vectorStore: { type: 'memory' },
    };

    const config: IConfigService = {
      getConfig: () => baseConfig,
      get: <T>(_: string, defaultValue?: T) => defaultValue as T,
    };

    const vectorStore: IVectorStore = {
      store: async () => undefined,
      storeBatch: async () => undefined,
      search: async () => [],
      clear: async () => undefined,
      count: async () => 0,
    };

    const llmService: ILLMService = {
      chat: async () => 'ok',
      generateEmbeddings: async () => [],
    };

    const documentProcessor: IDocumentProcessor = {
      chunkDocument: () => [],
      extractText: () => '',
    };

    const catalogCollector: ICatalogCollector = {
      fetchAllEntities: async () => [],
      fetchEntity: async () => ({}),
      extractEntityContent: () => '',
      getEntityRef: () => 'component:default/demo',
    };

    const techDocsCollector: ITechDocsCollector = {
      fetchDocumentation: async () => null,
      hasDocumentation: async () => false,
    };

    const dependencies: RAGServiceDependencies = {
      logger: buildLogger(),
      config,
      llmService,
      vectorStore,
      documentProcessor,
      catalogCollector,
      techDocsCollector,
    };

    return new RAGService(dependencies);
  };

  it('delegates answerQuestion calls to the active strategy', async () => {
    const service = buildService();
    const response = await service.answerQuestion('What is the SLA?', { topK: 7, entityId: 'component:default/api' });

    expect(strategy.answer).toHaveBeenCalledWith({
      query: 'What is the SLA?',
      topK: 7,
      entityId: 'component:default/api',
      model: undefined,
      context: undefined,
    });
    expect(response.answer).toEqual('ok');
  });
});
