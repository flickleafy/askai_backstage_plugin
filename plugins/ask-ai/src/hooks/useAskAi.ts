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
 * Custom hooks for Ask AI functionality
 * Provides reusable state management for AI interactions
 * 
 * @packageDocumentation
 */

import { useState, useCallback } from 'react';
import { AskAiApi, AskQuestionRequest, AskQuestionResponse } from '../api';

/**
 * State for ask question hook
 */
export interface UseAskQuestionState {
  loading: boolean;
  error: string | null;
  response: AskQuestionResponse | null;
  askQuestion: (request: AskQuestionRequest) => Promise<void>;
  reset: () => void;
}

/**
 * Hook for asking questions to the AI
 */
export function useAskQuestion(): UseAskQuestionState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AskQuestionResponse | null>(null);

  const api = new AskAiApi();

  const askQuestion = useCallback(
    async (request: AskQuestionRequest) => {
      setLoading(true);
      setError(null);
      setResponse(null);

      try {
        const result = await api.askQuestion(request);
        setResponse(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get answer');
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setResponse(null);
  }, []);

  return {
    loading,
    error,
    response,
    askQuestion,
    reset,
  };
}

/**
 * State for indexing hook
 */
export interface UseIndexingState {
  loading: boolean;
  error: string | null;
  success: boolean;
  triggerIndexing: () => Promise<void>;
}

/**
 * Hook for triggering document indexing
 */
export function useIndexing(): UseIndexingState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const api = new AskAiApi();

  const triggerIndexing = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await api.triggerIndexing();
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger indexing');
    } finally {
      setLoading(false);
    }
  }, [api]);

  return {
    loading,
    error,
    success,
    triggerIndexing,
  };
}
