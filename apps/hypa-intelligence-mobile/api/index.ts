import axios, {
  type AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios';
import Constants from 'expo-constants';
import { ANALYTICS, analyticsHeaders } from '@hypa/config/analytics';
import { analytics } from '@/lib/analytics';
import {
  getSettingsJson,
  parseKeyboardSettings,
  saveKeyboardSettings,
} from '@/lib/keyboard-settings';

export const API_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.hypaintelligence.com';

const attribution = analyticsHeaders('hypa-intelligence-mobile', Constants.expoConfig?.version);

const API_LOG_PREFIX = '[HypaKeyboard][API]';

function sanitizeForLog(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.length > 240) {
      return `${value.slice(0, 120)}…(${value.length} chars)`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeForLog);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('token') || lowerKey === 'authorization') {
          return [key, '[redacted]'];
        }
        if (lowerKey === 'audio' || lowerKey.includes('audio_b64')) {
          return [
            key,
            typeof item === 'string' ? `[base64 ${item.length} chars]` : sanitizeForLog(item),
          ];
        }
        return [key, sanitizeForLog(item)];
      })
    );
  }

  return value;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = axios.create({
  baseURL: API_URL,
  timeout: 0,
  headers: {
    ...attribution,
    'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/json; charset=utf-8',
  },
});

api.interceptors.request.use((config) => {
  const { token } = parseKeyboardSettings(getSettingsJson());

  if (!config.headers) {
    config.headers = new AxiosHeaders();
  }

  if (token.trim()) {
    config.headers.set('Authorization', `Bearer ${token.trim()}`);
  } else {
    config.headers.delete('Authorization');

    const anonId = analytics.anonId();

    if (anonId) config.headers.set(ANALYTICS.headers.anonId, anonId);
  }

  console.log(`${API_LOG_PREFIX} request`, {
    method: config.method?.toUpperCase() ?? 'GET',
    url: `${config.baseURL ?? ''}${config.url ?? ''}`,
    params: sanitizeForLog(config.params),
    data: sanitizeForLog(config.data),
  });

  return config;
});

api.interceptors.response.use(
  (response) => {
    console.log(`${API_LOG_PREFIX} response`, {
      status: response.status,
      url: response.config.url,
      data: sanitizeForLog(response.data),
    });
    return response;
  },
  async (error: AxiosError<{ message?: string; error?: string }>) => {
    const status = error.response?.status ?? 0;
    const message =
      error.code === 'ECONNABORTED'
        ? 'The request took too long. Please try again.'
        : (error.response?.data?.message ?? error.message ?? 'Request failed');

    if (status === 401 && error.config?.url?.includes('/profile/me')) {
      console.log('[TOKEN] RMV');
      const current = parseKeyboardSettings(getSettingsJson());
      await saveKeyboardSettings({ ...current, token: '' });
    }

    console.log(`${API_LOG_PREFIX} error`, {
      status,
      url: error.config?.url,
      message,
      data: sanitizeForLog(error.response?.data),
    });

    return Promise.reject(new ApiError(message, status));
  }
);

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response: AxiosResponse<T> = await api.get(url, config);
  return response.data;
}

export async function apiPost<TResponse, TPayload = unknown>(
  url: string,
  payload?: TPayload,
  config?: AxiosRequestConfig<TPayload>
): Promise<TResponse> {
  const response: AxiosResponse<TResponse> = await api.post(url, payload, config);
  return response.data;
}

export async function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response: AxiosResponse<T> = await api.delete(url, config);
  return response.data;
}
