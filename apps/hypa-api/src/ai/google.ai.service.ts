import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { Readable } from 'stream';
import { AiUsage, ChatMessage, ChatSyncResult, StreamChunk } from './ai.types';
import { getProviderPrompt } from '@hypa/config/prompts';

export interface GoogleChatOptions {
  temperature?: number;
  top_k?: number;
  top_p?: number;
  max_tokens?: number;
  thinking?: boolean;
  signal?: AbortSignal;
}

interface GoogleDelta {
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
  [key: string]: unknown;
}

interface GoogleResponse {
  choices?: Array<{
    index?: number;
    finish_reason?: string | null;
    delta?: GoogleDelta;
    message?: GoogleDelta & { role?: string };
  }>;
  usage?: AiUsage;
  [key: string]: unknown;
}

function formatGoogleContent(
  content: string,
  reasoning: string,
  includeThinking: boolean,
): string {
  const finalContent = content.trim();
  const reasoningContent = reasoning.trim();

  if (!includeThinking || !reasoningContent) return finalContent;

  return `<think>\n${reasoningContent}\n</think>${
    finalContent ? `\n${finalContent}` : ''
  }`;
}

export function stripGoogleThinkingFromHistory(
  messages: ChatMessage[],
): ChatMessage[] {
  return messages.map((message) => {
    if (message.role !== 'assistant') return message;

    return {
      ...message,
      content: message.content
        .replace(/<\|?think>[\s\S]*?<\/think>/gi, '')
        .trim(),
    };
  });
}

function normalizeRawChunk(
  parsed: GoogleResponse,
  content: string,
): GoogleResponse {
  const choices = parsed.choices?.map((choice, index) => {
    if (index !== 0 || !choice.delta) return choice;

    const normalizedDelta = { ...choice.delta };
    delete normalizedDelta.reasoning_content;
    delete normalizedDelta.reasoning;

    return {
      ...choice,
      delta: { ...normalizedDelta, content },
    };
  });

  return choices ? { ...parsed, choices } : parsed;
}

export async function* parseGoogleSseStream(
  stream: Readable,
  includeThinking: boolean,
): AsyncGenerator<StreamChunk> {
  let buffer = '';
  let fullContent = '';
  let reasoningStarted = false;
  let reasoningClosed = false;
  let usage: AiUsage | undefined;
  let finishReason: string | null = null;

  const parseLine = (line: string): StreamChunk | null => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) return null;

    const data = trimmed.startsWith('data:')
      ? trimmed.slice(5).trim()
      : trimmed;
    if (!data || data === '[DONE]') return null;

    let parsed: GoogleResponse;
    try {
      parsed = JSON.parse(data) as GoogleResponse;
    } catch {
      throw new Error('Invalid SSE response from Google model');
    }

    usage = parsed.usage ?? usage;
    finishReason = parsed.choices?.[0]?.finish_reason ?? finishReason;

    const providerDelta = parsed.choices?.[0]?.delta;
    const reasoning = String(
      providerDelta?.reasoning_content ?? providerDelta?.reasoning ?? '',
    );
    const content = String(providerDelta?.content ?? '');
    let delta = '';

    if (includeThinking && reasoning) {
      if (!reasoningStarted) {
        reasoningStarted = true;
        delta += '<think>\n';
      }
      delta += reasoning;
    }

    if (content) {
      if (reasoningStarted && !reasoningClosed) {
        reasoningClosed = true;
        delta += '\n</think>\n';
      }
      delta += content;
    }

    fullContent += delta;
    return {
      delta,
      fullContent,
      complete: false,
      raw: normalizeRawChunk(parsed, delta),
      usage: parsed.usage,
      finishReason: parsed.choices?.[0]?.finish_reason,
    };
  };

  for await (const chunk of stream as AsyncIterable<Buffer>) {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const parsedChunk = parseLine(line);
      if (parsedChunk) yield parsedChunk;
    }
  }

  if (buffer.trim()) {
    const parsedChunk = parseLine(buffer);
    if (parsedChunk) yield parsedChunk;
  }

  if (reasoningStarted && !reasoningClosed) {
    const delta = '\n</think>';
    fullContent += delta;
    yield {
      delta,
      fullContent,
      complete: false,
      raw: {
        choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
      },
    };
  }

  yield {
    delta: '',
    fullContent,
    complete: true,
    usage,
    finishReason,
  };
}

@Injectable()
export class GoogleAiService {
  private readonly api: AxiosInstance = axios.create({
    timeout: 120_000,
    headers: {
      Authorization: `Bearer ${process.env.HYPA_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  private getRequestBody(
    messages: ChatMessage[],
    model: string,
    stream: boolean,
    options: GoogleChatOptions,
  ) {
    const thinking = options.thinking ?? true;

    return {
      model,
      messages: stripGoogleThinkingFromHistory(messages),
      stream,
      ...(stream && { stream_options: { include_usage: true } }),
      temperature: options.temperature ?? 1,
      top_p: options.top_p ?? 0.95,
      top_k: options.top_k ?? 64,
      max_tokens: options.max_tokens ?? 1000,
      ...(thinking && { reasoning_effort: 'low' }),
    };
  }

  async chatStream(
    messages: ChatMessage[],
    model: string,
    url: string,
    options: GoogleChatOptions = {},
  ): Promise<AsyncGenerator<StreamChunk>> {
    const thinking = options.thinking ?? true;
    const response = await this.api.post(
      url,
      this.getRequestBody(messages, model, true, options),
      { responseType: 'stream', signal: options.signal },
    );

    return parseGoogleSseStream(response.data as Readable, thinking);
  }

  async chatSync(
    messages: ChatMessage[],
    model: string,
    url: string,
    options: GoogleChatOptions = {},
  ): Promise<ChatSyncResult & { finishReason: string | null; raw: unknown }> {
    return this.postSync(
      url,
      this.getRequestBody(messages, model, false, options),
      options,
    );
  }

  private async postSync(
    url: string,
    body: unknown,
    options: GoogleChatOptions,
  ): Promise<ChatSyncResult & { finishReason: string | null; raw: unknown }> {
    const response = await this.api.post<GoogleResponse>(url, body, {
      signal: options.signal,
    });
    const message = response.data?.choices?.[0]?.message;
    const content = String(message?.content ?? '');
    const reasoning = String(
      message?.reasoning_content ?? message?.reasoning ?? '',
    );
    const usage = response.data?.usage;
    if (!usage) throw new Error('Model response usage unavailable');

    return {
      content: formatGoogleContent(
        content,
        reasoning,
        options.thinking ?? true,
      ),
      usage,
      finishReason: response.data?.choices?.[0]?.finish_reason ?? null,
      raw: response.data,
    };
  }
}

interface VertexChatOptions {
  max_tokens?: number;
  thinking?: boolean;
  signal?: AbortSignal;
}

interface VertexAudioOptions {
  max_tokens?: number;
  system_instruction?: string;
  signal?: AbortSignal;
}

interface VertexSpeechToTextResult {
  text: string;
  usage: AiUsage;
  finishReason: string | null;
  raw: unknown;
}

interface VertexTextToSpeechResult {
  audio_b64: string;
  audio_type: 'audio/wav';
  sample_rate: number;
  usage: AiUsage;
  finishReason: string | null;
  raw: unknown;
}

type VertexApiVersion = 'v1' | 'v1beta1';

const VERTEX_API_VERSION: VertexApiVersion = 'v1';
const VERTEX_TTS_API_VERSION: VertexApiVersion = 'v1beta1';
const VERTEX_38_TTS_MODELS = new Set([
  'gemini-3.8-flash-tts',
  'gemini-3.8-flash-lite-tts',
]);

function isVertex38TtsModel(model: string): boolean {
  return VERTEX_38_TTS_MODELS.has(model);
}

function getVertexTranscriptionPrompt(): string {
  const prompt = getProviderPrompt('ASR', 'google')?.system;
  if (!prompt) {
    throw new Error(
      'Missing ASR system prompt for provider "google" in the @hypa/config prompts catalog',
    );
  }

  return prompt;
}

export const VERTEX_SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/x-aac',
  'audio/flac',
  'audio/mp3',
  'audio/m4a',
  'audio/mpeg',
  'audio/mpga',
  'audio/mp4',
  'audio/ogg',
  'audio/pcm',
  'audio/wav',
  'audio/webm',
]);

interface VertexPart {
  text?: string | null;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
  audioTranscription?: unknown;
  [key: string]: unknown;
}

interface VertexContent {
  role?: 'user' | 'model';
  parts?: VertexPart[];
}

interface VertexUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
  toolUsePromptTokenCount?: number;
  promptTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
  candidatesTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
  [key: string]: unknown;
}

type VertexThinkingLevel = 'LOW' | 'MEDIUM' | 'HIGH';

interface VertexResponse {
  candidates?: Array<{
    content?: VertexContent;
    finishReason?: string | null;
    [key: string]: unknown;
  }>;
  usageMetadata?: VertexUsageMetadata;
  [key: string]: unknown;
}

interface VertexCountTokensResponse {
  totalTokens?: number;
  [key: string]: unknown;
}

const VERTEX_DEFAULT_MAX_OUTPUT_TOKENS = 1000;
const VERTEX_MAX_OUTPUT_TOKENS = 65536;

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function hasUsageMetadata(usage: VertexUsageMetadata): boolean {
  return [
    usage.promptTokenCount,
    usage.candidatesTokenCount,
    usage.thoughtsTokenCount,
    usage.totalTokenCount,
  ].some((value) => typeof value === 'number' && Number.isFinite(value));
}

function normalizeVertexUsage(
  usage?: VertexUsageMetadata | null,
  speechMode?: 'tts' | 'transcribe',
): AiUsage | undefined {
  if (!usage || !hasUsageMetadata(usage)) return undefined;

  if (speechMode) {
    const validCount = (value: unknown): value is number =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    if (
      !validCount(usage.promptTokenCount) ||
      !validCount(usage.candidatesTokenCount) ||
      [usage.thoughtsTokenCount, usage.toolUsePromptTokenCount].some(
        (value) => value !== undefined && (!validCount(value) || value !== 0),
      ) ||
      (usage.totalTokenCount !== undefined &&
        (!validCount(usage.totalTokenCount) ||
          usage.totalTokenCount !==
            usage.promptTokenCount + usage.candidatesTokenCount))
    ) {
      throw new Error('Invalid Gemini speech usage');
    }

    const checkModality = (
      details: VertexUsageMetadata['promptTokensDetails'],
      expected: string,
      total: number,
    ) => {
      if (details === undefined) return;
      if (
        !Array.isArray(details) ||
        details.length === 0 ||
        details.some(
          (part) =>
            !part || part.modality !== expected || !validCount(part.tokenCount),
        ) ||
        details.reduce((sum, part) => sum + part.tokenCount!, 0) !== total
      ) {
        throw new Error('Inconsistent Gemini speech modality usage');
      }
    };
    checkModality(
      usage.promptTokensDetails,
      speechMode === 'tts' ? 'TEXT' : 'AUDIO',
      usage.promptTokenCount,
    );
    checkModality(
      usage.candidatesTokensDetails,
      speechMode === 'tts' ? 'AUDIO' : 'TEXT',
      usage.candidatesTokenCount,
    );
  }

  const promptTokens = numberOrZero(usage.promptTokenCount);
  const candidateTokens = numberOrZero(usage.candidatesTokenCount);
  const thoughtsTokens = numberOrZero(usage.thoughtsTokenCount);
  const toolUsePromptTokens = numberOrZero(usage.toolUsePromptTokenCount);
  const totalTokens = numberOrZero(usage.totalTokenCount);

  return {
    ...(speechMode === 'tts'
      ? {
          input_text_tokens: promptTokens,
          output_audio_tokens: candidateTokens,
        }
      : speechMode === 'transcribe'
        ? { input_text_tokens: 0, input_audio_tokens: promptTokens }
        : {}),
    prompt_tokens: promptTokens,
    completion_tokens: candidateTokens + thoughtsTokens,
    total_tokens:
      typeof usage.totalTokenCount === 'number' &&
      Number.isFinite(usage.totalTokenCount)
        ? totalTokens
        : promptTokens + candidateTokens + thoughtsTokens + toolUsePromptTokens,
  };
}

function formatVertexContent(
  content: string,
  reasoning: string,
  includeThinking: boolean,
): string {
  const finalContent = content.trim();
  const reasoningContent = reasoning.trim();

  if (!includeThinking || !reasoningContent) return finalContent;

  return `<think>\n${reasoningContent}\n</think>${
    finalContent ? `\n${finalContent}` : ''
  }`;
}

function stripVertexThinkingFromHistory(
  messages: ChatMessage[],
): ChatMessage[] {
  return messages.map((message) => {
    if (message.role !== 'assistant') return message;

    return {
      ...message,
      content: message.content
        .replace(/<\|?think>[\s\S]*?<\/think>/gi, '')
        .trim(),
    };
  });
}

function getMaxOutputTokens(value?: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return VERTEX_DEFAULT_MAX_OUTPUT_TOKENS;
  }

  return Math.min(VERTEX_MAX_OUTPUT_TOKENS, Math.max(1, Math.floor(value)));
}

function buildVertexRequestBody(
  messages: ChatMessage[],
  options: VertexChatOptions = {},
) {
  const thinking = options.thinking ?? true;
  const cleanedMessages = stripVertexThinkingFromHistory(messages);
  const systemMessages = cleanedMessages.filter(
    (message) => message.role === 'system',
  );
  const contents = cleanedMessages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role:
        message.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: message.content }],
    }));

  return {
    ...(systemMessages.length > 0 && {
      systemInstruction: {
        parts: systemMessages.map((message) => ({ text: message.content })),
      },
    }),
    contents,
    generationConfig: {
      maxOutputTokens: getMaxOutputTokens(options.max_tokens),
      thinkingConfig: {
        thinkingLevel: (thinking ? 'MEDIUM' : 'LOW') as VertexThinkingLevel,
        includeThoughts: thinking,
      },
    },
  };
}

function buildVertexAudioContents(
  audioBase64: string,
  mimeType: string,
  instruction: string = getVertexTranscriptionPrompt(),
) {
  const parts: VertexPart[] = [];
  if (instruction !== '') {
    parts.push({ text: instruction });
  }
  parts.push({
    inlineData: {
      mimeType,
      data: audioBase64,
    },
  });

  return [
    {
      role: 'user' as const,
      parts,
    },
  ];
}

function buildVertexAudioRequestBody(
  audioBase64: string,
  mimeType: string,
  options: VertexAudioOptions = {},
) {
  return {
    contents: buildVertexAudioContents(
      audioBase64,
      mimeType,
      options.system_instruction,
    ),
    generationConfig: {
      maxOutputTokens: getMaxOutputTokens(options.max_tokens),
      thinkingConfig: {
        thinkingLevel: 'LOW' as const,
        includeThoughts: false,
      },
    },
  };
}

function buildVertexAudioCountTokensBody(
  audioBase64: string,
  mimeType: string,
  instruction: string = getVertexTranscriptionPrompt(),
) {
  return {
    contents: buildVertexAudioContents(audioBase64, mimeType, instruction),
  };
}

function buildVertexTranscribeRequestBody(
  audioBase64: string,
  mimeType: string,
) {
  return {
    contents: buildVertexAudioContents(audioBase64, mimeType, ''),
  };
}

function buildVertexTtsRequestBody(
  text: string,
  languageCode: string,
  voice: string,
  model?: string,
) {
  const gemini38 = isVertex38TtsModel(model ?? '');
  return {
    contents: [
      {
        role: 'user' as const,
        parts: [{ text }],
      },
    ],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        ...(gemini38 ? {} : { languageCode }),
        voiceConfig: gemini38
          ? { voice }
          : {
              prebuiltVoiceConfig: {
                voiceName: voice,
              },
            },
      },
    },
  };
}

function parsePcmMimeType(mimeType: string) {
  const [mediaType, ...parameters] = mimeType
    .split(';')
    .map((part) => part.trim().toLowerCase());
  if (mediaType !== 'audio/l16' && mediaType !== 'audio/pcm') {
    throw new Error(`Unsupported Gemini TTS audio type: ${mimeType}`);
  }

  const parameterMap = new Map(
    parameters.map((parameter) => {
      const [key, value] = parameter.split('=').map((part) => part.trim());
      return [key, value] as const;
    }),
  );
  const sampleRate = Number(parameterMap.get('rate') || 24000);
  const channels = Number(parameterMap.get('channels') || 1);

  if (
    !Number.isInteger(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isInteger(channels) ||
    channels <= 0
  ) {
    throw new Error(`Invalid Gemini TTS PCM audio type: ${mimeType}`);
  }

  return { sampleRate, channels };
}

function decodeVertexTtsAudio(
  audioBase64: string,
  mimeType: string,
): { audio_b64: string; sample_rate: number } {
  const mediaType = mimeType.split(';')[0]?.trim().toLowerCase();
  if (
    mediaType === 'audio/wav' ||
    mediaType === 'audio/x-wav' ||
    mediaType === 'audio/wave'
  ) {
    const wav = Buffer.from(audioBase64, 'base64');
    if (
      wav.length < 44 ||
      wav.toString('ascii', 0, 4) !== 'RIFF' ||
      wav.toString('ascii', 8, 12) !== 'WAVE'
    ) {
      throw new Error('Gemini TTS returned invalid WAV audio');
    }
    const sampleRate = wav.readUInt32LE(24);
    if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
      throw new Error('Gemini TTS returned invalid WAV audio');
    }
    return { audio_b64: audioBase64, sample_rate: sampleRate };
  }

  return wrapVertexPcmAsWav(audioBase64, mimeType);
}

function wrapVertexPcmAsWav(
  audioBase64: string,
  mimeType: string,
): { audio_b64: string; sample_rate: number } {
  const { sampleRate, channels } = parsePcmMimeType(mimeType);
  const pcm = Buffer.from(audioBase64, 'base64');
  if (pcm.length === 0 || pcm.length % 2 !== 0) {
    throw new Error('Gemini TTS returned invalid PCM audio');
  }

  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);

  return { audio_b64: wav.toString('base64'), sample_rate: sampleRate };
}

function sanitizeVertexValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeVertexValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) => key !== 'thoughtSignature' && key !== 'thought_signature',
        )
        .map(([key, item]) => [key, sanitizeVertexValue(item)]),
    );
  }

  return value;
}

async function* parseVertexSseStream(
  stream: Readable,
  includeThinking: boolean,
): AsyncGenerator<StreamChunk> {
  let buffer = '';
  let fullContent = '';
  let reasoningStarted = false;
  let reasoningClosed = false;
  let usage: AiUsage | undefined;
  let finishReason: string | null = null;

  const parseLine = (line: string): StreamChunk | null => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) return null;

    const data = trimmed.startsWith('data:')
      ? trimmed.slice(5).trim()
      : trimmed;
    if (!data || data === '[DONE]') return null;

    let parsed: VertexResponse;
    try {
      parsed = JSON.parse(data) as VertexResponse;
    } catch {
      throw new Error('Invalid SSE response from Gemini model');
    }

    const parsedUsage = normalizeVertexUsage(parsed.usageMetadata);
    usage = parsedUsage ?? usage;
    finishReason =
      parsed.candidates?.[0]?.finishReason === undefined
        ? finishReason
        : parsed.candidates[0].finishReason;

    let delta = '';
    const parts = parsed.candidates?.[0]?.content?.parts ?? [];

    for (const part of parts) {
      const text = typeof part.text === 'string' ? part.text : '';
      if (!text) continue;

      if (part.thought) {
        if (!includeThinking) continue;
        if (!reasoningStarted) {
          reasoningStarted = true;
          delta += '<think>\n';
        }
        delta += text;
        continue;
      }

      if (reasoningStarted && !reasoningClosed) {
        reasoningClosed = true;
        delta += '\n</think>\n';
      }
      delta += text;
    }

    fullContent += delta;
    return {
      delta,
      fullContent,
      complete: false,
      raw: sanitizeVertexValue(parsed),
      usage: parsedUsage,
      finishReason: parsed.candidates?.[0]?.finishReason,
    };
  };

  for await (const chunk of stream as AsyncIterable<Buffer>) {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const parsedChunk = parseLine(line);
      if (parsedChunk) yield parsedChunk;
    }
  }

  if (buffer.trim()) {
    const parsedChunk = parseLine(buffer);
    if (parsedChunk) yield parsedChunk;
  }

  if (reasoningStarted && !reasoningClosed) {
    const delta = '\n</think>';
    fullContent += delta;
    yield {
      delta,
      fullContent,
      complete: false,
      raw: {
        candidates: [
          {
            content: { parts: [{ text: delta }] },
          },
        ],
      },
    };
  }

  yield {
    delta: '',
    fullContent,
    complete: true,
    usage,
    finishReason,
  };
}

@Injectable()
export class GoogleVertexAiService {
  private readonly logger = new Logger(GoogleVertexAiService.name);

  private readonly api: AxiosInstance = axios.create({
    timeout: 120_000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  private getConfiguration() {
    const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
    const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || 'global';
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (!project) {
      throw new Error('GOOGLE_CLOUD_PROJECT is not configured');
    }
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    return { project, location, apiKey };
  }

  private getTtsEndpoint(baseApiUrl: string, model: string): string {
    return this.getVersionedEndpoint(
      baseApiUrl,
      model,
      false,
      isVertex38TtsModel(model) ? VERTEX_API_VERSION : VERTEX_TTS_API_VERSION,
    );
  }

  private getVersionedEndpoint(
    baseApiUrl: string,
    model: string,
    stream: boolean,
    apiVersion: VertexApiVersion = VERTEX_API_VERSION,
  ): string {
    const { project, location } = this.getConfiguration();
    const baseUrl = baseApiUrl.replace(/\/+$/, '');
    const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';

    return `${baseUrl}/${apiVersion}/projects/${encodeURIComponent(
      project,
    )}/locations/${encodeURIComponent(
      location,
    )}/publishers/google/models/${encodeURIComponent(model)}:${method}`;
  }

  private getRequestHeaders() {
    const { apiKey } = this.getConfiguration();
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    };
  }

  private getCountTokensEndpoint(baseApiUrl: string, model: string): string {
    return this.getVersionedEndpoint(baseApiUrl, model, false).replace(
      ':generateContent',
      ':countTokens',
    );
  }

  async countAudioTokens(
    audioBase64: string,
    mimeType: string,
    model: string,
    baseApiUrl: string,
    signal?: AbortSignal,
    instruction?: string,
  ): Promise<number | undefined> {
    try {
      const response = await this.api.post<VertexCountTokensResponse>(
        this.getCountTokensEndpoint(baseApiUrl, model),
        buildVertexAudioCountTokensBody(audioBase64, mimeType, instruction),
        {
          signal,
          headers: this.getRequestHeaders(),
        },
      );
      const totalTokens = response.data?.totalTokens;
      if (
        typeof totalTokens !== 'number' ||
        !Number.isFinite(totalTokens) ||
        totalTokens < 0
      ) {
        this.logger.warn({
          message:
            'Google audio token count unavailable; caller must use its documented estimate',
          model,
          reason: 'missing_or_invalid_count',
        });
        return undefined;
      }
      return Math.floor(totalTokens);
    } catch (error) {
      if (signal?.aborted) throw error;
      this.logger.warn({
        message:
          'Google audio token counting failed; caller must use its documented estimate',
        model,
        reason:
          axios.isAxiosError(error) && error.code === 'ECONNABORTED'
            ? 'timeout'
            : 'provider_error',
      });
      return undefined;
    }
  }

  private transcribeResponse(
    response: { data?: VertexResponse | undefined },
    outputLabel: string,
  ): VertexSpeechToTextResult {
    const candidate = response.data?.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const text = parts
      .filter((part) => part.thought !== true)
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim();
    const usage = normalizeVertexUsage(
      response.data?.usageMetadata,
      outputLabel === 'Gemini Transcribe' ? 'transcribe' : undefined,
    );

    if (!usage) throw new Error(`${outputLabel} response usage unavailable`);

    return {
      text,
      usage,
      finishReason: candidate?.finishReason ?? null,
      raw: sanitizeVertexValue(response.data ?? {}),
    };
  }

  async speechToTextSync(
    audioBase64: string,
    mimeType: string,
    model: string,
    baseApiUrl: string,
    options: VertexAudioOptions = {},
  ): Promise<VertexSpeechToTextResult> {
    const response = await this.api.post<VertexResponse>(
      this.getVersionedEndpoint(baseApiUrl, model, false),
      buildVertexAudioRequestBody(audioBase64, mimeType, options),
      {
        signal: options.signal,
        headers: this.getRequestHeaders(),
      },
    );

    return this.transcribeResponse(response, 'Gemini ASR');
  }

  async transcribeSync(
    audioBase64: string,
    mimeType: string,
    model: string,
    baseApiUrl: string,
    signal?: AbortSignal,
  ): Promise<VertexSpeechToTextResult> {
    const response = await this.api.post<VertexResponse>(
      this.getVersionedEndpoint(baseApiUrl, model, false),
      buildVertexTranscribeRequestBody(audioBase64, mimeType),
      {
        signal,
        headers: this.getRequestHeaders(),
      },
    );

    return this.transcribeResponse(response, 'Gemini Transcribe');
  }

  async textToSpeechSync(
    text: string,
    languageCode: string,
    voice: string,
    model: string,
    baseApiUrl: string,
    signal?: AbortSignal,
  ): Promise<VertexTextToSpeechResult> {
    const response = await this.api.post<VertexResponse>(
      this.getTtsEndpoint(baseApiUrl, model),
      buildVertexTtsRequestBody(text, languageCode, voice, model),
      {
        signal,
        headers: this.getRequestHeaders(),
      },
    );

    const candidate = response.data?.candidates?.[0];
    const audioPart = (candidate?.content?.parts ?? []).find(
      (part) =>
        typeof part.inlineData?.data === 'string' &&
        part.inlineData.data.length > 0,
    );
    const usage = normalizeVertexUsage(response.data?.usageMetadata, 'tts');

    if (!usage) throw new Error('Gemini TTS response usage unavailable');
    if (!audioPart?.inlineData?.data || !audioPart.inlineData.mimeType) {
      throw new Error('Gemini TTS response audio unavailable');
    }

    const wav = decodeVertexTtsAudio(
      audioPart.inlineData.data,
      audioPart.inlineData.mimeType,
    );

    return {
      ...wav,
      audio_type: 'audio/wav',
      usage,
      finishReason: candidate?.finishReason ?? null,
      raw: sanitizeVertexValue(response.data),
    };
  }

  async chatStream(
    messages: ChatMessage[],
    model: string,
    baseApiUrl: string,
    options: VertexChatOptions = {},
  ): Promise<AsyncGenerator<StreamChunk>> {
    const response = await this.api.post(
      this.getVersionedEndpoint(baseApiUrl, model, true),
      buildVertexRequestBody(messages, options),
      {
        responseType: 'stream',
        signal: options.signal,
        headers: this.getRequestHeaders(),
      },
    );

    return parseVertexSseStream(
      response.data as Readable,
      options.thinking ?? true,
    );
  }

  async chatSync(
    messages: ChatMessage[],
    model: string,
    baseApiUrl: string,
    options: VertexChatOptions = {},
  ): Promise<ChatSyncResult & { finishReason: string | null; raw: unknown }> {
    const response = await this.api.post<VertexResponse>(
      this.getVersionedEndpoint(baseApiUrl, model, false),
      buildVertexRequestBody(messages, options),
      {
        signal: options.signal,
        headers: this.getRequestHeaders(),
      },
    );

    const parts = response.data?.candidates?.[0]?.content?.parts ?? [];
    const content = parts
      .filter((part) => !part.thought)
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('');
    const reasoning = parts
      .filter((part) => part.thought)
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('');
    const thinking = options.thinking ?? true;
    const usage = normalizeVertexUsage(response.data?.usageMetadata);

    if (!usage) throw new Error('Gemini response usage unavailable');

    return {
      content: formatVertexContent(content, reasoning, thinking),
      usage,
      finishReason: response.data?.candidates?.[0]?.finishReason ?? null,
      raw: sanitizeVertexValue(response.data),
    };
  }
}
