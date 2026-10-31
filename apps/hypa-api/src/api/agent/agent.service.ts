import { type ChatFileInput } from '@hypa/config/chat-attachments';
import { validateChatFiles } from './chat-files';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { LAB_TURN_TIMEOUT_MS, MODEL_REQUEST_TIMEOUT_MS, textOutputTokens } from '@hypa/config/request-policy';
import { withRequestDeadline, requestCancelled } from 'src/ai/request-deadline';
import { AGENT_MAX_TOOL_ROUNDS, AGENT_SPEND_CAP_USD, AGENT_WALL_CLOCK_MS } from '@hypa/config/agent';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { getAgentSystemPrompt } from '@hypa/config/prompts';
import { getModelRate, isAssistantModel, MODELS } from '@hypa/config/models';
import {
  HYPA_TOOLS,
  runHypaTool,
  toFunctionTools,
  type FunctionTool,
} from '@hypa/intelligence-core';
import { parseBuffer } from 'music-metadata';
import { Prisma } from 'src/generated/prisma/client';
import { developer_request_type } from 'src/generated/prisma/enums';
import { DbService } from 'src/libs/db/db.service';
import { type providerKey } from '../developer/developer.dto';
import { DeveloperSharedService } from '../developer/providers/shared.service';
import { AgentMediaService, keysFromMessage } from './agent.media';
import { anonymousPayerId, HypaToolExecutor } from './tool-executor';
import {
  isAbortError,
  runAgentLoop,
  type AgentEvent,
  type LoopMessage,
  type ModelStep,
  type Usage,
} from './agent.loop';
import { decideRun, hashAgentInput, type StoredRun } from './agent.runs';
import { AGENT_CLIENTS, completeAgentTurn, modelAcceptsImages, type AgentClients, type AgentModelOptions } from './agent.transport';
import { verifyMediaUrl } from './media-url';
import { agentFailure } from './agent.errors';
import { SpendCap } from 'src/libs/shared/spend-cap';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TOKEN_HOLD = 2048;
const FINISHED_JOB_TTL_MS = 10 * 60 * 1000;
const STALE_RUN_GRACE_MS = 60 * 1000;
const STALE_RUN_ERROR = {
  type: 'error' as const,
  code: 'agent_failed',
  message: 'This request was interrupted. Send it again.',
};
const AUDIO_ATTACHED = 'The app plays this audio under your reply. Do not write a link to it.';
const audioReference = (id: string) => `Place this audio in your reply with [Play audio](#audio-${id}). Keep this exact reference for this clip.`;

export interface AgentJob {
  requestId: string;
  userId?: string;
  hash: string;
  status: 'running' | 'done' | 'failed';
  events: AgentEvent[];
  chatId?: string;
  finished: Promise<void>;
  controller?: AbortController;
}

export interface OpenAgentInput {
  requestId: string;
  userId?: string;
  lab?: boolean;
  /** Run without a chat, agent_run row or history: for high-volume callers such as Lens. Billing still applies. */
  ephemeral?: boolean;
  input: string;
  toolNames?: string[];
  systemInstruction?: string;
  modelOptions?: AgentModelOptions;
  provider: string;
  model: string;
  surface: 'app' | 'keyboard';
  chatId?: string;
  language?: string;
  audio?: string;
  audioType?: 'base64' | 'url';
  asr?: { provider: string; model: string };
  preferAudio?: boolean;
  context?: { fieldText?: string; selectedText?: string };
  attachments?: { data: string; mime?: string }[];
  files?: ChatFileInput[];
  history?: { role: 'user' | 'assistant'; content: string }[];
}

@Injectable()
export class AgentService {
  private readonly jobs = new Map<string, AgentJob>();
  complete: (input: {
    provider: string;
    model: string;
    messages: LoopMessage[];
    tools: FunctionTool[];
    signal?: AbortSignal;
    options?: AgentModelOptions;
    onTextDelta?: (text: string) => void;
  }) => Promise<ModelStep> = (input) => {
    if (!this.clients) throw new Error('No model transport');
    return completeAgentTurn(this.clients, input);
  };

  constructor(
    private readonly db: DbService,
    private readonly billing: DeveloperSharedService,
    private readonly media: AgentMediaService,
    @Optional() private readonly tools?: HypaToolExecutor,
    @Optional() @Inject(AGENT_CLIENTS) private readonly clients?: AgentClients,
    @Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache,
  ) {}

  async open(input: OpenAgentInput): Promise<AgentJob> {
    this.assertRequest(input);
    const hash = hashAgentInput({
      input: input.input,
      provider: input.provider,
      model: input.model,
      surface: input.surface,
      context: input.context ?? null,
      attachments: (input.attachments ?? []).map((item) => item.data),
      audio: input.audio ?? null,
      ...(input.files?.length ? { files: input.files } : {}),
      asr: input.asr ?? null,
      ...(input.history?.length ? { history: input.history } : {}),
      ...(input.toolNames !== undefined ? { toolNames: [...new Set(input.toolNames)].sort() } : {}),
      ...(input.systemInstruction !== undefined ? { systemInstruction: input.systemInstruction } : {}),
      ...(input.modelOptions ? { modelOptions: input.modelOptions } : {}),
    });
    const live = this.jobs.get(input.requestId);
    if (live) {
      if (live.userId !== input.userId || live.hash !== hash) {
        throw new ConflictException('requestId was already used');
      }
      return live;
    }
    if (input.userId && !input.ephemeral) {
      const existing = (await this.db.agent_run.findUnique({
        where: { request_id: input.requestId },
      })) as StoredRun | null;
      const decision = decideRun(existing, input.userId, hash);
      if (decision.kind === 'conflict') {
        throw new ConflictException('requestId was already used');
      }
      if (decision.kind === 'replay') {
        const live = this.jobs.get(input.requestId);
        if (live) return live;
        if (existing && (await this.closeIfStale(input.requestId, existing))) {
          return this.storedJob(input.requestId, 'failed', null, STALE_RUN_ERROR);
        }
        const stored = this.storedJob(input.requestId, decision.status, decision.result, decision.error);
        if (decision.status === 'done') {
          const audio = await this.freshAudio(input.userId, input.requestId);
          if (audio.audioUrl) stored.events.unshift({ type: 'audio', url: audio.audioUrl });
        }
        return stored;
      }
    }
    const started = this.jobs.get(input.requestId);
    if (started) {
      if (started.userId !== input.userId || started.hash !== hash) {
        throw new ConflictException('requestId was already used');
      }
      return started;
    }
    let resolveFinished: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    const job: AgentJob = {
      requestId: input.requestId,
      userId: input.userId,
      hash,
      status: 'running',
      controller: new AbortController(),
      events: [],
      finished,
    };
    this.jobs.set(input.requestId, job);
    const wallClockMs = input.lab ? LAB_TURN_TIMEOUT_MS : AGENT_WALL_CLOCK_MS;
    void withRequestDeadline(job.controller!.signal, wallClockMs, 'Agent turn', (signal) => this.execute(job, input, hash, signal))
      .catch(async (error: unknown) => {
        const partialText = (error as { partialText?: unknown } | null)?.partialText;
        if (typeof partialText === 'string' && partialText) this.push(job, { type: 'delta', text: partialText });
        const failure = agentFailure(error);
        this.push(job, failure);
        job.status = 'failed';
        const lostCreate = (error as { code?: string } | null)?.code === 'P2002';
        if (input.userId && !lostCreate && !input.ephemeral) {
          try {
            const stored = await this.db.agent_run.findUnique({ where: { request_id: input.requestId } });
            if (stored) await this.db.agent_run.update({
              where: { request_id: input.requestId },
              data: { status: 'failed', error: jsonValue(failure) },
            });
          } catch {
            console.error('Could not save failed agent run', input.requestId);
          }
        }
      })
      .finally(async () => {
        await this.rememberAnonymous(job);
        resolveFinished();
        setTimeout(() => {
          if (this.jobs.get(job.requestId) === job) this.jobs.delete(job.requestId);
        }, FINISHED_JOB_TTL_MS).unref();
      });
    return job;
  }

  cancel(job: AgentJob) {
    if (job.status === 'running') job.controller?.abort(requestCancelled());
  }

  subscribe(job: AgentJob, listener: (event: AgentEvent | null) => void): () => void {
    let index = 0;
    let stopped = false;
    const pump = () => {
      if (stopped) return;
      while (index < job.events.length) listener(job.events[index++]);
      if (job.status !== 'running' || this.jobs.get(job.requestId) !== job) {
        stopped = true;
        listener(null);
      }
    };
    pump();
    if (stopped) return () => undefined;
    const timer = setInterval(pump, 20);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  async status(
    userId: string | undefined,
    requestId: string,
  ): Promise<Omit<AnonymousResult, 'status'> & { status: string; chatId?: string }> {
    const live = this.jobs.get(requestId);
    if (live && !live.userId) return this.anonymousView(live);
    if (!userId) {
      const cached = await this.cache?.get<AnonymousResult>(anonymousKey(requestId));
      if (!cached) throw new NotFoundException();
      return cached;
    }
    if (live) {
      if (live.userId !== userId) throw new NotFoundException();
      const run = await this.db.agent_run.findUnique({ where: { request_id: requestId } });
      if (run && run.user_id !== userId) throw new NotFoundException();
      return {
        status: live.status,
        chatId: live.chatId,
        message: live.status === 'done' ? this.visibleMessage(live.events) : '',
        action: live.status === 'done' ? this.lastDone(live.events)?.action : undefined,
        ...(await this.freshAudio(userId, requestId)),
      };
    }
    const run = await this.db.agent_run.findUnique({ where: { request_id: requestId } });
    if (!run || run.user_id !== userId) throw new NotFoundException();
    if (await this.closeIfStale(requestId, run)) return { status: 'failed', message: '' };
    const stored = run.status === 'done' ? this.doneFromResult(run.result) : null;
    return {
      status: run.status,
      chatId: run.chat_id ?? undefined,
      message: run.status === 'done' ? this.messageFromResult(run.result) : '',
      action: stored?.type === 'done' ? stored.action : undefined,
      ...(await this.freshAudio(userId, requestId)),
    };
  }

  async readMedia(key: string, exp: number, sig: string) {
    if (!verifyMediaUrl(key, exp, sig, Date.now(), this.media.secret())) {
      throw new NotFoundException();
    }
    const bytes = await this.media.get(key);
    if (!bytes) throw new NotFoundException();
    return bytes;
  }

  async deleteChat(userId: string, chatId: string) {
    const messages = await this.db.message.findMany({
      where: { chatId, chat: { userId } },
      select: { audio_key: true, attachments: true, tool_trace: true },
    });
    await this.media.remove(messages.flatMap((message) => keysFromMessage(message)));
    await this.db.message.deleteMany({ where: { chatId, chat: { userId } } });
    await this.db.chat.delete({ where: { id: chatId, userId } });
  }

  async deleteUserMedia(userId: string) {
    const messages = await this.db.message.findMany({
      where: { chat: { userId } },
      select: { audio_key: true, attachments: true, tool_trace: true },
    });
    await this.media.remove(messages.flatMap((message) => keysFromMessage(message)));
    await this.db.agent_run.deleteMany({ where: { user_id: userId } });
    await this.db.agent_step.deleteMany({ where: { user_id: userId } });
  }

  private assertRequest(input: OpenAgentInput) {
    validateChatFiles(input.files ?? []);
    if (input.files?.some((file) => file.mime.startsWith('audio/')) && input.toolNames && !input.toolNames.includes('speech_to_text')) {
      throw new BadRequestException('Enable Speech to text in Tools to send audio.');
    }
    if (input.files?.some((file) => file.mime.startsWith('image/')) && !modelAcceptsImages(input.provider, input.model) && input.toolNames && !input.toolNames.includes('extract_text_from_image')) {
      throw new BadRequestException('Enable Extract text from image in Tools for this model.');
    }

    if (input.toolNames?.some((name) => !HYPA_TOOLS.some((tool) => tool.name === name))) {
      throw new BadRequestException('Unknown tool selection');
    }
    if (!isAssistantModel(input.provider, input.model)) {
      throw new BadRequestException(`${input.provider}/${input.model} cannot call tools`);
    }
    if (!input.input.trim() && !input.audio && !input.attachments?.length) {
      throw new BadRequestException('Send a message, a voice note or a photo');
    }
    const field = input.context?.fieldText ?? '';
    const selected = input.context?.selectedText ?? '';
    if (field.length > 5000 || selected.length > 5000) {
      throw new BadRequestException('Keyboard context is limited to 5000 characters');
    }
    if ((input.attachments?.length ?? 0) > 4) {
      throw new BadRequestException('At most 4 images');
    }
    for (const attachment of input.attachments ?? []) {
      if (Buffer.from(attachment.data, 'base64').length > MAX_IMAGE_BYTES) {
        throw new BadRequestException('Each image must be 5 MB or smaller');
      }
    }
  }

  private async closeIfStale(requestId: string, run: { status: string; updated_at?: Date }) {
    if (run.status !== 'running' || !run.updated_at) return false;
    if (Date.now() - run.updated_at.getTime() < Math.max(AGENT_WALL_CLOCK_MS, LAB_TURN_TIMEOUT_MS) + STALE_RUN_GRACE_MS) return false;
    await this.db.agent_run.updateMany({
      where: { request_id: requestId, status: 'running' },
      data: { status: 'failed', error: jsonValue(STALE_RUN_ERROR) },
    });
    return true;
  }

  private storedJob(requestId: string, status: string, result: unknown, error?: unknown): AgentJob {
    const event = this.doneFromResult(result);
    const job: AgentJob = {
      requestId,
      hash: '',
      status: status === 'running' ? 'running' : status === 'failed' ? 'failed' : 'done',
      events: status === 'done' && event ? [event] : status === 'failed'
        ? [agentFailure(error)] : [],
      finished: Promise.resolve(),
    };
    return job;
  }

  private async execute(job: AgentJob, input: OpenAgentInput, hash: string, signal: AbortSignal) {
    const userId = input.userId;
    const sentAt = new Date();
    const userMessageId = randomUUID();
    const assistantMessageId = randomUUID();
    if (userId && !input.ephemeral) {
      await this.db.agent_run.create({
        data: {
          request_id: input.requestId,
          user_id: userId,
          input_hash: hash,
          status: 'running',
        },
      });
      job.chatId = await this.ensureChat(userId, input);
      if (input.modelOptions || input.systemInstruction !== undefined) {
        await this.db.chat.update({
          where: { id: job.chatId, userId },
          data: {
            provider: input.provider,
            model_name: input.model,
            system_instruction: input.systemInstruction,
            output_length: input.modelOptions?.max_tokens,
            temperature: input.modelOptions?.temperature,
            top_p: input.modelOptions?.top_p,
          },
        });
      }
    }
    this.push(job, { type: 'message_ids', userMessageId, assistantMessageId, sentAt: sentAt.toISOString() });
    const payerId = userId ?? anonymousPayerId();
    signal.throwIfAborted();
    const abort = { signal };
    let step = 0;
    let toolSpent = 0;
    let modelSpent = 0;
    const spend = new SpendCap(AGENT_SPEND_CAP_USD, () => modelSpent);
    let audioKey: string | undefined;
    let inlineAudio: string | undefined;
    let audioMime: string | undefined;
    const audioUrl = () => (audioKey ? this.media.url(audioKey) : inlineAudio);
    const clips = new Map<string, { key?: string; url: string; mime: string; durationMs?: number }>();
    const rates = this.rates(input.provider, input.model);
    const claimStep = async (kind: string, cost: number) => {
      if (!payerId) return false;
      const index = step;
      step += 1;
      try {
        await this.db.agent_step.create({
          data: {
            request_id: input.requestId,
            step: index,
            user_id: payerId,
            kind,
            cost,
          },
        });
        return true;
      } catch (error) {
        if (this.isUnique(error)) return false;
        throw error;
      }
    };
    const chargeModel = async (usage: Usage) => {
      const cost = this.billing.calculateCost({ usage, rates });
      if (!payerId || cost <= 0) {
        modelSpent += cost;
        return;
      }
      await this.billing.checkBalance(payerId, cost);
      if (!(await claimStep('model', cost))) return;
      await this.billing.deductBalance(payerId, cost);
      modelSpent += cost;
      if (isLedgerProvider(input.provider)) {
        const apiKey = await this.billing.findOrCreateUserApiKey(payerId);
        await this.billing.recordDevRequest({
          body: { provider: input.provider, model: input.model },
          type: developer_request_type.chat,
          usage,
          rates,
          userId: payerId,
          apiKeyId: apiKey.id,
          actualCost: cost,
        });
      }
    };
    const selectedTools = input.toolNames === undefined
      ? HYPA_TOOLS
      : HYPA_TOOLS.filter((tool) => input.toolNames!.includes(tool.name));
    const runTool = async (name: string, args: Record<string, unknown>) => {
      if (!selectedTools.some((tool) => tool.name === name)) {
        throw new Error(`Tool ${name} is not enabled for this message`);
      }
      if (!payerId || !this.tools) {
        throw new Error('Tools are not available for this request');
      }
      const tool = HYPA_TOOLS.find((entry) => entry.name === name);
      if (!tool) throw new Error(`Unknown tool ${name}`);
      const apiKey = await this.billing.findOrCreateUserApiKey(payerId);
      let cost = 0;
      const executor = this.tools.forCaller({
        userId: payerId,
        apiKeyId: apiKey.id,
        signal: abort.signal,
        asr: input.asr,
        spend,
        onStep: (step) => {
          cost += step.cost;
        },
      });
      let result: Record<string, unknown>;
      try {
        result = await runHypaTool(tool, executor, args);
      } finally {
        toolSpent += cost;
        await claimStep('tool', cost);
      }
      if ('audioBase64' in result) {
        const { audioBase64, mime, ...rest } = result as { audioBase64?: string; mime: string };
        if (!audioBase64) return { ok: false, error: 'Speech returned no audio' };
        const bytes = Buffer.from(audioBase64, 'base64');
        const durationMs = await audioDurationMs(bytes, mime);
        const extra = durationMs ? { durationMs } : {};
        const key = userId ? await this.media.put(userId, bytes) : undefined;
        const url = key ? this.media.url(key) : `data:${mime};base64,${audioBase64}`;
        audioKey = key;
        inlineAudio = key ? undefined : url;
        audioMime = mime;
        const id = randomUUID();
        clips.set(id, { key, url, mime, ...extra });
        return { ...rest, mime, ...extra, audioId: id, audio: input.lab ? audioReference(id) : AUDIO_ATTACHED };
      }
      return result;
    };
    const modelHoldCost = (messages: LoopMessage[]) => {
      const text = JSON.stringify(messages.map((message) => ({
        ...message,
        ...(message.images?.length ? { images: message.images.map(() => '[image]') } : {}),
      })));
      const images = messages.reduce((count, message) => count + (message.images?.length ?? 0), 0);
      const promptTokens = this.billing.getTextNumberOfTokens(text) + images * IMAGE_TOKEN_HOLD;
      const completionTokens = textOutputTokens(input.modelOptions?.max_tokens);
      return this.billing.calculateCost({
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
        rates,
      });
    };
    let userText = input.input;
    const imageNotes: string[] = [];
    const images: string[] = [];
    const storedImages: { key: string; mime?: string; name?: string; size?: number; transcript?: string; extractedText?: string }[] = [];
    const imageStores = new Map<string, (typeof storedImages)[number]>();
    const trace: AgentEvent[] = [];
    let done: Extract<AgentEvent, { type: 'done' }> | undefined;
    const imageText = new WeakMap<LoopMessage, LoopMessage>();
    const emit = (event: AgentEvent) => { this.push(job, event); trace.push(event); };
    const prepareFile = async (name: string, args: Record<string, unknown>, file: string) => {
      const id = randomUUID();
      const started = Date.now();
      emit({ type: 'tool_call', id, name, args: { file } });
      try {
        const result = await runTool(name, args);
        emit({ type: 'tool_result', id, name, ok: true, result, durationMs: Date.now() - started });
        return result;
      } catch (error) {
        emit({ type: 'tool_result', id, name, ok: false, error: agentFailure(error).message, durationMs: Date.now() - started });
        throw error;
      }
    };
    try {
    const uploaded = [] as { file: ChatFileInput; stored?: (typeof storedImages)[number] }[];
    for (const file of input.files ?? []) {
      const bytes = Buffer.from(file.data, 'base64');
      const stored = userId ? { key: await this.media.put(userId, bytes), mime: file.mime, name: file.name, size: bytes.length } : undefined;
      if (stored) storedImages.push(stored);
      uploaded.push({ file, stored });
    }
    for (const { file, stored } of uploaded) {
      if (file.mime.startsWith('audio/')) {
        const result = await prepareFile('speech_to_text', { audio: `data:${file.mime};base64,${file.data}`, audioType: 'base64' }, file.name);
        const transcript = String((result as { transcript?: string })?.transcript ?? '');
        if (!transcript.trim()) throw new BadRequestException('No speech was found in the audio.');
        if (stored) stored.transcript = transcript;
        imageNotes.push(`Transcript of ${file.name}:\n${transcript}`);
      } else if (modelAcceptsImages(input.provider, input.model)) {
        const image = `data:${file.mime};base64,${file.data}`;
        images.push(image);
        if (stored) imageStores.set(image, stored);
        imageNotes.push(`Image ${images.length}: ${file.name}`);
      } else {
        const result = await prepareFile('extract_text_from_image', { image: `data:${file.mime};base64,${file.data}` }, file.name);
        const text = String((result as { text?: string })?.text ?? '');
        if (stored) stored.extractedText = text;
        imageNotes.push(`Text in ${file.name}:\n${text}`);
      }
    }
    if (input.audio) {
      if (!payerId) throw new BadRequestException('Voice input is not available right now');
      const heard = await runTool('speech_to_text', {
        audio: input.audio,
        audioType: input.audioType ?? 'base64',
      });
      userText =
        heard && typeof heard === 'object' && 'transcript' in heard
          ? String((heard as { transcript?: string }).transcript ?? '')
          : input.input;
      this.push(job, { type: 'transcript', text: userText });
    }
    const vision = modelAcceptsImages(input.provider, input.model);
    for (const attachment of input.attachments ?? []) {
      let stored: (typeof storedImages)[number] | undefined;
      if (userId) {
        const key = await this.media.put(userId, Buffer.from(attachment.data, 'base64'));
        stored = { key, mime: attachment.mime };
        storedImages.push(stored);
      }
      if (vision) {
        const image = `data:${attachment.mime ?? 'image/jpeg'};base64,${attachment.data}`;
        images.push(image);
        if (stored) imageStores.set(image, stored);
      } else if (payerId) {
        const read = await runTool('extract_text_from_image', { image: attachment.data });
        const text = typeof read === 'object' && read && 'text' in read ? String((read as { text?: string }).text) : '';
        if (stored) stored.extractedText = text;
        imageNotes.push(text);
      }
    }
    const history: LoopMessage[] = userId && job.chatId
      ? await this.history(job.chatId, userId, vision)
      : userId ? [] : (input.history ?? []).slice(-20).map(({ role, content }) => ({ role, content }));
    const contextLines = [
      input.context?.selectedText ? `Selected text:\n${input.context.selectedText}` : '',
      input.context?.fieldText
        ? `Field text:\n${input.context.fieldText}`
        : input.surface === 'keyboard' && !input.context?.selectedText
          ? 'Field text: (empty)'
          : '',
    ].filter(Boolean);
    const modelUser = [userText || 'Help me with the attached files.', ...contextLines, ...imageNotes.filter(Boolean)].join('\n\n');
    const tools = payerId ? toFunctionTools(selectedTools) : [];
    if (input.surface === 'keyboard') tools.push(finishTool());
    const messages: LoopMessage[] = [
      { role: 'system', content: input.systemInstruction ?? getAgentSystemPrompt() },
      ...history,
      { role: 'user', content: modelUser, images: images.length ? images : undefined },
    ];
    for await (let event of runAgentLoop({
      messages,
      tools,
      surface: input.surface,
      instruction: input.input,
      speechLanguage: input.language,
      signal: abort.signal,
      limits: {
        maxToolRounds: AGENT_MAX_TOOL_ROUNDS,
        wallClockMs: input.lab ? LAB_TURN_TIMEOUT_MS : AGENT_WALL_CLOCK_MS,
        spendCapUsd: AGENT_SPEND_CAP_USD,
        maxCompletionTokens: textOutputTokens(input.modelOptions?.max_tokens),
      },
      complete: async (next, nextTools, onTextDelta) => {
        const send = (messages: LoopMessage[]) => withRequestDeadline(abort.signal, MODEL_REQUEST_TIMEOUT_MS, 'Model request', (signal) => this.complete({
          provider: input.provider,
          model: input.model,
          messages,
          tools: nextTools,
          signal,
          options: input.modelOptions,
          onTextDelta,
        }));
        const outgoing = () => next.map((message) => imageText.get(message) ?? message);
        const runModel = async (messages: LoopMessage[]) => {
          const hold = spend.reserve(modelHoldCost(messages));
          try {
            const result = await send(messages);
            await chargeModel(result.usage);
            return result;
          } finally {
            spend.release(hold);
          }
        };
        try {
          return await runModel(outgoing());
        } catch (error) {
          if (isAbortError(error) || abort.signal.aborted) throw error;
          const withImages = next.filter((message) => message.images?.length && !imageText.has(message));
          if (!withImages.length || !payerId || !isImageRequestError(error)) throw error;
          for (const message of withImages) {
            const texts: string[] = [];
            for (const [index, image] of (message.images ?? []).entries()) {
              let read: unknown;
              try {
                read = await runTool('extract_text_from_image', { image });
              } catch (ocrError) {
                throw imageRecoveryError(error, ocrError);
              }
              const text = String((read as { text?: string }).text ?? '').trim();
              if (!text) throw imageRecoveryError(error, new Error('The image reader returned no text.'));
              const stored = imageStores.get(image);
              if (stored) stored.extractedText = text;
              texts.push(`Text in image ${index + 1}:\n${text}`);
            }
            imageText.set(message, { ...message, images: undefined, content: [message.content, ...texts].join('\n\n') });
          }
          return runModel(outgoing());
        }
      },
      runTool,
      extraSpend: () => Math.max(toolSpent, spend.charged) + spend.reserved,
      costOf: (usage) => this.billing.calculateCost({ usage, rates }),
      affordable: userId
        ? (estimate) => this.billing.hasBalance(userId, estimate)
        : undefined,
    })) {
      if (event.type === 'tool_result' && event.ok) {
        const id = (event.result as { audioId?: string } | undefined)?.audioId;
        const clip = id ? clips.get(id) : undefined;
        if (clip && id) {
          const audio: AgentEvent = { type: 'audio', id, toolCallId: event.id, url: clip.url, mime: clip.mime, durationMs: clip.durationMs };
          this.push(job, audio);
          trace.push({ ...audio, key: clip.key });
        }
      }
      const url = audioUrl();
      if (event.type === 'audio' && url) {
        const [id, clip] = [...clips.entries()].at(-1)!;
        event = { ...event, id, url: clip.url, mime: clip.mime, durationMs: clip.durationMs };
      }
      if (event.type === 'done') {
        event.completedAt = new Date().toISOString();
        event.cost = modelSpent + toolSpent;
      }
      if (event.type === 'done' && url) {
        event.audioUrl = url;
        if (audioMime) event.audioMime = audioMime;
      }
      this.push(job, event);
      trace.push(event.type === 'audio' && event.id ? { ...event, key: clips.get(event.id)?.key } : event);
      if (event.type === 'done') done = event;
    }
    if (input.preferAudio && done && !done.speak && payerId) {
      const spoken = await runTool('text_to_speech', {
        text: done.text,
        language: input.language || 'English',
      });
      const url = audioUrl();
      if (url && spoken && typeof spoken === 'object') {
        const [id, clip] = [...clips.entries()].at(-1)!;
        const event: AgentEvent = { type: 'audio', id, url, mime: clip.mime, durationMs: clip.durationMs };
        this.push(job, event);
        trace.push({ ...event, key: clip.key });
      }
    }
    } catch (error) {
      const partialText = (error as { partialText?: unknown } | null)?.partialText;
      if (typeof partialText === 'string' && partialText) {
        const delta: AgentEvent = { type: 'delta', text: partialText };
        this.push(job, delta);
        trace.push(delta);
      }
      const failure = agentFailure(error);
      this.push(job, failure);
      trace.push(failure);
      done = undefined;
    }
    if (signal.aborted) {
      done = undefined;
      const failure = agentFailure(signal.reason);
      if (!trace.some((event) => event.type === 'error' && event.code === failure.code)) trace.push(failure);
    }
    if (!userId || input.ephemeral) {
      job.status = done ? 'done' : 'failed';
      return;
    }
    await this.db.message.create({
      data: {
        chatId: job.chatId,
        id: userMessageId,
        role: 'user',
        created_at: sentAt,
        content: userText,
        attachments: storedImages.length ? storedImages : undefined,
      },
    });
    await this.db.message.create({
      data: {
        chatId: job.chatId,
        id: assistantMessageId,
        role: 'assistant',
        created_at: done?.completedAt ? new Date(done.completedAt) : new Date(),
        content: trace.filter((event) => event.type === 'delta').map((event) => event.text).join('') || done?.text || '',
        request_id: input.requestId,
        audio_key: audioKey,
        tool_trace: jsonValue(storedTrace(trace, input.context)),
      },
    });
    await this.db.agent_run.update({
      where: { request_id: input.requestId },
      data: {
        status: done ? 'done' : 'failed',
        chat_id: job.chatId,
        result: done ? jsonValue({ ...done, audioUrl: undefined }) : Prisma.JsonNull,
        error: done ? Prisma.JsonNull : jsonValue(trace.find((event) => event.type === 'error') ?? agentFailure(null)),
      },
    });
    job.status = done ? 'done' : 'failed';
  }

  private push(job: AgentJob, event: AgentEvent) {
    if (job.status !== 'running') return;
    const previous = job.events.at(-1);
    if (event.type === 'error' && previous?.type === 'error' && event.code === previous.code && event.message === previous.message) return;
    const withChat = job.chatId ? { ...event, chatId: job.chatId } : event;
    job.events.push(withChat as AgentEvent);
  }

  private async ensureChat(userId: string, input: OpenAgentInput) {
    if (input.chatId) {
      const chat = await this.db.chat.findFirst({
        where: { id: input.chatId, userId },
        select: { id: true },
      });
      if (!chat) throw new NotFoundException();
      return chat.id;
    }
    if (input.surface === 'keyboard') {
      const chat = await this.db.chat.upsert({
        where: { userId_kind: { userId, kind: 'keyboard' } },
        create: { title: 'Keyboard', kind: 'keyboard', userId },
        update: { archive: false },
        select: { id: true },
      });
      return chat.id;
    }
    const created = await this.db.chat.create({
      data: {
        title: 'New Chat',
        provider: input.provider,
        model_name: input.model,
        user: { connect: { id: userId } },
      },
      select: { id: true },
    });
    return created.id;
  }

  private async history(chatId: string, userId: string, vision = false): Promise<LoopMessage[]> {
    const rows = await this.db.message.findMany({
      where: { chatId, chat: { userId } },
      orderBy: { created_at: 'desc' },
      take: 20,
      select: { role: true, content: true, attachments: true },
    });
    return Promise.all(rows.reverse().map(async (row) => {
      const notes: string[] = [];
      const images: string[] = [];
      for (const attachment of Array.isArray(row.attachments) ? row.attachments : []) {
        if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) continue;
        if (typeof attachment.transcript === 'string') notes.push(`Transcript of ${attachment.name ?? 'audio'}: ${attachment.transcript}`);
        if (typeof attachment.extractedText === 'string') notes.push(`Text in ${attachment.name ?? 'image'}: ${attachment.extractedText}`);
        if (vision && typeof attachment.key === 'string' && typeof attachment.mime === 'string' && attachment.mime.startsWith('image/')) {
          const bytes = await this.media.get(attachment.key);
          if (bytes) {
            images.push(`data:${attachment.mime};base64,${bytes.toString('base64')}`);
            notes.push(`Image ${images.length}: ${attachment.name ?? 'image'}`);
          }
        }
      }
      return { role: row.role, content: [row.content ?? '', ...notes].join('\n\n'), ...(images.length ? { images } : {}) };
    }));
  }

  private rates(provider: string, model: string) {
    const row = MODELS[provider]?.find((entry) => entry.name === model);
    if (!row) throw new BadRequestException('Unknown model');
    const capability = row.capabilities.includes('AC') ? 'AC' : row.capabilities[0];
    const rate = getModelRate(row, capability);
    return {
      input: (rate.inputPerMillionTokens ?? 0) / 1_000_000,
      output: (rate.outputPerMillionTokens ?? 0) / 1_000_000,
    };
  }

  private doneFromResult(result: unknown): AgentEvent | null {
    if (!result || typeof result !== 'object' || !('type' in result)) return null;
    return result as AgentEvent;
  }

  private async freshAudio(userId: string, requestId: string) {
    const message = await this.db.message.findFirst({
      where: { request_id: requestId, chat: { userId } },
      select: { audio_key: true },
    });
    if (!message?.audio_key) return {};
    return { audioUrl: this.media.url(message.audio_key) };
  }

  private inlineAudio(events: AgentEvent[]) {
    for (const event of [...events].reverse()) {
      if (event.type === 'done' && event.audioUrl) return event.audioUrl;
      if (event.type === 'audio') return event.url;
    }
    return undefined;
  }

  private anonymousView(job: AgentJob): AnonymousResult {
    const done = job.status === 'done';
    return {
      status: job.status,
      message: done ? this.visibleMessage(job.events) : '',
      action: done ? this.lastDone(job.events)?.action : undefined,
      audioUrl: done ? this.inlineAudio(job.events) : undefined,
    };
  }

  private async rememberAnonymous(job: AgentJob) {
    if (job.userId || !this.cache) return;
    try {
      const view = { ...this.anonymousView(job), audioUrl: undefined };
      await this.cache.set(anonymousKey(job.requestId), view, ANONYMOUS_RESULT_TTL_MS);
    } catch {
    }
  }

  private lastDone(events: AgentEvent[]) {
    const done = [...events].reverse().find((event) => event.type === 'done');
    return done && done.type === 'done' ? done : undefined;
  }

  private visibleMessage(events: AgentEvent[]) {
    return this.lastDone(events)?.text ?? '';
  }

  private messageFromResult(result: unknown) {
    const event = this.doneFromResult(result);
    return event && event.type === 'done' ? event.text : '';
  }

  private isUnique(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}

function isImageRequestError(error: unknown) {
  const source = error as {
    status?: number;
    code?: string;
    message?: string;
    response?: { status?: number; data?: unknown };
  } | null;
  const status = source?.status ?? source?.response?.status;
  if (status === 413 || status === 415 || status === 422) return true;
  if (status !== 400) return false;
  const detail = `${JSON.stringify(source?.response?.data ?? '')} ${source?.message ?? ''} ${source?.code ?? ''}`;
  return /image|vision|media|mime|image_url|unsupported\s+(content|file|type)|invalid\s+(image|file|media)/i.test(detail);
}

function imageRecoveryError(modelError: unknown, ocrError: unknown) {
  const error = new Error(
    `The model could not use the image, and reading it also failed. ` +
    `Model error: ${errorText(modelError)}. Image error: ${errorText(ocrError)}`,
  ) as Error & { cause?: unknown };
  error.cause = { model: modelError, ocr: ocrError };
  return error;
}

function errorText(error: unknown) {
  const source = error as {
    message?: string;
    response?: { data?: { error?: { message?: string } } };
  } | null;
  return source?.response?.data?.error?.message ?? source?.message ?? String(error);
}

function isLedgerProvider(provider: string): provider is providerKey {
  return [
    'hypaai',
    'google',
    'openai',
    'anthropic',
    'microsoft',
    'elevenlabs',
    'yarnGPT',
    'mansa',
    'meta',
    'custom',
  ].includes(provider);
}

function storedTrace(
  events: AgentEvent[],
  context?: { fieldText?: string; selectedText?: string },
): AgentEvent[] {
  const hidden = [context?.fieldText, context?.selectedText].filter(
    (value): value is string => Boolean(value),
  );
  return events.map((event) => {
    if (event.type === 'audio') {
      return {
        type: 'audio',
        ...(event.id ? { id: event.id } : {}),
        ...(event.key ? { key: event.key } : {}),
        ...(event.toolCallId ? { toolCallId: event.toolCallId } : {}),
        ...(event.mime ? { mime: event.mime } : {}),
        durationMs: event.durationMs,
        url: '',
      };
    }
    if (event.type === 'tool_call') {
      return { ...event, args: redactValue(event.args, hidden) };
    }
    if (event.type === 'tool_result') {
      return {
        ...event,
        ...(event.result !== undefined ? { result: redactValue(event.result, hidden) } : {}),
        ...(event.summary ? { summary: redactText(event.summary, hidden) } : {}),
        ...(event.error ? { error: redactText(event.error, hidden) } : {}),
      };
    }
    if (event.type === 'done') return { ...event, audioUrl: undefined };
    return event;
  });
}

function redactText(value: string, hidden: string[]) {
  return hidden.reduce((text, secret) => text.split(secret).join('[private]'), value);
}

function redactValue(value: unknown, hidden: string[]): unknown {
  if (typeof value === 'string') return redactText(value, hidden);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, hidden));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        redactValue(item, hidden),
      ]),
    );
  }
  return value;
}

async function audioDurationMs(bytes: Buffer, mime: string) {
  try {
    const metadata = await parseBuffer(bytes, { mimeType: mime });
    const seconds = metadata.format.duration;
    return seconds && Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined;
  } catch {
    return undefined;
  }
}

const ANONYMOUS_RESULT_TTL_MS = 15 * 60 * 1000;
const anonymousKey = (requestId: string) => `agent-anon:${requestId}`;

export interface AnonymousResult {
  status: AgentJob['status'];
  message: string;
  action?: 'replace' | 'insert' | 'show';
  audioUrl?: string;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function finishTool(): FunctionTool {
  return {
    type: 'function',
    function: {
      name: 'finish',
      description:
        'End a keyboard turn. replace: the text replaces the field or the selection (an edit or a translation). insert: the field is empty, so the text is added to it. show: the text is shown and the field stays unchanged (a question about the text, or reading it out). Set speak to true to also read the text aloud, and do not call text_to_speech for that. "Read this out" alone is show with speak true. summary is a short past-tense note of what you did, under 40 characters, for example "Your draft, rewritten politely.". If you need more information before you can act, use show, ask one short question as the text, and put up to 3 short likely answers in suggestions; the user can tap one to reply.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['replace', 'insert', 'show'] },
          text: { type: 'string' },
          speak: { type: 'boolean' },
          summary: { type: 'string' },
          suggestions: { type: 'array', items: { type: 'string' }, maxItems: 3 },
        },
        required: ['action', 'text', 'speak'],
      },
    },
  };
}
