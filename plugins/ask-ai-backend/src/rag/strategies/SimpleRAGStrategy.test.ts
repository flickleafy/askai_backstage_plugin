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

import { describe, expect, it, jest } from '@jest/globals';
import type { Logger } from 'winston';
import { SimpleRAGStrategy } from './SimpleRAGStrategy';
import type { DocumentChunk } from '../../models';
import type {
  RAGServiceDependencies,
  IVectorStore,
  ILLMService,
  IConfigService,
  IDocumentProcessor,
  ICatalogCollector,
  ITechDocsCollector,
} from '../../interfaces';

describe('SimpleRAGStrategy', () => {
  const buildLogger = () => ({
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
    exceptions: undefined as any,
    profilers: undefined as any,
    exitOnError: false,
    format: undefined as any,
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
  });

  const createStrategy = (overrides: Partial<RAGServiceDependencies> = {}) => {
    const vectorStore: jest.Mocked<IVectorStore> = {
      store: jest.fn<IVectorStore['store']>(),
      storeBatch: jest.fn<IVectorStore['storeBatch']>(),
      clear: jest.fn<IVectorStore['clear']>(),
      count: jest.fn<IVectorStore['count']>().mockResolvedValue(0),
      search: jest.fn<IVectorStore['search']>().mockResolvedValue([]),
    };

    const llmService: jest.Mocked<ILLMService> = {
      chat: jest.fn<ILLMService['chat']>().mockResolvedValue('fallback'),
      generateEmbeddings: jest.fn<ILLMService['generateEmbeddings']>().mockResolvedValue([[0.1, 0.2, 0.3]]),
    };

    const config: jest.Mocked<IConfigService> = {
      getConfig: jest.fn<IConfigService['getConfig']>().mockReturnValue({
        defaultTopK: 5,
        defaultModel: 'llama3.2',
        embeddingModel: 'all-minilm',
        ollamaBaseUrl: 'http://localhost:11434',
        ragEnabled: true,
        ragStrategy: 'simple',
        chunkSize: 512,
        chunkOverlap: 50,
        vectorStore: { type: 'memory' },
      }),
      get: jest.fn<any>((key: string, defaultValue?: any) => defaultValue),
    };

    const documentProcessor: jest.Mocked<IDocumentProcessor> = {
      chunkDocument: jest.fn<IDocumentProcessor['chunkDocument']>(),
      extractText: jest.fn<IDocumentProcessor['extractText']>(),
    };

    const catalogCollector: jest.Mocked<ICatalogCollector> = {
      fetchAllEntities: jest.fn<ICatalogCollector['fetchAllEntities']>().mockResolvedValue([]),
      fetchEntity: jest.fn<ICatalogCollector['fetchEntity']>(),
      extractEntityContent: jest.fn<ICatalogCollector['extractEntityContent']>(),
      getEntityRef: jest.fn<ICatalogCollector['getEntityRef']>(),
    };

    const techDocsCollector: jest.Mocked<ITechDocsCollector> = {
      hasDocumentation: jest.fn<ITechDocsCollector['hasDocumentation']>(),
      fetchDocumentation: jest.fn<ITechDocsCollector['fetchDocumentation']>(),
    };

    const dependencies: RAGServiceDependencies = {
      logger: overrides.logger ?? (buildLogger() as unknown as Logger),
      config: overrides.config ?? config,
      llmService: overrides.llmService ?? llmService,
      vectorStore: overrides.vectorStore ?? vectorStore,
      documentProcessor: overrides.documentProcessor ?? documentProcessor,
      catalogCollector: overrides.catalogCollector ?? catalogCollector,
      techDocsCollector: overrides.techDocsCollector ?? techDocsCollector,
    };

    return {
      strategy: new SimpleRAGStrategy(dependencies),
      vectorStore,
      llmService,
    };
  };

  it('retrieves context using the vector store', async () => {
    const chunk: DocumentChunk = {
      id: 'chunk-1',
      entityId: 'component:default/sample',
      entityName: 'sample',
      content: 'example text',
      metadata: { source: 'catalog', chunkIndex: 0, totalChunks: 1 },
    };

    const { strategy, vectorStore, llmService } = createStrategy();
    vectorStore.search.mockResolvedValue([{ documentChunk: chunk, similarity: 0.9 }]);
    llmService.generateEmbeddings.mockResolvedValue([[0.5, 0.1, 0.4]]);

    const result = await strategy.retrieve({ query: 'How to deploy?', topK: 1 });

    expect(llmService.generateEmbeddings).toHaveBeenCalledWith(['How to deploy?']);
    expect(vectorStore.search).toHaveBeenCalledWith([0.5, 0.1, 0.4], 1, undefined);
    expect(result).toEqual([chunk]);
  });

  it('falls back to direct LLM when no context exists', async () => {
    const { strategy, llmService } = createStrategy();
    llmService.chat.mockResolvedValue('direct answer');

    const response = await strategy.answer({ query: 'Explain zero downtime?', topK: 2 });

    expect(llmService.chat).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Explain zero downtime?' }],
      'llama3.2'
    );
    expect(response).toEqual({ answer: 'direct answer', sources: [], model: 'llama3.2' });
  });

  it('generates an answer with provided context', async () => {
    const chunk: DocumentChunk = {
      id: 'chunk-2',
      entityId: 'component:default/api',
      entityName: 'api',
      content: 'API handles requests',
      metadata: { source: 'techdocs', chunkIndex: 0, totalChunks: 1 },
    };

    const { strategy, llmService } = createStrategy();
    llmService.chat.mockResolvedValue('grounded answer');

    const response = await strategy.answer({
      query: 'What does the API do?',
      topK: 1,
      context: [chunk],
      model: 'custom-model',
    });

    expect(llmService.chat).toHaveBeenCalledWith(expect.any(Array), 'custom-model');
    expect(response.answer).toBe('grounded answer');
    expect(response.sources).toEqual([chunk]);
  });
});
