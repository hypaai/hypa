import { ApiError, api } from '@/api';
import { resolveDictionaryModelName } from '@/lib/dictionary-model';
import { resolveProviderModelForGroup } from '@/lib/model-languages';

export interface DictionarySearchParams {
  word: string;
  language: string;
  cultural_context?: boolean;
  fun_facts?: boolean;
  only_cc_and_ff?: boolean;
  model_name?: string;
  provider?: string;
  seeMore?: boolean;
  output_length?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
}

export type DictionarySection = {
  type?: string;
  text: string;
};

export interface DictionaryResponse {
  word: string;
  definitions?: DictionarySection[];
  syms?: string[];
  antm?: string[];
  usage?: DictionarySection[];
  cultural_context?: DictionarySection[];
  fun_facts?: DictionarySection[];
}

export interface DictionaryHistoryEntry {
  id: string;
  word: string;
  language: string;
  result?: {
    raw?: unknown;
    prompt?: unknown;
    parsed?: DictionaryResponse;
  };
  created_at: string;
  updated_at?: string;
}

export interface PaginatedResponse<T> {
  message?: string;
  data: T[];
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface WordOfTheDay {
  word: string;
  meaning: string;
  language: string;
  voice?: string | null;
  audioUrl?: string | null;
}

let currentSearchAbortController = new AbortController();

export const searchAbortController = {
  get signal() {
    return currentSearchAbortController.signal;
  },
  abort() {
    currentSearchAbortController.abort();
    currentSearchAbortController = new AbortController();
  },
};

function normalizeDictionaryError(
  err: unknown,
  fallback = 'Could not complete dictionary search.'
): Error {
  if (err instanceof ApiError) return new Error(err.message);
  if (err instanceof Error) return err;

  return new Error(fallback);
}

const search = async (
  params: DictionarySearchParams,
  signal?: AbortSignal
): Promise<{ data: DictionaryResponse }> => {
  try {
    const resolved = resolveProviderModelForGroup(
      'AC',
      params.provider,
      resolveDictionaryModelName(params.model_name)
    );
    const requestBody = {
      ...params,
      provider: resolved.provider,
      model_name: resolved.model,
    };

    const data = await api.post<DictionaryResponse>('/dictionary', requestBody, {
      signal: signal ?? searchAbortController.signal,
    });

    return { data: data.data };
  } catch (err) {
    throw normalizeDictionaryError(err);
  }
};

const getHistory = async (params?: {
  page?: number;
  limit?: number;
  query?: string;
}): Promise<PaginatedResponse<DictionaryHistoryEntry>> => {
  try {
    const searchParams = new URLSearchParams();

    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.query) searchParams.set('query', params.query);

    const query = searchParams.toString();
    const data = await api.get<PaginatedResponse<DictionaryHistoryEntry>>(
      `/dictionary/history${query ? `?${query}` : ''}`
    );

    return data.data;
  } catch (err) {
    throw normalizeDictionaryError(err, 'Could not load dictionary history.');
  }
};

const getWordOfTheDay = async (): Promise<WordOfTheDay> => {
  try {
    const response = await api.get<{ data: WordOfTheDay }>('/labs/wotd');

    return response.data.data;
  } catch (err) {
    throw normalizeDictionaryError(err, 'Could not load word of the day.');
  }
};

const deleteHistory = async (id: string): Promise<{ message: string }> => {
  try {
    const data = await api.delete<{ message: string }>(
      `/dictionary/history/${encodeURIComponent(id)}`
    );

    return data.data;
  } catch (err) {
    throw normalizeDictionaryError(err, 'Could not delete dictionary history.');
  }
};

export const dictionary = {
  search,
  getHistory,
  deleteHistory,
  getWordOfTheDay,
};
