import { AUTO_ROUTING_TIMEOUTS, TEXT_TOOL_TIMEOUT_MS, SPEECH_TOOL_TIMEOUT_MS } from '@hypa/config/request-policy';
import { withRequestDeadline } from 'src/ai/request-deadline';
import { EventEmitter } from 'events';
import type { Request } from 'express';
import { lastValueFrom, type Observable } from 'rxjs';
import {
  buildMtRequest,
  buildSttRequest,
  buildTtsRequest,
  getCatalogMtModelName,
  mapMtResponse,
  unwrapSttResponse,
} from '@hypa/translate-core';
import type { ModelCapability } from '@hypa/config/models';
import {
  AUTO_CAPABILITIES,
  toolModelChoices,
  type HypaExecutor,
  type RanOn,
} from '@hypa/intelligence-core';
import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { DictionaryController } from '../dictionary/dictionary.controller';
import { WordOfTheDayService } from '../dictionary/word-of-the-day.service';
import { TranslateController } from '../translate/translate.controller';
import { AGENT_CLIENTS, completeAgentTurn, modelAcceptsImages, type AgentClients } from './agent.transport';
import type {
  DeveloperMtDto,
  DeveloperSpeechToTextDto,
  DeveloperTtsDto,
} from '../developer/developer.dto';
import { DeveloperSharedService } from '../developer/providers/shared.service';
import type { AiUsage } from 'src/ai/ai.types';
import { detectAudioMime } from 'src/libs/shared/audio-mime';
import type { SpendCap } from 'src/libs/shared/spend-cap';

export interface ToolCaller {
  userId: string;
  apiKeyId: string;
  signal?: AbortSignal;
  asr?: { provider: string; model: string };
  onStep?: (step: { cost: number } & RanOn) => void | Promise<void>;
  spend?: SpendCap;
}

export function anonymousPayerId(): string | undefined {
  return process.env.AGENT_ANONYMOUS_USER_ID?.trim() || undefined;
}

export type ToolChoice = { provider: string; model?: string } | null;

export function resolveToolModel(
  capability: ModelCapability,
  requested: unknown,
  override?: { provider: string; model: string },
): ToolChoice {
  const id = typeof requested === 'string' ? requested.trim() : '';
  const auto = AUTO_CAPABILITIES.has(capability) ? { provider: 'auto' } : null;
  if (id === 'default') return null;
  if (id === 'auto') return auto;
  if (id) {
    if (!toolModelChoices(capability).includes(id)) {
      throw new BadRequestException(`${id} is not available here. Use "auto", "default", or an id from list_models.`);
    }
    const slash = id.indexOf('/');
    return { provider: id.slice(0, slash), model: id.slice(slash + 1) };
  }
  return override ?? auto;
}

const OCR_MODEL = { provider: 'meta', model: 'muse-spark-1.3' };
const OCR_PROMPT =
  'Copy all the text in this image exactly as written, line by line. Keep numbers, doses, prices and units unchanged. Reply with the text only.';

type ProviderResult = {
  response?: {
    audio_b64?: string;
    audio_type?: string | null;
    sample_rate?: number | null;
    text?: string;
  };
  usage?: AiUsage & { character_count?: number };
  provider?: string;
  model?: string;
  voice?: string;
};

@Injectable()
export class HypaToolExecutor {
  constructor(
    private readonly translateApi: TranslateController,
    private readonly dictionary: DictionaryController,
    private readonly billing: DeveloperSharedService,
    private readonly words: WordOfTheDayService,
    @Optional() @Inject(AGENT_CLIENTS) private readonly clients?: AgentClients,
  ) {}

  forCaller(caller: ToolCaller): HypaExecutor {
    const paid = <T>(work: () => Promise<T>) => (caller.spend ? caller.spend.step(work) : work());
    const run = <T>(capability: 'MT' | 'ASR' | 'TTS' | 'OCR', model: string | undefined, execute: (caller: ToolCaller) => Promise<T>) => {
      const choice = resolveToolModel(capability, model, capability === 'ASR' ? caller.asr : undefined);
      const timeoutMs = choice?.provider === 'auto' && capability !== 'OCR'
        ? AUTO_ROUTING_TIMEOUTS[capability].deadlineMs
        : capability === 'ASR' || capability === 'TTS' ? SPEECH_TOOL_TIMEOUT_MS : TEXT_TOOL_TIMEOUT_MS;
      return paid(() => withRequestDeadline(caller.signal, timeoutMs, `${capability} tool`, (signal) => execute({ ...caller, signal })));
    };
    return {
      translate: (input) => run('MT', input.model, (next) => this.translate(next, input)),
      speak: (input) => run('TTS', input.model, (next) => this.speak(next, input)),
      transcribe: (input) => run('ASR', input.model, (next) => this.transcribe(next, input)),
      lookUp: (input) => paid(() => withRequestDeadline(caller.signal, TEXT_TOOL_TIMEOUT_MS, 'Dictionary tool', (signal) => this.lookUp({ ...caller, signal }, input))),
      readImage: (input) => run('OCR', input.model, (next) => this.readImage(next, input)),
      wordOfTheDay: () => withRequestDeadline(caller.signal, TEXT_TOOL_TIMEOUT_MS, 'Word of the day', () => this.words.getWordOfTheDay()),
    };
  }

  private async translate(
    caller: ToolCaller,
    input: Parameters<HypaExecutor['translate']>[0],
  ) {
    const choice = resolveToolModel('MT', input.model);
    const built = buildMtRequest({
      text: input.text,
      targetLang: input.targetLang,
      sourceLang: input.sourceLang,
      llmModel: choice ? undefined : getCatalogMtModelName(),
    });
    const body = { ...built.body, ...routed(choice) } as DeveloperMtDto;
    delete (body as Partial<DeveloperMtDto>).max_tokens;
    const payload = await withToolRequest(caller, async (req) =>
      lastValueFrom((await this.translateApi.translateText(body, req)) as Observable<{ data: unknown }>),
    );
    const text = typeof payload.data === 'string' ? payload.data : JSON.stringify(payload.data ?? '');
    const parsed = parseJson<ProviderResult>(text);
    const mapped = mapMtResponse(text, { sourceLang: input.sourceLang }, built.translationId);
    const usage = parsed?.usage ?? this.estimateUsage(body.text, mapped.translation);
    const ran = await this.report(caller, 'MT', { ...parsed, usage }, body);
    return { translation: mapped.translation, language: mapped.language, ...ran };
  }

  private async speak(caller: ToolCaller, input: Parameters<HypaExecutor['speak']>[0]) {
    const choice = resolveToolModel('TTS', input.model);
    const built = buildTtsRequest({ text: input.text, voice: '' });
    const target = { ...built, ...routed(choice) };
    const voice =
      input.voice ??
      (target.provider === 'auto'
        ? undefined
        : (this.defaultVoice(target.provider, target.model, input.language) ??
          (choice ? undefined : built.voice)));
    const body = { ...target, language: input.language, voice } as DeveloperTtsDto;
    const result = (await withToolRequest(caller, (req) => this.translateApi.generateTts(body, req))) as ProviderResult;
    const ran = await this.report(caller, 'TTS', result, body, body.text.length);
    const audioBase64 = result.response?.audio_b64 ?? '';
    const label = result.response?.audio_type?.split(';')[0].trim().toLowerCase();
    const mime = label?.startsWith('audio/')
      ? label
      : (detectAudioMime(Buffer.from(audioBase64.slice(0, 16), 'base64')) ?? 'application/octet-stream');
    return {
      audioBase64,
      mime,
      sampleRate: result.response?.sample_rate ?? undefined,
      voice: result.voice ?? voice,
      ...ran,
    };
  }

  private async transcribe(
    caller: ToolCaller,
    input: Parameters<HypaExecutor['transcribe']>[0],
  ) {
    const choice = resolveToolModel('ASR', input.model, caller.asr);
    const built = buildSttRequest({ audioBase64: input.audio, sourceLang: input.sourceLang });
    const body = {
      ...built,
      ...routed(choice),
      audio_type: input.audioType === 'url' ? 'url' : built.audio_type,
    } as DeveloperSpeechToTextDto;
    const result = (await withToolRequest(caller, (req) => this.translateApi.speechToText(body, req))) as ProviderResult;
    const ran = await this.report(caller, 'ASR', result, body);
    return { transcript: unwrapSttResponse(result as never), ...ran };
  }

  private async readImage(
    caller: ToolCaller,
    input: Parameters<HypaExecutor['readImage']>[0],
  ) {
    if (!this.clients) throw new Error('No model transport');
    const requested = input.model?.includes('/') ? input.model.split('/') : undefined;
    const target = requested && modelAcceptsImages(requested[0], requested[1])
      ? { provider: requested[0], model: requested[1] }
      : OCR_MODEL;
    const image = input.imageType === 'url' || input.image.startsWith('data:')
      ? input.image
      : `data:image/jpeg;base64,${input.image}`;
    const step = await completeAgentTurn(this.clients, {
      ...target,
      messages: [{ role: 'user', content: OCR_PROMPT, images: [image] }],
      tools: [],
      signal: caller.signal,
    });
    const ran = await this.report(caller, 'OCR', { usage: step.usage }, target);
    return { text: step.text.trim(), ...ran };
  }

  private async lookUp(caller: ToolCaller, input: Parameters<HypaExecutor['lookUp']>[0]) {
    const result = await withToolRequest(caller, (req) =>
      this.dictionary.search({ word: input.word, language: input.language } as never, { id: caller.userId } as never, req),
    );
    await caller.onStep?.({ cost: 0, provider: 'hypaai' });
    return { result: (result ?? {}) as Record<string, unknown>, provider: 'hypaai' };
  }

  private async report(
    caller: ToolCaller,
    capability: 'MT' | 'TTS' | 'ASR' | 'OCR',
    parsed: ProviderResult | null,
    fallback: { provider: string; model?: string },
    characterCount?: number,
  ): Promise<RanOn> {
    const provider = parsed?.provider ?? fallback.provider;
    const model = parsed?.model ?? fallback.model;
    const cost = this.costOf(provider, model, capability, parsed?.usage, characterCount);
    await caller.onStep?.({ cost, provider, model });
    return { provider, model };
  }

  private estimateUsage(input: string, output: string): AiUsage {
    const prompt = this.billing.getTextNumberOfTokens(input);
    const completion = this.billing.getTextNumberOfTokens(output);
    return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
  }

  private defaultVoice(provider: string, model: string | undefined, language: string) {
    const modelData = this.billing.getModelInfo({ provider: provider as 'openai', model: model ?? '', type: 'TTS' });
    const voices = (modelData?.voices ?? {}) as Record<string, string[]>;
    return voices[language.toLowerCase()]?.[0];
  }

  private costOf(
    provider: string,
    model: string | undefined,
    type: 'MT' | 'TTS' | 'ASR' | 'OCR',
    usage?: AiUsage & { character_count?: number },
    characterCount?: number,
  ) {
    if (!model) return 0;
    const modelData = this.billing.getModelInfo({ provider: provider as 'openai', model, type });
    if (!modelData?.rates) return 0;
    try {
      if (modelData.charge_type === 'character_count') {
        return this.billing.calculateCost({
          usage: usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          rates: modelData.rates,
          chargeType: 'character_count',
          additionalData: { characterCount: usage?.character_count ?? characterCount ?? 0 },
        });
      }
      if (!usage) return 0;
      return this.billing.calculateCost({ usage, rates: modelData.rates });
    } catch {
      return 0;
    }
  }
}

function routed(choice: ToolChoice): { provider?: string; model?: string } {
  if (!choice) return {};
  if (choice.provider === 'auto') return { provider: 'auto', model: undefined };
  return { provider: choice.provider, model: choice.model };
}

async function withToolRequest<T>(caller: ToolCaller, run: (req: Request) => Promise<T> | T): Promise<T> {
  caller.signal?.throwIfAborted();
  const res = Object.assign(new EventEmitter(), { writableEnded: false });
  const onAbort = () => res.emit('close');
  caller.signal?.addEventListener('abort', onAbort, { once: true });
  const req = { userId: caller.userId, apiKeyId: caller.apiKeyId, headers: {}, res, signal: caller.signal } as unknown as Request;
  try { return await run(req); }
  finally { caller.signal?.removeEventListener('abort', onAbort); }
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
