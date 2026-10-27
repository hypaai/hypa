import { api, apiDelete, apiGet, apiPost } from '@/api';
import { AUTO_DETECT_LANGUAGE, getDictionaryLanguages } from '@/lib/model-languages';
import {
  TRANSLATE_ENDPOINTS,
  buildMtRequest,
  buildMtThinkingRequest,
  mapMtResponse,
  parseTranslation,
  buildTtsRequest,
  unwrapTtsResponse,
  unwrapMtThinkingResponse,
  buildSttRequest,
  unwrapSttResponse,
  createTranslationId,
  type TranslateThinkingAPIParams,
} from '@hypa/translate-core';

export type TranslationHistoryItem = {
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
  originalText: string;
  translatedText: string;
  bookmarked?: boolean;
  liked?: boolean | null;
  timestamp?: string;
};

export type TranslationHistoryResponse = {
  translations: TranslationHistoryItem[];
  meta: {
    nextCursor: string | null;
  };
};

export type WordResult = {
  word: string;
  phonetic?: string;
  partOfSpeech?: string;
  language: string;
  definitions: { text: string; context?: string; partOfSpeech?: string }[];
  usageExamples: { partOfSpeech: string; example: string }[];
  synonyms: string[];
  antonyms: string[];
  exampleSentences: string[];
  translations: Record<string, string>;
  culturalContext?: string;
  funFact?: string;
  markdown?: string;
  content?: string;
  sectionHeaders?: Record<string, string>;
};

export type TranslationResult = {
  translation: string;
  language: string | null;
  id: string;
  thinking?: string | null;
};

export { AUTO_DETECT_LANGUAGE, getDictionaryLanguages };

const INVALID_GENERATED_TEXT_PATTERNS = [/^error:\s*no translation\b/i, /^no translation\b/i];

function assertUsableGeneratedText(value: string, fallbackMessage: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || INVALID_GENERATED_TEXT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw new Error(fallbackMessage);
  }
  return normalized;
}

export async function translateText(params: {
  text: string;
  sourceLang: string;
  targetLang: string;
  translationModel?: string;
  provider?: string;
}): Promise<TranslationResult> {
  console.log('[API] translateText', params);
  const translationId = createTranslationId();
  console.log(
    `[API] Request: ${params.text} (${params.sourceLang} -> ${params.targetLang}) [${translationId}]`
  );
  const requestPayload = buildMtRequest(
    {
      text: params.text,
      sourceLang: params.sourceLang,
      targetLang: params.targetLang,
      llmModel: params.translationModel,
    },
    translationId
  );
  requestPayload.body.provider = (params.provider as any) || requestPayload.body.provider;

  const response = await api.post<string>(
    TRANSLATE_ENDPOINTS.mt,
    requestPayload.body,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json; charset=utf-8',
      },
      responseType: 'text',
      transformResponse: [(data) => data],
    }
  );

  console.log('[API] translateText response', response);
  const parsed = mapMtResponse(response.data, { sourceLang: params.sourceLang }, translationId);
  const { thinkingContent, mainContent } = parseTranslation(parsed.translation);
  const translation = assertUsableGeneratedText(
    mainContent || parsed.translation,
    'No translation returned'
  );

  return {
    translation,
    language: parsed.language,
    id: parsed.id || translationId,
    thinking: thinkingContent,
  };
}

export async function translateThinking(
  params: TranslateThinkingAPIParams
): Promise<string> {
  const request = buildMtThinkingRequest(params);
  const thinking = unwrapMtThinkingResponse(
    await apiPost<unknown>(TRANSLATE_ENDPOINTS.mtThinking, request.body)
  );
  if (!thinking) {
    throw new Error('Thinking process was unavailable for this translation.');
  }
  return thinking;
}

type TranslationRecord = {
  id: string;
  client_request_id?: string | null;
  input_text?: string;
  output_text?: string;
  source_lang?: string | null;
  target_lang?: string | null;
  bookmarked?: boolean;
  liked?: boolean | null;
  correction?: string | null;
  created_at?: string;
};

const mapTranslationRecord = (item: TranslationRecord): TranslationHistoryItem => ({
  id: item.client_request_id || item.id,
  sourceLanguage: item.source_lang || AUTO_DETECT_LANGUAGE,
  targetLanguage: item.target_lang || '',
  originalText: item.input_text || '',
  translatedText: item.output_text || '',
  bookmarked: !!item.bookmarked,
  liked: item.liked ?? null,
  timestamp: item.created_at,
});

export async function getTranslationHistory(params: {
  filter: 'all' | 'bookmarks';
  limit?: number;
  cursor?: string;
}) {
  const response = await apiGet<{
    nextCursor: string | null;
    data: TranslationRecord[];
  }>('/v2/translate/history', {
    params: {
      limit: params.limit ?? 50,
      filter: params.filter,
      cursor: params.cursor,
    },
  });

  return {
    translations: (response.data || []).map(mapTranslationRecord),
    meta: { nextCursor: response.nextCursor },
  };
}

export async function updateTranslationBookmark(params: {
  userId: string;
  translationId: string;
  bookmarked: boolean;
}) {
  void params.userId;
  const response = await apiPost<{ data: TranslationRecord }>(
    `/v2/translate/${params.translationId}/bookmark`,
    { bookmarked: params.bookmarked }
  );
  return mapTranslationRecord(response.data);
}

export async function deleteTranslation(translationId: string) {
  await apiDelete(`/v2/translate/${translationId}`);
  return { message: 'Translation deleted' };
}

export async function updateTranslationFeedback(params: {
  translationId: string;
  liked: boolean | null;
}) {
  const response = await apiPost<{ data: TranslationRecord }>(
    `/v2/translate/${params.translationId}/feedback`,
    { liked: params.liked }
  );
  return mapTranslationRecord(response.data);
}

export async function addTranslationHistoryItem(params: {
  sourceLanguage: string;
  targetLanguage: string;
  originalText: string;
  translatedText: string;
}) {
  return {
    id: '',
    sourceLanguage: params.sourceLanguage,
    targetLanguage: params.targetLanguage,
    originalText: params.originalText,
    translatedText: params.translatedText,
    bookmarked: false,
    liked: null,
    timestamp: new Date().toISOString(),
  };
}

export async function synthesizeSpeech(params: {
  text: string;
  language: string;
  voice: string;
  model: string;
  provider?: string;
}) {
  const requestPayload = buildTtsRequest({
    text: params.text,
    voice: params.voice,
    ttsModel: params.model,
  });
  if (params.provider) {
    requestPayload.provider = params.provider as any;
  }

  const response = await api.post(
    TRANSLATE_ENDPOINTS.tts,
    {
      ...requestPayload,
      language: params.language.toLowerCase(),
    },
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json; charset=utf-8',
      },
    }
  );

  const parsed = unwrapTtsResponse(response.data);
  const audio_b64 = parsed.audio_b64;

  if (!audio_b64) {
    throw new Error('No audio returned');
  }

  return {
    audio_b64,
    audio_type: response.data?.response?.audio_type ?? 'audio/mpeg',
  };
}

export async function speechToText(params: { audio: string; model: string; provider?: string }) {
  const requestPayload = buildSttRequest({
    audioBase64: params.audio,
    asrModel: params.model,
  });
  if (params.provider) {
    requestPayload.provider = params.provider as any;
  }

  const response = await api.post(
    TRANSLATE_ENDPOINTS.stt,
    requestPayload,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json; charset=utf-8',
      },
    }
  );

  const text = unwrapSttResponse(response.data);
  return {
    text: text.trim() ? assertUsableGeneratedText(text, 'No transcript returned') : '',
  };
}
